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

export function validateEntity(entry: Record<string, unknown>): void {
  validateBase(entry);

  if (!entry.entity_name || typeof entry.entity_name !== 'string') {
    throw new Error('entity_name is required for entity memory');
  }
  if (!entry.entity_type || typeof entry.entity_type !== 'string') {
    throw new Error('entity_type is required for entity memory');
  }
  if (
    entry.attributes === null ||
    entry.attributes === undefined ||
    typeof entry.attributes !== 'object' ||
    Array.isArray(entry.attributes)
  ) {
    throw new Error('attributes must be an object for entity memory');
  }
  if (!Array.isArray(entry.relationships)) {
    throw new Error('relationships must be an array for entity memory');
  }
  for (const rel of entry.relationships as Record<string, unknown>[]) {
    if (!rel.target_entity_id || typeof rel.target_entity_id !== 'string') {
      throw new Error('each relationship must have a non-empty target_entity_id');
    }
    if (!rel.relation_type || typeof rel.relation_type !== 'string') {
      throw new Error('each relationship must have a non-empty relation_type');
    }
    if (
      typeof rel.confidence !== 'number' ||
      rel.confidence < 0 ||
      rel.confidence > 1
    ) {
      throw new Error('each relationship confidence must be a number between 0 and 1');
    }
  }
  if (entry.entity_id !== undefined && typeof entry.entity_id !== 'string') {
    throw new Error('entity_id must be a string if provided');
  }
  if (
    entry.source_memory_ids !== undefined &&
    !Array.isArray(entry.source_memory_ids)
  ) {
    throw new Error('source_memory_ids must be an array if provided');
  }
}
