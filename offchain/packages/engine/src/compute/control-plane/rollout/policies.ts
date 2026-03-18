// offchain/packages/engine/src/deployment/rollout/policies.ts
// RolloutConfig — configuration for blue-green rollout behavior

/**
 * Configuration for blue-green rollout behavior.
 */
export interface RolloutConfig {
  /** Duration (ms) the blue deployment must be healthy before auto-promote. Default: 30000 (30s). */
  healthGateDurationMs: number;

  /** If true, automatically promote blue after health gate passes. Default: false (manual promote). */
  autoPromote: boolean;

  /** If true, automatically rollback when blue fails. Default: false (future). */
  rollbackOnFailure: boolean;
}

/**
 * Returns default rollout config, reading from env vars when available.
 */
export function getDefaultRolloutConfig(): RolloutConfig {
  return {
    healthGateDurationMs: parseInt(process.env.ROLLOUT_HEALTH_GATE_MS || '30000', 10),
    autoPromote: process.env.ROLLOUT_AUTO_PROMOTE === 'true',
    rollbackOnFailure: process.env.ROLLOUT_AUTO_ROLLBACK === 'true',
  };
}
