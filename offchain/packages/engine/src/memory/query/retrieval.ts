import type { MemoryQuery } from '../store/interface';
import type { RecallRequest } from '../types';

export function buildQuery(request: RecallRequest): MemoryQuery {
  return {
    agent_passport_id: request.agent_passport_id,
    namespace: request.namespace,
    types: request.types,
    session_id: request.session_id,
    status: request.include_archived ? ['active', 'archived'] : ['active'],
    limit: request.limit || 20,
    order_by: 'created_at',
    order_dir: 'desc',
  };
}
