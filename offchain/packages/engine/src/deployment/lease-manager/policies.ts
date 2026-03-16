// offchain/packages/engine/src/deployment/lease-manager/policies.ts
// Lease configuration and defaults

export interface LeaseConfig {
  /** Warning threshold in ms before expiry (default 2h) */
  warningThresholdMs: number;
  /** Extension duration in hours (default 24) */
  extensionHours: number;
}

/**
 * Get default lease config with env var overrides.
 */
export function getDefaultLeaseConfig(): LeaseConfig {
  return {
    warningThresholdMs: parseInt(process.env.RECONCILER_LEASE_WARNING_MS || '7200000', 10),
    extensionHours: parseInt(process.env.LEASE_EXTENSION_HOURS || '24', 10),
  };
}
