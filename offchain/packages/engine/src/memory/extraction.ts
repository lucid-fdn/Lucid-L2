import type { IMemoryStore } from './store/interface';
import type { MemoryServiceConfig, EpisodicMemory, ValidatedExtractionResult } from './types';
import { sha256Hex } from '../crypto/hash';

// ─── Extraction Response Validation ─────────────────────────────────

export function validateExtractionResponse(
  raw: unknown,
  maxFacts: number = 20,
  maxRules: number = 10,
): ValidatedExtractionResult {
  const warnings: string[] = [];
  const result: ValidatedExtractionResult = { facts: [], rules: [], warnings };

  if (!raw || typeof raw !== 'object') {
    warnings.push('Extraction response is not an object');
    return result;
  }

  const obj = raw as Record<string, any>;

  // Schema version check
  if (!obj.schema_version) {
    warnings.push('Missing schema_version, assuming 1.0');
  } else if (obj.schema_version !== '1.0') {
    warnings.push(`Unsupported schema_version: ${obj.schema_version} — rejecting entire response`);
    return result;
  }

  // Validate facts
  if (Array.isArray(obj.facts)) {
    for (const f of obj.facts) {
      if (!f || typeof f.fact !== 'string' || !f.fact.trim()) {
        warnings.push(`Dropped malformed fact: missing or empty fact string`);
        continue;
      }
      if (typeof f.confidence !== 'number' || f.confidence < 0 || f.confidence > 1) {
        warnings.push(`Dropped fact "${f.fact.slice(0, 30)}": invalid confidence`);
        continue;
      }
      result.facts.push({ fact: f.fact, confidence: f.confidence });
    }
  }

  // Validate rules
  if (Array.isArray(obj.rules)) {
    for (const r of obj.rules) {
      if (!r || typeof r.rule !== 'string' || !r.rule.trim()) {
        warnings.push(`Dropped malformed rule: missing or empty rule string`);
        continue;
      }
      if (typeof r.trigger !== 'string' || !r.trigger.trim()) {
        warnings.push(`Dropped rule "${r.rule.slice(0, 30)}": missing trigger`);
        continue;
      }
      const priority = typeof r.priority === 'number' ? r.priority : 0;
      result.rules.push({ rule: r.rule, trigger: r.trigger, priority });
    }
  }

  // Cap
  if (result.facts.length > maxFacts) {
    warnings.push(`Facts capped from ${result.facts.length} to ${maxFacts}`);
    result.facts = result.facts.slice(0, maxFacts);
  }
  if (result.rules.length > maxRules) {
    warnings.push(`Rules capped from ${result.rules.length} to ${maxRules}`);
    result.rules = result.rules.slice(0, maxRules);
  }

  return result;
}

// ─── Extraction Pipeline ────────────────────────────────────────────

export class ExtractionPipeline {
  private locks = new Map<string, boolean>();
  private lastRun = new Map<string, number>();
  private processedKeys = new Set<string>();
  private extractionDisabled = false;
  private backoffUntil = 0;

  constructor(
    private service: { addSemantic: Function; addProcedural: Function },
    private store: IMemoryStore,
    private config: MemoryServiceConfig,
  ) {}

  async maybeExtract(session_id: string, agent_passport_id: string, namespace: string): Promise<void> {
    // Check batch size threshold
    const episodics = await this.store.query({
      agent_passport_id,
      session_id,
      types: ['episodic'],
      status: ['active'],
      limit: this.config.max_episodic_window,
      order_by: 'created_at',
      order_dir: 'desc',
    });

    if (episodics.length < this.config.extraction_batch_size) return;

    // Check debounce
    const lastRun = this.lastRun.get(session_id) || 0;
    if (Date.now() - lastRun < this.config.extraction_debounce_ms) return;

    await this.runExtraction(session_id, agent_passport_id, namespace, episodics as EpisodicMemory[]);
  }

  async extractOnSessionClose(session_id: string, agent_passport_id: string, namespace: string): Promise<void> {
    const episodics = await this.store.query({
      agent_passport_id,
      session_id,
      types: ['episodic'],
      status: ['active'],
      limit: this.config.max_episodic_window,
      order_by: 'created_at',
      order_dir: 'asc',
    });

    if (episodics.length === 0) return;

    await this.runExtraction(session_id, agent_passport_id, namespace, episodics as EpisodicMemory[]);
  }

