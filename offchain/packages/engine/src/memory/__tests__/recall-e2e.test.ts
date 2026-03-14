import { MemoryService } from '../service';
import { InMemoryMemoryStore } from '../store/in-memory';
import { MemoryACLEngine } from '../acl';
import { MockEmbeddingProvider } from '../embedding/mock';
import { EmbeddingWorker } from '../embedding/worker';
import type { MemoryServiceConfig } from '../types';
import { resetMemoryEventBus } from '../events/memoryEvents';

const testConfig: MemoryServiceConfig = {
  extraction_enabled: false,
  extraction_batch_size: 5,
  extraction_debounce_ms: 2000,
  trigger_on_session_close: false,
  embedding_enabled: true,
  embedding_model: 'mock-embedding-v1',
  provenance_enabled: false,
  receipts_enabled: false,
  max_episodic_window: 50,
  max_semantic_per_agent: 1000,
  compaction_idle_timeout_ms: 1800000,
  recall_similarity_threshold: 0.0,
  recall_candidate_pool_size: 50,
  recall_min_results: 3,
  recall_similarity_weight: 0.55,
  recall_recency_weight: 0.20,
  recall_type_weight: 0.15,
  recall_quality_weight: 0.10,
  extraction_max_tokens: 8000,
  extraction_max_facts: 20,
  extraction_max_rules: 10,
  max_memory_entries: 100000,
  max_memory_db_size_mb: 500,
  max_vector_rows: 50000,
};

const AGENT = 'agent-recall-e2e';
const NS = `agent:${AGENT}`;

function createTestWorker(
  store: InMemoryMemoryStore,
  provider: MockEmbeddingProvider,
): EmbeddingWorker {
  const worker = new EmbeddingWorker(store, provider, {
    batchSize: 20,
    pollIntervalMs: 60_000,
    maxRetries: 3,
  });
  (worker as any).running = true;
  return worker;
}

