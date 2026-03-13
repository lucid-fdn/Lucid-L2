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

export function validateTemporal(entry: Record<string, unknown>): void {
  validateBase(entry);

  if (typeof entry.valid_from !== 'number') {
    throw new Error('valid_from is required and must be a number for temporal memory');
  }
  if (entry.valid_to !== null && entry.valid_to !== undefined) {
    if (typeof entry.valid_to !== 'number') {
      throw new Error('valid_to must be a number or null');
    }
    if (entry.valid_to <= entry.valid_from) {
      throw new Error('valid_to must be greater than valid_from');
    }
  }
  if (typeof entry.recorded_at !== 'number') {
    throw new Error('recorded_at is required and must be a number for temporal memory');
  }
  if (entry.recorded_at < entry.valid_from) {
    throw new Error('recorded_at must be >= valid_from');
  }
}
