// offchain/packages/engine/src/deployment/control-plane/store.ts
// IDeploymentStore — the contract all store implementations must satisfy

import type {
  Deployment,
  DeploymentEvent,
  CreateDeploymentInput,
  CreateDeploymentEvent,
  DeploymentFilters,
  ActualState,
  HealthStatus,
  DeploymentEventType,
} from './types';

export interface IDeploymentStore {
  /* ---------------------------------------------------------------- */
  /*  CRUD                                                            */
  /* ---------------------------------------------------------------- */

  /** Create a new deployment. Idempotent when `idempotency_key` is provided. */
  create(input: CreateDeploymentInput): Promise<Deployment>;

  /** Get a single deployment by ID. */
  getById(deploymentId: string): Promise<Deployment | null>;

  /** Get the active (non-terminated, non-failed) deployment for an agent in the 'primary' slot. */
  getActiveByAgent(agentPassportId: string): Promise<Deployment | null>;

  /** Find a deployment by its provider-assigned ID. */
  getByProviderDeploymentId(provider: string, providerDeploymentId: string): Promise<Deployment | null>;

  /** List deployments for a specific agent, optionally filtered. */
  listByAgent(agentPassportId: string, filters?: DeploymentFilters): Promise<Deployment[]>;

  /** List all deployments matching filters. */
  list(filters?: DeploymentFilters): Promise<Deployment[]>;

  /* ---------------------------------------------------------------- */
  /*  State transitions (optimistic locking)                          */
  /* ---------------------------------------------------------------- */

  /**
   * Transition a deployment to a new actual_state.
   * - Validates via assertValidTransition
   * - Checks version for optimistic locking (throws StaleVersionError)
   * - Increments version, sets updated_at, updated_by
   * - If transitioning to 'terminated': sets terminated_at + terminated_reason
   */
  transition(deploymentId: string, newState: ActualState, version: number, opts?: {
    actor?: string;
    error?: string;
    providerStatus?: string;
    providerStatusDetail?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    terminatedReason?: string;
  }): Promise<Deployment>;

  /* ---------------------------------------------------------------- */
  /*  Health updates                                                  */
  /* ---------------------------------------------------------------- */

  /** Update health status. Increments version. */
  updateHealth(deploymentId: string, health: HealthStatus, lastCheckAt: number): Promise<void>;

  /* ---------------------------------------------------------------- */
  /*  Provider resource updates                                       */
  /* ---------------------------------------------------------------- */

  /** Update provider-side resource fields. Increments version. */
  updateProviderResources(deploymentId: string, resources: {
    provider_deployment_id?: string;
    deployment_url?: string;
    a2a_endpoint?: string;
    wallet_address?: string;
    provider_status?: string;
    provider_status_detail?: Record<string, unknown>;
    provider_region?: string;
  }): Promise<void>;

  /* ---------------------------------------------------------------- */
  /*  Lease management                                                */
  /* ---------------------------------------------------------------- */

  /** Update lease expiry. Increments version. */
  updateLease(deploymentId: string, expiresAt: number): Promise<void>;

  /* ---------------------------------------------------------------- */
  /*  Revision (for redeploy / config changes)                        */
  /* ---------------------------------------------------------------- */

  /** Increment revision, update descriptor snapshot. Bumps both version and revision. */
  incrementRevision(deploymentId: string, newDescriptor: Record<string, unknown>, actor: string): Promise<Deployment>;

  /* ---------------------------------------------------------------- */
  /*  Events (append-only)                                            */
  /* ---------------------------------------------------------------- */

  /** Append an event to the deployment event log. Idempotent via idempotency_key. */
  appendEvent(event: CreateDeploymentEvent): Promise<DeploymentEvent>;

  /** Get events for a deployment, ordered by created_at DESC. */
  getEvents(deploymentId: string, options?: {
    limit?: number;
    since?: number;
    types?: DeploymentEventType[];
  }): Promise<DeploymentEvent[]>;

  /* ---------------------------------------------------------------- */
  /*  Queries for Phase 2 (reconciler, lease manager)                 */
  /* ---------------------------------------------------------------- */

  /** List all deployments in a given actual_state. */
  listByState(state: ActualState): Promise<Deployment[]>;

  /** List deployments whose lease expires within `withinMs` milliseconds from now. */
  listExpiringLeases(withinMs: number): Promise<Deployment[]>;

  /** List deployments where desired_state != actual_state (excluding terminated). */
  listDrifted(): Promise<Deployment[]>;

  /* ---------------------------------------------------------------- */
  /*  Idempotency                                                     */
  /* ---------------------------------------------------------------- */

  /** Find a deployment by its idempotency key. */
  getByIdempotencyKey(key: string): Promise<Deployment | null>;

  /* ---------------------------------------------------------------- */
  /*  Phase 3: Blue-green slot management                             */
  /* ---------------------------------------------------------------- */

  /**
   * Atomically promote blue → primary, old primary → terminated.
   * Both updates must succeed or neither does.
   * Throws if no blue deployment exists for the agent.
   */
  promoteBlue(agentPassportId: string): Promise<{ promoted: Deployment; terminated: Deployment }>;

  /**
   * Find a deployment by agent + slot.
   * Returns null if no deployment exists in that slot.
   */
  getBySlot(agentPassportId: string, slot: string): Promise<Deployment | null>;
}