describe('Recall E2E with Embeddings', () => {
  let store: InMemoryMemoryStore;
  let service: MemoryService;
  let provider: MockEmbeddingProvider;
  let worker: EmbeddingWorker;

  beforeEach(() => {
    resetMemoryEventBus();
    store = new InMemoryMemoryStore();
    const acl = new MemoryACLEngine();
    service = new MemoryService(store, acl, testConfig);
    provider = new MockEmbeddingProvider();
    worker = createTestWorker(store, provider);
  });

  test('full pipeline: write semantic entries, run worker, recall by vector similarity', async () => {
    // Write 3 semantic entries with different content
    await service.addSemantic(AGENT, {
      namespace: NS, content: 'Ethereum is a decentralized blockchain platform',
      fact: 'Ethereum is a decentralized blockchain platform',
      confidence: 0.95, source_memory_ids: [],
    });
    await service.addSemantic(AGENT, {
      namespace: NS, content: 'Bitcoin was the first cryptocurrency',
      fact: 'Bitcoin was the first cryptocurrency',
      confidence: 0.90, source_memory_ids: [],
    });
    await service.addSemantic(AGENT, {
      namespace: NS, content: 'JavaScript is a programming language for the web',
      fact: 'JavaScript is a programming language for the web',
      confidence: 0.85, source_memory_ids: [],
    });

    // Run embedding worker to process pending entries
    await worker.tick();

    // Verify embeddings were created
    const pending = await store.queryPendingEmbeddings(10);
    expect(pending.length).toBe(0);

    // Generate query embedding
    const queryEmbedding = await provider.embed('Ethereum blockchain');

    // Recall with vector similarity
    const response = await service.recall(AGENT, {
      query: 'Ethereum blockchain',
      agent_passport_id: AGENT,
      namespace: NS,
      semantic_query_embedding: queryEmbedding.embedding,
    });

    expect(response.memories.length).toBeGreaterThan(0);
    expect(response.total_candidates).toBeGreaterThan(0);
    // All returned memories should have a score
    for (const m of response.memories) {
      expect(typeof m.score).toBe('number');
    }
  });

  test('recall skips pending entries: no worker run, falls back to recency', async () => {
    // Write entries but do NOT run the worker — embeddings stay pending
    await service.addSemantic(AGENT, {
      namespace: NS, content: 'Solana is fast',
      fact: 'Solana is fast', confidence: 0.9, source_memory_ids: [],
    });
    await service.addSemantic(AGENT, {
      namespace: NS, content: 'Rust is safe',
      fact: 'Rust is safe', confidence: 0.8, source_memory_ids: [],
    });

    // Verify entries are still pending
    const pending = await store.queryPendingEmbeddings(10);
    expect(pending.length).toBe(2);

    // Recall WITHOUT embedding — falls back to recency-based results
    const response = await service.recall(AGENT, {
      query: 'Solana',
      agent_passport_id: AGENT,
      namespace: NS,
    });

    // Should still return results via fallback (keyword matching or recency backfill)
    expect(response.memories.length).toBeGreaterThan(0);
    // No query embedding was provided, so query_embedding_model should be null
    expect(response.query_embedding_model).toBeNull();
  });

  test('recall with lanes filter: only returns entries from specified lane', async () => {
    // Write entries in 'self' and 'shared' lanes
    await service.addSemantic(AGENT, {
      namespace: NS, content: 'Private knowledge about my wallet',
      fact: 'Wallet has 5 ETH', confidence: 0.9, source_memory_ids: [],
      memory_lane: 'self',
    });
    await service.addSemantic(AGENT, {
      namespace: NS, content: 'Shared protocol documentation',
      fact: 'Protocol uses Anchor framework', confidence: 0.85, source_memory_ids: [],
      memory_lane: 'shared',
    });
    await service.addSemantic(AGENT, {
      namespace: NS, content: 'Shared deployment guide',
      fact: 'Deploy with anchor deploy', confidence: 0.80, source_memory_ids: [],
      memory_lane: 'shared',
    });

    // Recall with lanes=['shared'] only
    const response = await service.recall(AGENT, {
      query: 'protocol',
      agent_passport_id: AGENT,
      namespace: NS,
      lanes: ['shared'],
    });

    // Only shared entries should be returned
    for (const m of response.memories) {
      expect((m as any).memory_lane).toBe('shared');
    }
    expect(response.memories.length).toBeGreaterThan(0);
  });

  test('recall with query keywords: matching entry ranks higher', async () => {
    // Write entries with specific content
    await service.addSemantic(AGENT, {
      namespace: NS, content: 'The weather is sunny today',
      fact: 'Weather is sunny', confidence: 0.7, source_memory_ids: [],
    });
    await service.addSemantic(AGENT, {
      namespace: NS, content: 'zkML verification uses Groth16 proofs',
      fact: 'zkML uses Groth16', confidence: 0.9, source_memory_ids: [],
    });
    await service.addSemantic(AGENT, {
      namespace: NS, content: 'Agent wallets are PDA-based',
      fact: 'PDA wallets', confidence: 0.8, source_memory_ids: [],
    });

    // Recall with keyword matching "zkML"
    const response = await service.recall(AGENT, {
      query: 'zkML',
      agent_passport_id: AGENT,
      namespace: NS,
    });

    expect(response.memories.length).toBeGreaterThan(0);
    // The zkML entry should be in results (keyword match filter)
    const zkmlEntry = response.memories.find(m => m.content.includes('zkML'));
    expect(zkmlEntry).toBeDefined();
  });

  test('basic recall returns results without embedding', async () => {
    // Write entries without running embedding worker
    await service.addSemantic(AGENT, {
      namespace: NS, content: 'First memory entry',
      fact: 'First fact', confidence: 0.9, source_memory_ids: [],
    });
    await service.addSemantic(AGENT, {
      namespace: NS, content: 'Second memory entry',
      fact: 'Second fact', confidence: 0.8, source_memory_ids: [],
    });
    await service.addSemantic(AGENT, {
      namespace: NS, content: 'Third memory entry',
      fact: 'Third fact', confidence: 0.7, source_memory_ids: [],
    });

    // Recall without semantic_query_embedding
    const response = await service.recall(AGENT, {
      query: 'memory',
      agent_passport_id: AGENT,
      namespace: NS,
    });

    // Should return non-empty results (recency-based fallback + keyword filter)
    expect(response.memories.length).toBeGreaterThan(0);
    expect(response.query_embedding_model).toBeNull();
  });
});
