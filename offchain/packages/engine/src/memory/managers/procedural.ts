import { MAX_CONTENT_SIZE, MAX_METADATA_SIZE } from '../types';

function validateBase(entry: Record<string, unknown>): void {
  if (!entry.agent_passport_id || typeof entry.agent_passport_id !== 'string') {
    throw new Error('agent_passport_id is required');
  }
  if (!entry.namespace || typeof entry.namespace !== 'string') {
    throw new Error('namespace is required');
  }
  if (!entry.content || typeof entry.content !== 'string') {
    throw new Error('content is required');
  }
  if ((entry.content as string).length > MAX_CONTENT_SIZE) {
    throw new Error(`content exceeds maximum size of ${MAX_CONTENT_SIZE} bytes`);
  }
  if (entry.metadata != null && typeof entry.metadata === 'object') {
    const metaStr = JSON.stringify(entry.metadata);
    if (metaStr.length > MAX_METADATA_SIZE) {
      throw new Error(`metadata exceeds maximum size of ${MAX_METADATA_SIZE} bytes`);
    }
    for (const key of Object.keys(entry.metadata as Record<string, unknown>)) {
      if (key.startsWith('_lucid_')) {
        throw new Error(`metadata key '${key}' uses reserved _lucid_ prefix`);
      }
    }
  }
}

export function validateProcedural(entry: Record<string, unknown>): void {
  validateBase(entry);

  if (!entry.rule || typeof entry.rule !== 'string') {
    throw new Error('rule is required for procedural memory');
  }
  if (!entry.trigger || typeof entry.trigger !== 'string') {
    throw new Error('trigger is required for procedural memory');
  }
  if (entry.priority === undefined || entry.priority === null) {
    entry.priority = 0;
  }
  if (typeof entry.priority !== 'number' || entry.priority < 0) {
    throw new Error('priority must be a non-negative number');
  }
  if (!Array.isArray(entry.source_memory_ids)) {
    throw new Error('source_memory_ids must be an array');
  }
}
