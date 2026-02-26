import { validateWithSchema } from '../utils/schemaValidator';
import { evaluatePolicy, Policy, ReasonCode as PolicyReasonCode } from './policyEngine';
import { getComputeRegistry, ComputeLiveState } from './computeRegistry';

export type MatchRejectReason =
  | PolicyReasonCode
  | 'NO_RUNTIME_MATCH'
  | 'VRAM_TOO_LOW'
  | 'MAX_CONTEXT_TOO_LOW'
  | 'COMPUTE_NOT_HEALTHY'
  | 'NO_COMPATIBLE_COMPUTE';

export interface MatchResult {
  model_passport_id: string;
  compute_passport_id: string;
  selected_runtime: string;
  expected_p95?: number;
  estimated_cost?: number;
  fallbacks: Array<{
    compute_passport_id: string;
    selected_runtime: string;
    expected_p95?: number;
    estimated_cost?: number;
  }>;
}

export interface MatchExplainResult {
  policy_hash: string;
  shortlisted: Array<{ compute_passport_id: string; runtime: string; score: number; p95?: number; cost?: number }>; 
  rejected: Array<{ compute_passport_id: string; reasons: MatchRejectReason[] }>;
  selected?: { compute_passport_id: string; runtime: string; score: number; p95?: number; cost?: number };
}

/**
 * Check runtime compatibility between model and compute.
 * Supports multiple runtime matching strategies:
 * - runtime_recommended: single preferred runtime
 * - runtimes_supported: list of supported runtimes (hard requirement)
 */
export function runtimeCompatible(modelMeta: any, computeMeta: any): string | null {
  const computeRuntimes: Array<{ name: string; version?: string }> = Array.isArray(computeMeta?.runtimes) 
    ? computeMeta.runtimes 
    : [];
  
  if (computeRuntimes.length === 0) return null;

  // Get model's supported/recommended runtimes
  const modelRtRecommended = modelMeta?.runtime_recommended;
  const modelRtsSupported: string[] = Array.isArray(modelMeta?.runtimes_supported) 
    ? modelMeta.runtimes_supported 
    : [];
  
  // If model has explicit runtimes_supported, use that as hard requirement
  if (modelRtsSupported.length > 0) {
    const match = computeRuntimes.find(r => modelRtsSupported.includes(r.name));
    if (match) {
      // Prefer the recommended one if it's in the supported list
      if (modelRtRecommended && modelRtsSupported.includes(modelRtRecommended)) {
        const recommended = computeRuntimes.find(r => r.name === modelRtRecommended);
        if (recommended) return modelRtRecommended;
      }
      return match.name;
    }
    return null;
  }
  
  // Fall back to runtime_recommended for backward compatibility
  if (modelRtRecommended) {
    const match = computeRuntimes.find(r => r.name === modelRtRecommended);
    return match ? modelRtRecommended : null;
  }
  
  // If model has no runtime preference, any compute runtime is acceptable
  return computeRuntimes[0]?.name ?? null;
}

export function hardwareCompatible(modelMeta: any, computeMeta: any): MatchRejectReason[] {
  const reasons: MatchRejectReason[] = [];
  const minVram = Number(modelMeta?.requirements?.min_vram_gb ?? 0);
  const vram = Number(computeMeta?.hardware?.vram_gb ?? 0);
  if (Number.isFinite(minVram) && Number.isFinite(vram) && minVram > 0 && vram < minVram) {
    reasons.push('VRAM_TOO_LOW');
  }

  const ctxLen = Number(modelMeta?.context_length ?? 0);
  const maxCtx = Number(computeMeta?.limits?.max_context ?? 0);
  if (ctxLen > 0 && maxCtx > 0 && maxCtx < ctxLen) {
    reasons.push('MAX_CONTEXT_TOO_LOW');
  }

  return reasons;
}

function computeIsHealthy(computePassportId: string): boolean {
  const reg = getComputeRegistry();
  return reg.isHealthy(computePassportId);
}

/**
 * Get effective compute metrics, merging live state overrides with static metadata.
 */
function getEffectiveMetrics(computeMeta: any, liveState: ComputeLiveState | null): { p95: number; cost: number } {
  let p95 = Number(computeMeta?.network?.p95_ms_estimate ?? 0);
  let cost = Number(computeMeta?.pricing?.price_per_1k_tokens_estimate ?? 0);
  
  // Override with live state if available
  if (liveState) {
    if (liveState.p95_ms_estimate !== undefined && liveState.p95_ms_estimate > 0) {
      p95 = liveState.p95_ms_estimate;
    }
    if (liveState.price_per_1k_tokens_estimate !== undefined && liveState.price_per_1k_tokens_estimate > 0) {
      cost = liveState.price_per_1k_tokens_estimate;
    }
  }
  
  return { p95, cost };
}