  private async runExtraction(
    session_id: string, agent_passport_id: string, namespace: string,
    episodics: EpisodicMemory[],
  ): Promise<void> {
    // Per-session lock
    if (this.locks.get(session_id)) return;
    this.locks.set(session_id, true);

    try {
      // Idempotency: hash the content of the episodic entries
      const contentKey = sha256Hex(episodics.map(e => e.content_hash).join(':'));
      if (this.processedKeys.has(contentKey)) return;

      this.lastRun.set(session_id, Date.now());

      // Load existing semantic facts for dedup
      const existingFacts = await this.store.query({
        agent_passport_id,
        namespace,
        types: ['semantic'],
        status: ['active'],
        limit: 100,
      });

      // Build prompt context
      const conversationContext = episodics
        .map(e => `[${e.role}]: ${e.content}`)
        .join('\n');

      const existingFactsList = existingFacts
        .map(f => (f as any).fact || f.content)
        .join('\n');

      const extracted = await this.callLLM(conversationContext, existingFactsList);

      // Write extracted facts
      for (const fact of extracted.facts) {
        await this.service.addSemantic(agent_passport_id, {
          namespace,
          content: fact.fact,
          fact: fact.fact,
          confidence: fact.confidence,
          source_memory_ids: episodics.map(e => e.memory_id),
        });
      }

      // Write extracted rules
      for (const rule of extracted.rules) {
        await this.service.addProcedural(agent_passport_id, {
          namespace,
          content: rule.rule,
          rule: rule.rule,
          trigger: rule.trigger,
          priority: rule.priority,
          source_memory_ids: episodics.map(e => e.memory_id),
        });
      }

      this.processedKeys.add(contentKey);
    } finally {
      this.locks.set(session_id, false);
    }
  }

  private async callLLM(prompt: string, existingFacts: string): Promise<{
    facts: { fact: string; confidence: number }[];
    rules: { rule: string; trigger: string; priority: number }[];
  }> {
    if (!this.config.extraction_model || this.extractionDisabled) {
      return { facts: [], rules: [] };
    }

    // Backoff check
    if (Date.now() < this.backoffUntil) {
      return { facts: [], rules: [] };
    }

    const url = process.env.MEMORY_EXTRACTION_URL || 'http://localhost:3001/v1/chat/completions';
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.extraction_model,
          messages: [
            {
              role: 'system',
              content: `You are a memory extraction agent for the Lucid AI platform.
Extract facts and behavioral rules from conversation context.
Output JSON with schema_version "1.0", facts array [{fact, confidence}], rules array [{rule, trigger, priority}].
Do not duplicate existing facts. Confidence reflects certainty. Rules must have actionable triggers.`,
            },
            {
              role: 'user',
              content: `Existing facts (avoid duplicates):\n${existingFacts || 'None'}\n\nConversation:\n${prompt}\n\nExtract new facts and behavioral rules.`,
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
        this.backoffUntil = Date.now() + retryAfter * 1000;
        console.warn(`[extraction] Rate limited, backing off ${retryAfter}s`);
        return { facts: [], rules: [] };
      }

      if (response.status === 401 || response.status === 403) {
        console.error(`[extraction] Auth failure (${response.status}), disabling extraction`);
        this.extractionDisabled = true;
        return { facts: [], rules: [] };
      }

      if (!response.ok) {
        console.warn(`[extraction] HTTP ${response.status}`);
        return { facts: [], rules: [] };
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return { facts: [], rules: [] };

      const parsed = JSON.parse(content);
      const validated = validateExtractionResponse(
        parsed,
        this.config.extraction_max_facts,
        this.config.extraction_max_rules,
      );

      if (validated.warnings.length > 0) {
        console.warn('[extraction] Validation warnings:', validated.warnings);
      }

      return { facts: validated.facts, rules: validated.rules };
    } catch (err: any) {
      if (err.name === 'SyntaxError') {
        console.error('[extraction] Malformed JSON response');
      } else {
        console.warn(`[extraction] Network error: ${err.message}`);
      }
      return { facts: [], rules: [] };
    }
  }
}
