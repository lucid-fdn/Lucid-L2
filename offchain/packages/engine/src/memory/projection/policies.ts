import type { MemoryEntry, MemoryLane, MemoryType } from '../types';

export interface ProjectionPolicy {
  allowed_lanes: MemoryLane[];
  allowed_types: MemoryType[];
  require_embedding_ready: boolean;
  redact_episodic_content: boolean;
  project_embeddings: boolean;
  filter?: (entry: MemoryEntry) => boolean;
}

export function getDefaultProjectionPolicy(): ProjectionPolicy {
  return {
    allowed_lanes: ['shared', 'market'],
    allowed_types: ['semantic', 'procedural', 'entity', 'trust_weighted', 'temporal'],
    require_embedding_ready: false,
    redact_episodic_content: true,
    project_embeddings: false,
    filter: undefined,
  };
}

export function shouldProject(entry: MemoryEntry, policy: ProjectionPolicy): boolean {
  if (!policy.allowed_lanes.includes(entry.memory_lane)) return false;
  if (!policy.allowed_types.includes(entry.type)) return false;
  if (policy.require_embedding_ready && (entry as any).embedding_status !== 'ready') return false;
  if (policy.filter && !policy.filter(entry)) return false;
  return true;
}
