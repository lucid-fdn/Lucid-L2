import { createHash, randomUUID } from 'crypto';
import { LucidSDK } from './LucidSDK';

/** Pending receipt for retry queue */
interface PendingReceipt {
  data: Record<string, unknown>;
  attempts: number;
  nextRetryAt: number;
}

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = [1000, 2000, 5000, 15000, 30000]; // exponential-ish
const MAX_QUEUE_SIZE = 1000;

/**
 * LucidAgent — high-level wrapper for AI agents in the Lucid verified network.
 *
 * Handles inference routing, automatic receipt creation, and identity propagation.
 * Uses the Lucid API for receipts and any OpenAI-compatible endpoint for inference.
 * Failed receipts are queued in-memory and retried with exponential backoff.
 *
 * ```typescript
 * import { LucidAgent } from '@lucid-fdn/sdk';
 *
 * const agent = new LucidAgent({ apiKey: 'lk_...' });
 * const result = await agent.run({ model: 'gpt-4o', prompt: 'Hello' });
 * // Receipt already created. Identity attached. Done.
 * ```
 */
export class LucidAgent {
  private sdk: LucidSDK;
  private passportId: string;
  private providerUrl: string;
  private providerApiKey: string;
  private receiptQueue: PendingReceipt[] = [];
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: {
    /** Lucid API key (from lucid.foundation dashboard) */
    apiKey: string;
    /** Lucid API base URL */
    apiUrl?: string;
    /** Agent passport ID (auto-created if not provided) */
    passportId?: string;
    /** Inference provider URL (any OpenAI-compatible endpoint) */
    providerUrl?: string;
    /** Inference provider API key */
    providerApiKey?: string;
  }) {
    this.sdk = new LucidSDK({
      BASE: opts.apiUrl || process.env.LUCID_API_URL || 'http://localhost:3001',
      TOKEN: opts.apiKey,
    });
    this.passportId = opts.passportId || process.env.LUCID_PASSPORT_ID || '';
    this.providerUrl = opts.providerUrl || process.env.PROVIDER_URL || '';
    this.providerApiKey = opts.providerApiKey || process.env.PROVIDER_API_KEY || '';
    this.startRetryLoop();
  }

  /** Process retry queue every 5 seconds */
  private startRetryLoop() {
    this.retryTimer = setInterval(() => this.flushQueue(), 5000);
    this.retryTimer.unref(); // Don't block process exit
  }

  /** Attempt to send all pending receipts that are due for retry */
  private async flushQueue() {
    const now = Date.now();
    const due = this.receiptQueue.filter(r => r.nextRetryAt <= now);
    for (const pending of due) {
      try {
        await this.sdk.receipts.lucidCreateReceipt(pending.data as any);
        this.receiptQueue = this.receiptQueue.filter(r => r !== pending);
      } catch {
        pending.attempts++;
        if (pending.attempts >= MAX_RETRY_ATTEMPTS) {
          this.receiptQueue = this.receiptQueue.filter(r => r !== pending);
        } else {
          pending.nextRetryAt = now + RETRY_BACKOFF_MS[pending.attempts] || 30000;
        }
      }
    }
  }

  /** Queue a receipt for creation, with retry on failure */
  private enqueueReceipt(data: Record<string, unknown>) {
    if (this.receiptQueue.length >= MAX_QUEUE_SIZE) {
      this.receiptQueue.shift(); // Drop oldest if queue is full
    }
    this.receiptQueue.push({ data, attempts: 0, nextRetryAt: 0 });
    // Try immediately (non-blocking)
    this.flushQueue().catch(() => {});
  }

  /** Stop the retry loop (for cleanup/testing) */
  destroy() {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = null;
  }

  /** Number of receipts pending retry */
  get pendingReceipts() { return this.receiptQueue.length; }

  /**
   * Run inference with automatic receipt creation.
   *
   * Calls the inference provider, then creates a cryptographic receipt
   * on the Lucid API. The receipt links this execution to the agent's
   * passport for reputation building.
   */
  async run(opts: {
    /** Model identifier (e.g., 'gpt-4o', 'claude-3-5-sonnet') */
    model: string;
    /** User prompt */
    prompt: string;
    /** System prompt override */
    system?: string;
    /** Additional messages for chat context */
    messages?: Array<{ role: string; content: string }>;
  }): Promise<{
    text: string;
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
    receipt_id?: string;
    passport_id: string;
  }> {
    if (!this.providerUrl) {
      throw new Error('PROVIDER_URL not set. Set providerUrl in constructor or PROVIDER_URL env var.');
    }

    const start = Date.now();
    const messages = opts.messages || [];
    if (opts.system) messages.unshift({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: opts.prompt });

    // Call inference provider (any OpenAI-compatible endpoint)
    const response = await fetch(`${this.providerUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.providerApiKey ? { 'Authorization': `Bearer ${this.providerApiKey}` } : {}),
      },
      body: JSON.stringify({ model: opts.model, messages }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Inference failed (${response.status}): ${err}`);
    }

    const data = await response.json() as any;
    const text = data.choices?.[0]?.message?.content || '';
    const usage = data.usage ? {
      inputTokens: data.usage.prompt_tokens || 0,
      outputTokens: data.usage.completion_tokens || 0,
      totalTokens: data.usage.total_tokens || 0,
    } : undefined;

    // Auto-create receipt (queued with retry — never blocks inference)
    this.enqueueReceipt({
      model_passport_id: opts.model,
      agent_passport_id: this.passportId,
      input_hash: createHash('sha256').update(opts.prompt).digest('hex'),
      output_hash: createHash('sha256').update(text).digest('hex'),
      latency_ms: Date.now() - start,
      timestamp: Date.now(),
    });

    return { text, usage, passport_id: this.passportId };
  }

  /**
   * Create or retrieve the agent's passport.
   */
  async ensurePassport(opts: {
    owner: string;
    name: string;
  }): Promise<string> {
    if (this.passportId) return this.passportId;

    const result = await this.sdk.passports.lucidCreatePassport({
      type: 'agent',
      owner: opts.owner,
      name: opts.name,
      metadata: {
        agent_config: {
          system_prompt: `Agent: ${opts.name}`,
          model_passport_id: 'user-provided',
        },
        deployment_config: {
          target: { type: 'self_hosted' },
        },
      },
    } as any);

    this.passportId = (result as any)?.passportId || (result as any)?.passport_id || '';
    return this.passportId;
  }

  /**
   * Launch this agent to a deployment target.
   */
  async launch(opts: {
    image: string;
    target: string;
    owner: string;
  }) {
    return this.sdk.agentLaunch.lucidLaunchAgent({
      mode: 'image',
      image: opts.image,
      target: opts.target,
      owner: opts.owner,
      name: `agent-${this.passportId || randomUUID().slice(0, 8)}`,
    } as any);
  }

  /** Access the underlying SDK for advanced operations */
  get api() { return this.sdk; }
}
