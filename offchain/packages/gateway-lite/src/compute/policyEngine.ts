import { canonicalSha256Hex } from '../../../engine/src/crypto/hash';
import { validateWithSchema } from '../../../engine/src/crypto/schemaValidator';

export type ReasonCode =
  | 'INVALID_POLICY'
  | 'REGION_NOT_ALLOWED'
  | 'RESIDENCY_REQUIRED_NOT_SUPPORTED'
  | 'ATTESTATION_REQUIRED_NOT_SUPPORTED'
  | 'CC_ON_REQUIRED_NOT_SUPPORTED'
  | 'LATENCY_BUDGET_EXCEEDED'
  | 'COST_BUDGET_EXCEEDED';

export interface PolicyEvaluateResult {
  allowed: boolean;
  reasons: ReasonCode[];
  policy_hash: string;
}

// Minimal shapes matching our JSON schemas (we validate dynamically via AJV).
export type Policy = Record<string, any>;
export type ModelMeta = Record<string, any>;
export type ComputeMeta = Record<string, any>;

/**
 * Deterministic policy evaluation.
 * - Pure: no network calls.
 * - Explainable: stable reason codes.
 * - Deterministic hashing: policy_hash = sha256(JCS(policy)).
 */
export function evaluatePolicy(input: {
  policy: Policy;
  modelMeta?: ModelMeta;
  computeMeta?: ComputeMeta;
}): PolicyEvaluateResult {
  const { policy, modelMeta, computeMeta } = input;

  const pv = validateWithSchema('Policy', policy);
  if (!pv.ok) {
    // Treat invalid policy as deny with proper reason code.
    return {
      allowed: false,
      reasons: ['INVALID_POLICY'],
      policy_hash: canonicalSha256Hex(policy),
    };
  }

  const policy_hash = canonicalSha256Hex(policy);
  const reasons: ReasonCode[] = [];

  // Region constraint
  const allowRegions: string[] = Array.isArray(policy.allow_regions) ? policy.allow_regions : [];
  if (computeMeta && allowRegions.length > 0) {
    const regions: string[] = Array.isArray(computeMeta.regions) ? computeMeta.regions : [];
    const ok = regions.some((r) => allowRegions.includes(r));
    if (!ok) reasons.push('REGION_NOT_ALLOWED');
  }

  // Residency
  if (computeMeta && policy.residency_required === true) {
    if (computeMeta.residency_supported !== true) {
      reasons.push('RESIDENCY_REQUIRED_NOT_SUPPORTED');
    }
  }

  // Attestation + CC-on
  const att = policy.attestation || {};
  if (computeMeta) {
    const caps = computeMeta.capabilities || {};
    if (att.attestation_required === true && caps.supports_attestation !== true) {
      reasons.push('ATTESTATION_REQUIRED_NOT_SUPPORTED');
    }
    if (att.require_cc_on === true && caps.supports_cc_on !== true) {
      reasons.push('CC_ON_REQUIRED_NOT_SUPPORTED');
    }
  }

  // Latency
  if (computeMeta && policy.latency?.p95_ms_budget != null) {
    const budget = Number(policy.latency.p95_ms_budget);
    const p95 = Number(computeMeta.network?.p95_ms_estimate ?? 0);
    if (Number.isFinite(budget) && Number.isFinite(p95) && p95 > 0 && p95 > budget) {
      reasons.push('LATENCY_BUDGET_EXCEEDED');
    }
  }

  // Cost
  if (computeMeta && policy.cost?.max_price_per_1k_tokens_usd != null) {
    const max = Number(policy.cost.max_price_per_1k_tokens_usd);
    const est = Number(computeMeta.pricing?.price_per_1k_tokens_estimate ?? 0);
    if (Number.isFinite(max) && Number.isFinite(est) && est > 0 && est > max) {
      reasons.push('COST_BUDGET_EXCEEDED');
    }
  }

  // If policy specifies spot_only, we'd need compute pricing metadata; leave for later.

  return {
    allowed: reasons.length === 0,
    reasons,
    policy_hash,
  };
}
