// offchain/packages/engine/src/deployment/webhooks/types.ts
// Normalized provider event and normalizer interface

/**
 * Standard shape for provider webhook callbacks.
 * All provider-specific payloads are normalized to this.
 */
export interface NormalizedProviderEvent {
  provider: string;
  provider_deployment_id: string;
  provider_status: string;
  provider_status_detail: Record<string, unknown>;
  timestamp: number;
  deployment_url?: string;
}

/**
 * Per-provider normalizer.
 * Extracts deployment ID, status, and detail from provider-specific payloads.
 */
export interface IProviderNormalizer {
  normalize(body: unknown, headers: Record<string, string>): NormalizedProviderEvent;
  validateSignature?(body: unknown, headers: Record<string, string>, secret: string): boolean;
}
