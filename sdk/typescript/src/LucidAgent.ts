import { createHash, randomUUID } from 'crypto';
import { LucidSDK } from './LucidSDK';

/**
 * LucidAgent — high-level wrapper for AI agents in the Lucid verified network.
 *
 * Handles inference routing, automatic receipt creation, and identity propagation.
 * Uses the Lucid API for receipts and any OpenAI-compatible endpoint for inference.
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
  }

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

    // Auto-create receipt (fire and forget)
    let receiptId: string | undefined;
    try {
      const result = await this.sdk.receipts.lucidCreateReceipt({
        model_passport_id: opts.model,
        agent_passport_id: this.passportId,
        input_hash: createHash('sha256').update(opts.prompt).digest('hex'),
        output_hash: createHash('sha256').update(text).digest('hex'),
        latency_ms: Date.now() - start,
        timestamp: Date.now(),
      } as any);
      receiptId = (result as any)?.receipt_id;
    } catch {
      // Don't break inference on receipt failure
    }

    return { text, usage, receipt_id: receiptId, passport_id: this.passportId };
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