function scoreCompute(policy: any, computeMeta: any, liveState: ComputeLiveState | null): { score: number; p95: number; cost: number } {
  // MVP score: prefer lower cost, then lower latency.
  // Missing values get neutral score.
  const costMax = Number(policy?.cost?.max_price_per_1k_tokens_usd ?? 0);
  const { p95, cost } = getEffectiveMetrics(computeMeta, liveState);

  let score = 0;
  
  // Cost scoring (50 points max)
  if (cost > 0) {
    // If policy provides max, scale relative; else just inverse.
    score += costMax > 0 ? Math.max(0, (costMax - cost) / costMax) * 50 : Math.min(50, 25 / cost);
  } else {
    score += 25; // Neutral if no cost info
  }
  
  // Latency scoring (50 points max)
  if (p95 > 0) {
    score += 50 * (1 / (1 + p95 / 1000));
  } else {
    score += 25; // Neutral if no latency info
  }
  
  // Queue depth penalty (from live state)
  if (liveState && liveState.queue_depth !== undefined && liveState.queue_depth > 0) {
    // Reduce score based on queue depth (up to 20 points penalty)
    const queuePenalty = Math.min(20, liveState.queue_depth * 2);
    score -= queuePenalty;
  }
  
  return { score, p95, cost };
}

export function matchComputeForModel(input: {
  model_meta: any;
  policy: Policy;
  compute_catalog: any[];
  require_live_healthy?: boolean;
}): { match?: MatchResult; explain: MatchExplainResult } {
  const { model_meta, policy, compute_catalog, require_live_healthy = true } = input;

  // Validate schemas
  const mv = validateWithSchema('ModelMeta', model_meta);
  if (!mv.ok) {
    throw new Error('Invalid model_meta schema');
  }
  const pv = validateWithSchema('Policy', policy);
  if (!pv.ok) {
    throw new Error('Invalid policy schema');
  }

  const policyEvalBase = evaluatePolicy({ policy });
  const policy_hash = policyEvalBase.policy_hash;

  const reg = getComputeRegistry();
  const shortlisted: Array<{ compute_passport_id: string; runtime: string; score: number; p95?: number; cost?: number }> = [];
  const rejected: Array<{ compute_passport_id: string; reasons: MatchRejectReason[] }> = [];

  for (const compute_meta of compute_catalog || []) {
    const cv = validateWithSchema('ComputeMeta', compute_meta);
    if (!cv.ok) {
      // Skip invalid entries
      continue;
    }

    const compute_passport_id = compute_meta.compute_passport_id;
    const reasons: MatchRejectReason[] = [];

    // Get live state for this compute
    const liveState = reg.getLiveState(compute_passport_id);

    // Live health filter
    if (require_live_healthy && !computeIsHealthy(compute_passport_id)) {
      reasons.push('COMPUTE_NOT_HEALTHY');
    }

    // Runtime
    const selectedRt = runtimeCompatible(model_meta, compute_meta);
    if (!selectedRt) {
      reasons.push('NO_RUNTIME_MATCH');
    }

    // Hardware
    reasons.push(...hardwareCompatible(model_meta, compute_meta));

    // Policy evaluation (compute-aware)
    const pe = evaluatePolicy({ policy, modelMeta: model_meta, computeMeta: compute_meta });
    reasons.push(...(pe.reasons as MatchRejectReason[]));

    if (reasons.length > 0) {
      rejected.push({ compute_passport_id, reasons });
      continue;
    }

    const { score, p95, cost } = scoreCompute(policy, compute_meta, liveState);
    shortlisted.push({ 
      compute_passport_id, 
      runtime: selectedRt!, 
      score,
      p95: p95 > 0 ? p95 : undefined,
      cost: cost > 0 ? cost : undefined,
    });
  }

  shortlisted.sort((a, b) => b.score - a.score);
  const selected = shortlisted[0];

  const explain: MatchExplainResult = {
    policy_hash,
    shortlisted,
    rejected,
    selected,
  };

  if (!selected) {
    return { explain };
  }

  // Build match result
  const match: MatchResult = {
    model_passport_id: model_meta.model_passport_id,
    compute_passport_id: selected.compute_passport_id,
    selected_runtime: selected.runtime,
    expected_p95: selected.p95,
    estimated_cost: selected.cost,
    fallbacks: shortlisted.slice(1, 4).map((x) => ({
      compute_passport_id: x.compute_passport_id,
      selected_runtime: x.runtime,
      expected_p95: x.p95,
      estimated_cost: x.cost,
    })),
  };

  return { match, explain };
}

/**
 * Lightweight availability check: can at least one compute node serve this model?
 *
 * - `format=api` models are always available (routed through TrustGate).
 * - Self-hosted models (`safetensors`/`gguf`) need a healthy compute node
 *   with compatible runtime and hardware.
 *
 * Short-circuits on first match — no scoring, no policy, no explain.
 */
export function hasAvailableCompute(
  modelMeta: any,
  computeCatalog: any[],
): boolean {
  // API-hosted models are always available via TrustGate
  if (modelMeta?.format === 'api') return true;

  const reg = getComputeRegistry();
  for (const compute of computeCatalog) {
    if (!runtimeCompatible(modelMeta, compute)) continue;
    if (hardwareCompatible(modelMeta, compute).length > 0) continue;
    if (!reg.isHealthy(compute.compute_passport_id)) continue;
    return true;
  }
  return false;
}
