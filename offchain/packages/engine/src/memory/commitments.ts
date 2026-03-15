import { canonicalSha256Hex } from '../shared/crypto/hash';
import type { IMemoryStore } from './store/interface';
import type { MemoryEntry, MemoryType } from './types';

const PREIMAGE_FIELDS: Record<MemoryType, string[]> = {
  episodic: ['content', 'session_id', 'role', 'turn_index', 'tokens', 'tool_calls'],
  semantic: ['content', 'fact', 'confidence', 'source_memory_ids', 'supersedes'],
  procedural: ['content', 'rule', 'trigger', 'priority', 'source_memory_ids'],
  entity: ['content', 'entity_name', 'entity_type', 'entity_id', 'attributes', 'relationships'],
  trust_weighted: ['content', 'source_agent_passport_id', 'trust_score', 'decay_factor'],
  temporal: ['content', 'valid_from', 'valid_to', 'recorded_at'],
};

export function buildHashPreimage(
  entry: Record<string, unknown> & { type: MemoryType; agent_passport_id: string; namespace: string },
): Record<string, unknown> {
  const fields = PREIMAGE_FIELDS[entry.type];
  const preimage: Record<string, unknown> = {
    agent_passport_id: entry.agent_passport_id,
    namespace: entry.namespace,
    type: entry.type,
  };
  for (const field of fields) {
    if (entry[field] !== undefined) {
      preimage[field] = entry[field];
    }
  }
  return preimage;
}

export function computeMemoryHash(
  entry: Record<string, unknown> & { type: MemoryType; agent_passport_id: string; namespace: string },
): string {
  const preimage = buildHashPreimage(entry);
  return canonicalSha256Hex(preimage);
}

export interface ChainVerifyResult {
  valid: boolean;
  chain_length: number;
  errors: string[];
}

export async function verifyChainIntegrity(
  store: IMemoryStore,
  agent_passport_id: string,
  namespace: string,
): Promise<ChainVerifyResult> {
  const entries: MemoryEntry[] = [];
  let offset = 0;
  const PAGE_SIZE = 500;
  while (true) {
    const page = await store.query({
      agent_passport_id,
      namespace,
      status: ['active', 'superseded', 'archived', 'expired'],
      order_by: 'created_at',
      order_dir: 'asc',
      limit: PAGE_SIZE,
      offset,
    });
    entries.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const errors: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const recomputed = computeMemoryHash(
      entry as unknown as Record<string, unknown> & { type: MemoryType; agent_passport_id: string; namespace: string },
    );
    if (recomputed !== entry.content_hash) {
      errors.push(
        `Entry ${entry.memory_id}: content_hash mismatch (stored=${entry.content_hash}, computed=${recomputed})`,
      );
    }
    if (i === 0) {
      if (entry.prev_hash !== null) {
        errors.push(
          `Entry ${entry.memory_id}: first entry should have null prev_hash, got ${entry.prev_hash}`,
        );
      }
    } else {
      const expectedPrev = entries[i - 1].content_hash;
      if (entry.prev_hash !== expectedPrev) {
        errors.push(
          `Entry ${entry.memory_id}: prev_hash mismatch (stored=${entry.prev_hash}, expected=${expectedPrev})`,
        );
      }
    }
  }

  return { valid: errors.length === 0, chain_length: entries.length, errors };
}
