// offchain/packages/engine/src/deployment/control-plane/types.ts
// Core types for the Deployment Control Plane

/* ------------------------------------------------------------------ */
/*  Enums (as const tuples for runtime + type extraction)             */
/* ------------------------------------------------------------------ */

export const DESIRED_STATES = ['running', 'stopped', 'terminated'] as const;
export type DesiredState = (typeof DESIRED_STATES)[number];

export const ACTUAL_STATES = ['pending', 'deploying', 'running', 'stopped', 'failed', 'terminated'] as const;
export type ActualState = (typeof ACTUAL_STATES)[number];

export const HEALTH_STATES = ['healthy', 'degraded', 'unhealthy', 'unknown'] as const;
export type HealthStatus = (typeof HEALTH_STATES)[number];

export const DEPLOYMENT_EVENT_TYPES = [
  // Lifecycle
  'created', 'started', 'succeeded', 'failed', 'stopped', 'terminated', 'restarted',
  // Health
  'health_changed',
  // Lease
  'lease_extended', 'lease_expiring',
  // Config
  'config_updated', 'scaled',
  // Rollout (Phase 3 prep)
  'promoted', 'rolled_back',
] as const;
export type DeploymentEventType = (typeof DEPLOYMENT_EVENT_TYPES)[number];

/* ------------------------------------------------------------------ */
/*  Deployment Record                                                 */
/* ------------------------------------------------------------------ */

export interface Deployment {
  deployment_id: string;
  agent_passport_id: string;
  tenant_id: string | null;

  // Versioning
  version: number;       // optimistic locking — incremented on any write
  revision: number;      // deployment generation — incremented on redeploy/config change

  // Provider
  provider: string;
  runtime_adapter: string;

  // Platform state
  desired_state: DesiredState;
  actual_state: ActualState;
  health_status: HealthStatus;

  // Provider state (raw)
  provider_status: string | null;
  provider_status_detail: Record<string, unknown> | null;

  // Provider resources
  provider_deployment_id: string | null;
  provider_region: string | null;
  deployment_url: string | null;
  a2a_endpoint: string | null;
  wallet_address: string | null;

  // Rollout slot
  deployment_slot: string;

  // Config snapshot (frozen at deploy time)
  descriptor_snapshot: Record<string, unknown>;
  env_vars_hash: string | null;
  code_bundle_hash: string | null;

  // Lifecycle timestamps (Unix ms)
  lease_expires_at: number | null;
  last_health_at: number | null;
  last_transition_at: number | null;
  terminated_at: number | null;
  terminated_reason: string | null;
  error: string | null;

  // Audit
  created_by: string;
  updated_by: string;
  idempotency_key: string | null;

  // Standard timestamps (Unix ms)
  created_at: number;
  updated_at: number;
}

/* ------------------------------------------------------------------ */
/*  Deployment Event                                                  */
/* ------------------------------------------------------------------ */

export interface DeploymentEvent {
  event_id: string;
  deployment_id: string;
  sequence: number;
  event_type: DeploymentEventType;
  actor: string;
  previous_state: string | null;
  new_state: string | null;
  metadata: Record<string, unknown>;
  idempotency_key: string | null;
  correlation_id: string | null;
  created_at: number;   // Unix ms
}

/* ------------------------------------------------------------------ */
/*  Inputs                                                            */
/* ------------------------------------------------------------------ */

export interface CreateDeploymentInput {
  agent_passport_id: string;
  tenant_id?: string;
  provider: string;
  runtime_adapter: string;
  descriptor_snapshot: Record<string, unknown>;
  env_vars_hash?: string;
  code_bundle_hash?: string;
  lease_expires_at?: number;
  created_by?: string;
  idempotency_key?: string;
}

export interface CreateDeploymentEvent {
  deployment_id: string;
  event_type: DeploymentEventType;
  actor: string;
  previous_state?: string;
  new_state?: string;
  metadata?: Record<string, unknown>;
  idempotency_key?: string;
  correlation_id?: string;
}

/* ------------------------------------------------------------------ */
/*  Filters                                                           */
/* ------------------------------------------------------------------ */

export interface DeploymentFilters {
  tenant_id?: string;
  provider?: string;
  actual_state?: ActualState | ActualState[];
  health_status?: HealthStatus;
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'updated_at';
  order_dir?: 'asc' | 'desc';
}

/* ------------------------------------------------------------------ */
/*  Error Classes                                                     */
/* ------------------------------------------------------------------ */

export class StaleVersionError extends Error {
  constructor(deploymentId: string, expected: number, actual: number) {
    super(`Stale version for deployment ${deploymentId}: expected ${expected}, got ${actual}`);
    this.name = 'StaleVersionError';
  }
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}
