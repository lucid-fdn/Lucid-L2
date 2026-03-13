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

export function validateTrustWeighted(entry: Record<string, unknown>): void {
  validateBase(entry);

  if (!entry.source_agent_passport_id || typeof entry.source_agent_passport_id !== 'string') {
    throw new Error('source_agent_passport_id is required for trust_weighted memory');
  }
  if (
    typeof entry.trust_score !== 'number' ||
    entry.trust_score < 0 ||
    entry.trust_score > 1
  ) {
    throw new Error('trust_score must be a number between 0 and 1');
  }
  if (
    typeof entry.decay_factor !== 'number' ||
    entry.decay_factor < 0 ||
    entry.decay_factor > 1
  ) {
    throw new Error('decay_factor must be a number between 0 and 1');
  }
  if (
    typeof entry.weighted_relevance !== 'number' ||
    entry.weighted_relevance < 0 ||
    entry.weighted_relevance > 1
  ) {
    throw new Error('weighted_relevance must be a number between 0 and 1');
  }
}
