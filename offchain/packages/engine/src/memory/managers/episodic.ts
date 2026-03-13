import { MAX_CONTENT_SIZE, MAX_METADATA_SIZE } from '../types';

const VALID_ROLES = ['user', 'assistant', 'system', 'tool'];

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

export function validateEpisodic(entry: Record<string, unknown>): void {
  validateBase(entry);

  if (!entry.session_id || typeof entry.session_id !== 'string') {
    throw new Error('session_id is required for episodic memory');
  }
  if (!VALID_ROLES.includes(entry.role as string)) {
    throw new Error(`role must be one of: ${VALID_ROLES.join(', ')}`);
  }
  if (typeof entry.tokens !== 'number' || entry.tokens < 0) {
    throw new Error('tokens must be a non-negative number');
  }
}
