import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { MemoryService } from '../../../../engine/src/memory/service';
import { MemoryACLEngine } from '../../../../engine/src/memory/acl';
import { getDefaultConfig, getDefaultCompactionConfig } from '../../../../engine/src/memory/types';
import { getMemoryStore, getStoreForAgent } from '../../../../engine/src/memory/store';
import { ArchivePipeline } from '../../../../engine/src/memory/archivePipeline';
import { CompactionPipeline } from '../../../../engine/src/memory/compactionPipeline';
import { ExtractionPipeline } from '../../../../engine/src/memory/extraction';

export const memoryRouter = Router();

// Per-agent service + pipeline registry
// In SQLite mode, each agent gets its own store → own service.
// In Postgres/InMemory mode, getStoreForAgent returns the singleton.
const serviceRegistry = new Map<string, MemoryService>();
const archiveRegistry = new Map<string, ArchivePipeline | null>();
const extractionRegistry = new Map<string, ExtractionPipeline | null>();

function getServiceForAgent(agentPassportId: string): MemoryService {
  const key = agentPassportId === '__admin__' ? '__admin__' : agentPassportId;
  const cached = serviceRegistry.get(key);
  if (cached) return cached;
  const store = key === '__admin__' ? getMemoryStore() : getStoreForAgent(key);
  const svc = new MemoryService(store, new MemoryACLEngine(), getDefaultConfig());
  serviceRegistry.set(key, svc);
  return svc;
}

// Backward compat — singleton for admin/non-agent contexts
function getService(): MemoryService {
  return getServiceForAgent('__admin__');
}

function getArchivePipelineForAgent(agentPassportId: string): ArchivePipeline | null {
  const key = agentPassportId === '__admin__' ? '__admin__' : agentPassportId;
  if (archiveRegistry.has(key)) return archiveRegistry.get(key)!;
  try {
    const store = key === '__admin__' ? getMemoryStore() : getStoreForAgent(key);
    const pipeline = new ArchivePipeline(
      store,
      async (_id: string) => null, // passport pubkey lookup — wire later
    );
    archiveRegistry.set(key, pipeline);
    return pipeline;
  } catch {
    archiveRegistry.set(key, null);
    return null;
  }
}

function getExtractionPipelineForAgent(agentPassportId: string): ExtractionPipeline | null {
  const key = agentPassportId === '__admin__' ? '__admin__' : agentPassportId;
  if (extractionRegistry.has(key)) return extractionRegistry.get(key)!;
  const svc = getServiceForAgent(key);
  const cfg = getDefaultConfig();
  if (!cfg.extraction_enabled) { extractionRegistry.set(key, null); return null; }
  const store = key === '__admin__' ? getMemoryStore() : getStoreForAgent(key);
  const pipeline = new ExtractionPipeline(svc, store, cfg);
  extractionRegistry.set(key, pipeline);
  return pipeline;
}

// Helper: extract agent passport ID from request
function getCallerPassportId(req: any): string {
  // Admin key check (timing-safe)
  const adminKey = req.headers['x-admin-key'] || req.headers['x-api-key'];
  const expectedKey = process.env.LUCID_ADMIN_KEY;
  if (adminKey && expectedKey && typeof adminKey === 'string') {
    const a = Buffer.from(adminKey);
    const b = Buffer.from(expectedKey);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return '__admin__';
    }
  }

  // Agent passport ID from header
  const passportId = req.headers['x-agent-passport-id'] as string;
  if (!passportId) {
    throw new Error('Missing X-Agent-Passport-Id header');
  }

  // Verify passport ownership via HMAC signature
  const sig = req.headers['x-agent-passport-signature'] as string;
  if (sig && expectedKey) {
    const expected = createHmac('sha256', expectedKey).update(passportId).digest('hex');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
      return passportId;
    }
    throw new Error('Invalid X-Agent-Passport-Signature');
  }

  // Strict mode: require signature
  if (process.env.MEMORY_AUTH_STRICT === 'true') {
    throw new Error('X-Agent-Passport-Signature header required in strict auth mode');
  }

  // Non-strict mode: allow unauthenticated access with warning
  console.warn(`[memoryRoutes] WARNING: Unauthenticated passport access for ${passportId}. Set MEMORY_AUTH_STRICT=true to enforce signatures.`);
  return passportId;
}

