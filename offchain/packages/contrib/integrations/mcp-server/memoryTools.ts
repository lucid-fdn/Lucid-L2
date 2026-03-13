import { MemoryService } from '../../../engine/src/memory/service';
import { getMemoryStore } from '../../../engine/src/memory/store';
import { MemoryACLEngine } from '../../../engine/src/memory/acl';
import { getDefaultConfig } from '../../../engine/src/memory/types';

export const MEMORY_TOOL_DEFINITIONS = [
  {
    name: 'memory_add',
    description: 'Store a memory entry (episodic, semantic, or procedural)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: ['episodic', 'semantic', 'procedural'] },
        agent_passport_id: { type: 'string' },
        namespace: { type: 'string' },
        content: { type: 'string' },
        session_id: { type: 'string', description: 'Required for episodic' },
        role: { type: 'string', description: 'Required for episodic' },
        tokens: { type: 'number', description: 'Required for episodic' },
        fact: { type: 'string', description: 'Required for semantic' },
        confidence: { type: 'number', description: 'Required for semantic' },
        rule: { type: 'string', description: 'Required for procedural' },
        trigger: { type: 'string', description: 'Required for procedural' },
        priority: { type: 'number' },
      },
      required: ['type', 'agent_passport_id', 'content'],
    },
  },
  {
    name: 'memory_recall',
    description: 'Retrieve relevant memories via search + filters',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string' },
        agent_passport_id: { type: 'string' },
        types: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number' },
        namespace: { type: 'string' },
      },
      required: ['query', 'agent_passport_id'],
    },
  },
  {
    name: 'memory_session_start',
    description: 'Start a new conversation session',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_passport_id: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['agent_passport_id'],
    },
  },
  {
    name: 'memory_session_context',
    description: 'Get recent conversation context for a session',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string' },
        agent_passport_id: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['session_id', 'agent_passport_id'],
    },
  },
  {
    name: 'memory_verify',
    description: 'Verify memory chain integrity for an agent',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_passport_id: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['agent_passport_id', 'namespace'],
    },
  },
  {
    name: 'memory_stats',
    description: 'Get memory statistics for an agent',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_passport_id: { type: 'string' },
      },
      required: ['agent_passport_id'],
    },
  },
];

let cachedService: MemoryService | null = null;
function getOrCreateService(): MemoryService {
  if (!cachedService) {
    cachedService = new MemoryService(getMemoryStore(), new MemoryACLEngine(), getDefaultConfig());
  }
  return cachedService;
}

export async function executeMemoryTool(toolName: string, params: Record<string, any>): Promise<any> {
  const service = getOrCreateService();
  const store = getMemoryStore();

  switch (toolName) {
    case 'memory_add': {
      const { type, agent_passport_id, namespace: ns, ...rest } = params;
      const namespace = ns || `agent:${agent_passport_id}`;
      switch (type) {
        case 'episodic':
          return service.addEpisodic(agent_passport_id, {
            namespace, session_id: rest.session_id, role: rest.role,
            content: rest.content, tokens: rest.tokens,
            metadata: rest.metadata, tool_calls: rest.tool_calls,
          });
        case 'semantic':
          return service.addSemantic(agent_passport_id, {
            namespace, content: rest.content, fact: rest.fact,
            confidence: rest.confidence, source_memory_ids: rest.source_memory_ids || [],
          });
        case 'procedural':
          return service.addProcedural(agent_passport_id, {
            namespace, content: rest.content, rule: rest.rule,
            trigger: rest.trigger, priority: rest.priority ?? 0,
            source_memory_ids: rest.source_memory_ids || [],
          });
        default:
          throw new Error(`Unsupported memory type: ${type}`);
      }
    }
    case 'memory_recall':
      return service.recall(params.agent_passport_id, {
        query: params.query, agent_passport_id: params.agent_passport_id,
        types: params.types, limit: params.limit, namespace: params.namespace,
      });
    case 'memory_session_start':
      return { session_id: await service.startSession(params.agent_passport_id, params.namespace || `agent:${params.agent_passport_id}`) };
    case 'memory_session_context':
      return store.query({
        agent_passport_id: params.agent_passport_id,
        session_id: params.session_id,
        types: ['episodic'],
        limit: params.limit || 20,
        order_by: 'created_at',
        order_dir: 'desc',
      });
    case 'memory_verify':
      return service.verifyChainIntegrity(params.agent_passport_id, params.namespace);
    case 'memory_stats':
      return service.getStats(params.agent_passport_id);
    default:
      throw new Error(`Unknown memory tool: ${toolName}`);
  }
}
