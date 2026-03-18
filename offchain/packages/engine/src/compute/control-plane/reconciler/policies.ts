// offchain/packages/engine/src/deployment/reconciler/policies.ts
// Reconciler configuration, drift repair rules, and defaults

/* ------------------------------------------------------------------ */
/*  Reconciler Config                                                  */
/* ------------------------------------------------------------------ */

export interface ReconcilerConfig {
  /** Safety sweep polling interval in ms (default 60s) */
  pollIntervalMs: number;
  /** Deploying stuck threshold in ms (default 10 min) */
  stuckTimeoutMs: number;
  /** Provider state stale threshold in ms (default 5 min) */
  providerStalenessMs: number;
  /** Lease expiry warning threshold in ms (default 2h) */
  leaseWarningMs: number;
  /** Max retries for stuck transitions (default 3) */
  maxRetries: number;
}

/**
 * Get default reconciler config with env var overrides.
 */
export function getDefaultReconcilerConfig(): ReconcilerConfig {
  return {
    pollIntervalMs: parseInt(process.env.RECONCILER_POLL_MS || '60000', 10),
    stuckTimeoutMs: parseInt(process.env.RECONCILER_STUCK_TIMEOUT_MS || '600000', 10),
    providerStalenessMs: parseInt(process.env.RECONCILER_STALENESS_MS || '300000', 10),
    leaseWarningMs: parseInt(process.env.RECONCILER_LEASE_WARNING_MS || '7200000', 10),
    maxRetries: parseInt(process.env.RECONCILER_MAX_RETRIES || '3', 10),
  };
}

/* ------------------------------------------------------------------ */
/*  Sweep Result                                                       */
/* ------------------------------------------------------------------ */

export interface SweepResult {
  drifted: number;
  stuck: number;
  leases: number;
  health: number;
}
