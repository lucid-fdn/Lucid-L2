import type { IMemoryStore } from './store/interface';
import type { MemoryServiceConfig, EpisodicMemory } from './types';
import { sha256Hex } from '../crypto/hash';

export class ExtractionPipeline {
  private locks = new Map<string, boolean>();
  private lastRun = new Map<string, number>();
  private processedKeys = new Set<string>();

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

      const prompt = `Extract key facts and behavioral rules from this conversation.
Existing facts (avoid duplicates): ${existingFactsList || 'None'}
Conversation:\n${conversationContext}`;

      const extracted = await this.callLLM(prompt);

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

  private async callLLM(prompt: string): Promise<{
    facts: { fact: string; confidence: number }[];
    rules: { rule: string; trigger: string; priority: number }[];
  }> {
    if (!this.config.extraction_model) {
      return { facts: [], rules: [] };
    }

    // v1: stub — real implementation would call chat completions
    const url = process.env.MEMORY_EXTRACTION_URL || 'http://localhost:3001/v1/chat/completions';
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.extraction_model,
          messages: [{ role: 'system', content: prompt }],
          response_format: { type: 'json_object' },
        }),
      });
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return { facts: [], rules: [] };
      return JSON.parse(content);
    } catch {
      return { facts: [], rules: [] };
    }
  }
}
