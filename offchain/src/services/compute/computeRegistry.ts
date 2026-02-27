export type ComputeStatus = 'healthy' | 'degraded' | 'down';

export interface ComputeHeartbeat {
  compute_passport_id: string;
  status: ComputeStatus;
  queue_depth?: number;
  last_seen_ms?: number; // optional override; normally set by server
  // Optional overrides (live)
  price_per_1k_tokens_estimate?: number;
  p95_ms_estimate?: number;
}

export interface ComputeLiveState extends ComputeHeartbeat {
  last_seen_ms: number;
}

/**
 * Minimal in-memory compute registry with TTL.
 *
 * MVP:
 * - No database required.
 * - Allows matching to filter out dead nodes.
 */
export class ComputeRegistry {
  private readonly ttlMs: number;
  private readonly states = new Map<string, ComputeLiveState>();

  constructor(ttlMs: number = 30_000) {
    this.ttlMs = ttlMs;
  }

  upsertHeartbeat(hb: ComputeHeartbeat): ComputeLiveState {
    const now = Date.now();
    const state: ComputeLiveState = {
      ...hb,
      last_seen_ms: now,
    };
    this.states.set(hb.compute_passport_id, state);
    return state;
  }

  getLiveState(computePassportId: string): ComputeLiveState | null {
    const s = this.states.get(computePassportId);
    if (!s) return null;
    const age = Date.now() - s.last_seen_ms;
    if (age > this.ttlMs) return null;
    return s;
  }

  isHealthy(computePassportId: string): boolean {
    const s = this.getLiveState(computePassportId);
    if (!s) return false;
    return s.status === 'healthy';
  }

  listAlive(): ComputeLiveState[] {
    const now = Date.now();
    const out: ComputeLiveState[] = [];
    for (const s of this.states.values()) {
      if (now - s.last_seen_ms <= this.ttlMs) out.push(s);
    }
    return out;
  }
}

let singleton: ComputeRegistry | null = null;

export function getComputeRegistry(): ComputeRegistry {
  if (!singleton) singleton = new ComputeRegistry();
  return singleton;
}