// Helper: auto-scope namespace
function resolveNamespace(req: any, callerPassportId: string): string {
  if (callerPassportId === '__admin__') {
    return req.body?.namespace || req.query?.namespace || '';
  }
  return req.body?.namespace || `agent:${callerPassportId}`;
}

// POST /v1/memory/episodic
memoryRouter.post('/v1/memory/episodic', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const { session_id, role, content, tokens, metadata, tool_calls, memory_lane } = req.body;
    if (!session_id) return res.status(400).json({ success: false, error: 'Missing session_id' });
    if (!role) return res.status(400).json({ success: false, error: 'Missing role' });
    if (!content) return res.status(400).json({ success: false, error: 'Missing content' });

    const namespace = resolveNamespace(req, callerId);
    const result = await getServiceForAgent(callerId).addEpisodic(callerId, {
      session_id, namespace, role, content,
      tokens: tokens || 0, metadata, tool_calls, memory_lane,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes('permission') ? 403 : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
});

// POST /v1/memory/semantic
memoryRouter.post('/v1/memory/semantic', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const { content, fact, confidence, source_memory_ids, supersedes, metadata, memory_lane } = req.body;
    if (!fact) return res.status(400).json({ success: false, error: 'Missing fact' });
    if (confidence === undefined) return res.status(400).json({ success: false, error: 'Missing confidence' });
    if (confidence < 0 || confidence > 1) return res.status(400).json({ success: false, error: 'confidence must be between 0 and 1' });

    const namespace = resolveNamespace(req, callerId);
    const result = await getServiceForAgent(callerId).addSemantic(callerId, {
      namespace, content: content || fact, fact, confidence,
      source_memory_ids: source_memory_ids || [], supersedes, metadata, memory_lane,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes('permission') ? 403 : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
});

// POST /v1/memory/procedural
memoryRouter.post('/v1/memory/procedural', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const { content, rule, trigger, priority, source_memory_ids, metadata, memory_lane } = req.body;
    if (!rule) return res.status(400).json({ success: false, error: 'Missing rule' });
    if (!trigger) return res.status(400).json({ success: false, error: 'Missing trigger' });

    const namespace = resolveNamespace(req, callerId);
    const result = await getServiceForAgent(callerId).addProcedural(callerId, {
      namespace, content: content || rule, rule, trigger,
      priority: priority ?? 0, source_memory_ids: source_memory_ids || [], metadata, memory_lane,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes('permission') ? 403 : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
});

// POST /v1/memory/entity
memoryRouter.post('/v1/memory/entity', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const { content, entity_name, entity_type, entity_id, attributes, relationships, source_memory_ids, metadata, memory_lane } = req.body;
    if (!entity_name) return res.status(400).json({ success: false, error: 'Missing entity_name' });
    if (!entity_type) return res.status(400).json({ success: false, error: 'Missing entity_type' });
    const namespace = resolveNamespace(req, callerId);
    const result = await getServiceForAgent(callerId).addEntity(callerId, {
      namespace, content: content || entity_name, entity_name, entity_type, entity_id,
      attributes: attributes || {}, relationships: relationships || [],
      source_memory_ids, metadata, memory_lane,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes('permission') ? 403
      : error.message?.includes('is required') || error.message?.includes('must be') ? 400
      : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
});

// POST /v1/memory/trust-weighted
memoryRouter.post('/v1/memory/trust-weighted', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const { content, source_agent_passport_id, trust_score, decay_factor, weighted_relevance, source_memory_ids, metadata, memory_lane } = req.body;
    if (!source_agent_passport_id) return res.status(400).json({ success: false, error: 'Missing source_agent_passport_id' });
    const namespace = resolveNamespace(req, callerId);
    const result = await getServiceForAgent(callerId).addTrustWeighted(callerId, {
      namespace, content: content || `Trust ${source_agent_passport_id}`,
      source_agent_passport_id, trust_score, decay_factor, weighted_relevance,
      source_memory_ids, metadata, memory_lane,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes('permission') ? 403
      : error.message?.includes('is required') || error.message?.includes('must be') ? 400
      : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
});

// POST /v1/memory/temporal
memoryRouter.post('/v1/memory/temporal', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const { content, valid_from, valid_to, recorded_at, source_memory_ids, metadata, memory_lane } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'Missing content' });
    if (valid_from === undefined) return res.status(400).json({ success: false, error: 'Missing valid_from' });
    const namespace = resolveNamespace(req, callerId);
    const result = await getServiceForAgent(callerId).addTemporal(callerId, {
      namespace, content, valid_from, valid_to: valid_to ?? null,
      recorded_at: recorded_at || Date.now(),
      source_memory_ids, metadata, memory_lane,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes('permission') ? 403
      : error.message?.includes('is required') || error.message?.includes('must be') ? 400
      : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
});

// POST /v1/memory/recall
memoryRouter.post('/v1/memory/recall', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const response = await getServiceForAgent(callerId).recall(callerId, {
      ...req.body,
      agent_passport_id: callerId === '__admin__' ? req.body.agent_passport_id : callerId,
    });
    return res.json({ success: true, data: response });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /v1/memory/entries/:id
memoryRouter.get('/v1/memory/entries/:id', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const store = getStoreForAgent(callerId);
    const entry = await store.read(req.params.id);
    if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });
    return res.json({ success: true, data: entry });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /v1/memory/entries
memoryRouter.get('/v1/memory/entries', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const agentId = callerId === '__admin__' ? (req.query.agent_passport_id as string) : callerId;
    const store = getStoreForAgent(agentId || callerId);
    const entries = await store.query({
      agent_passport_id: agentId || callerId,
      namespace: req.query.namespace as string,
      types: req.query.types ? (req.query.types as string).split(',') as any : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    });
    return res.json({ success: true, data: entries });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /v1/memory/sessions
memoryRouter.post('/v1/memory/sessions', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const namespace = resolveNamespace(req, callerId);
    const sessionId = await getServiceForAgent(callerId).startSession(callerId, namespace);
    return res.status(201).json({ success: true, data: { session_id: sessionId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /v1/memory/sessions/:id/close
memoryRouter.post('/v1/memory/sessions/:id/close', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    await getServiceForAgent(callerId).closeSession(callerId, req.params.id, req.body?.summary);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /v1/memory/sessions/:id/context
memoryRouter.get('/v1/memory/sessions/:id/context', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const callerId = getCallerPassportId(req);
    const store = getStoreForAgent(callerId);
    const session = await store.getSession(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const entries = await store.query({
      agent_passport_id: session.agent_passport_id,
      session_id: req.params.id,
      types: ['episodic'],
      limit,
      order_by: 'created_at',
      order_dir: 'desc',
    });
    return res.json({ success: true, data: entries });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /v1/memory/sessions
memoryRouter.get('/v1/memory/sessions', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const agentId = callerId === '__admin__' ? (req.query.agent_passport_id as string) : callerId;
    if (!agentId) return res.status(400).json({ success: false, error: 'Missing agent_passport_id' });
    const sessions = await getStoreForAgent(agentId).listSessions(agentId);
    return res.json({ success: true, data: sessions });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /v1/memory/provenance/:agent_id/:ns
memoryRouter.get('/v1/memory/provenance/:agent_id/:ns', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const chain = await getStoreForAgent(req.params.agent_id).getProvenanceChain(req.params.agent_id, req.params.ns, limit);
    return res.json({ success: true, data: chain });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /v1/memory/provenance/entry/:id
memoryRouter.get('/v1/memory/provenance/entry/:id', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const records = await getStoreForAgent(callerId).getProvenanceForMemory(req.params.id);
    return res.json({ success: true, data: records });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /v1/memory/verify
memoryRouter.post('/v1/memory/verify', async (req, res) => {
  try {
    const { agent_passport_id, namespace } = req.body;
    if (!agent_passport_id) return res.status(400).json({ success: false, error: 'Missing agent_passport_id' });
    if (!namespace) return res.status(400).json({ success: false, error: 'Missing namespace' });
    const result = await getServiceForAgent(agent_passport_id).verifyChainIntegrity(agent_passport_id, namespace);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /v1/memory/snapshots
memoryRouter.post('/v1/memory/snapshots', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const { agent_passport_id, snapshot_type, namespace } = req.body;
    const agentId = callerId === '__admin__' ? agent_passport_id : callerId;
    if (!agentId) return res.status(400).json({ success: false, error: 'Missing agent_passport_id' });
    const pipeline = getArchivePipelineForAgent(agentId);
    if (!pipeline) return res.status(503).json({ success: false, error: 'DePIN storage not configured' });
    const result = await pipeline.createSnapshot(agentId, snapshot_type || 'checkpoint', namespace);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /v1/memory/snapshots/restore
memoryRouter.post('/v1/memory/snapshots/restore', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const { agent_passport_id, cid, mode, target_namespace } = req.body;
    const agentId = callerId === '__admin__' ? agent_passport_id : callerId;
    if (!agentId) return res.status(400).json({ success: false, error: 'Missing agent_passport_id' });
    if (!cid) return res.status(400).json({ success: false, error: 'Missing cid' });
    if (!mode) return res.status(400).json({ success: false, error: 'Missing mode' });
    if (mode === 'fork' && !target_namespace) {
      return res.status(400).json({ success: false, error: 'target_namespace required for fork mode' });
    }
    const pipeline = getArchivePipelineForAgent(agentId);
    if (!pipeline) return res.status(503).json({ success: false, error: 'DePIN storage not configured' });
    const result = await pipeline.restoreSnapshot(agentId, { cid, mode, target_namespace });
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message.includes('Identity mismatch')) return res.status(422).json({ success: false, error: error.message });
    if (error.message.includes('Invalid LMF')) return res.status(422).json({ success: false, error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /v1/memory/snapshots
memoryRouter.get('/v1/memory/snapshots', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const agentId = callerId === '__admin__' ? (req.query.agent_passport_id as string) : callerId;
    if (!agentId) return res.status(400).json({ success: false, error: 'Missing agent_passport_id' });
    const snapshots = await getStoreForAgent(agentId).listSnapshots(agentId);
    return res.json({ success: true, data: snapshots });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /v1/memory/stats/:agent_id
memoryRouter.get('/v1/memory/stats/:agent_id', async (req, res) => {
  try {
    const stats = await getServiceForAgent(req.params.agent_id).getStats(req.params.agent_id);
    return res.json({ success: true, data: stats });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /v1/memory/compact
memoryRouter.post('/v1/memory/compact', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const { agent_passport_id, namespace, session_id, mode } = req.body;
    const agentId = callerId === '__admin__' ? agent_passport_id : callerId;
    if (!agentId) return res.status(400).json({ success: false, error: 'Missing agent_passport_id' });
    const ns = namespace || `agent:${agentId}`;
    const store = getStoreForAgent(agentId);
    const compaction = new CompactionPipeline(
      store, getExtractionPipelineForAgent(agentId), getArchivePipelineForAgent(agentId), getDefaultCompactionConfig(),
    );
    const result = await compaction.compact(agentId, ns, { session_id, mode: mode || 'full' });
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /v1/memory/health
memoryRouter.get('/v1/memory/health', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const health = await getStoreForAgent(callerId).getHealth();
    return res.json({ success: true, data: health });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Reset all registries for testing
export function resetMemoryService(): void {
  serviceRegistry.clear();
  archiveRegistry.clear();
  extractionRegistry.clear();
}
