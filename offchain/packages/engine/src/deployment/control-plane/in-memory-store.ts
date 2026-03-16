// offchain/packages/engine/src/deployment/control-plane/in-memory-store.ts
// In-memory implementation of IDeploymentStore — for tests and local dev

import * as crypto from 'crypto';
import type { IDeploymentStore } from './store';
import { assertValidTransition } from './state-machine';
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
import { StaleVersionError } from './types';

export class InMemoryDeploymentStore implements IDeploymentStore {
  private deployments = new Map<string, Deployment>();
  private events: DeploymentEvent[] = [];
  private eventSequence = 0;

  /* ---------------------------------------------------------------- */
  /*  CRUD                                                            */
  /* ---------------------------------------------------------------- */

  async create(input: CreateDeploymentInput): Promise<Deployment> {
    // Idempotency: check by key first
    if (input.idempotency_key) {
      const existing = await this.getByIdempotencyKey(input.idempotency_key);
      if (existing) return existing;
    }

    const now = Date.now();
    const deployment: Deployment = {
      deployment_id: crypto.randomUUID(),
      agent_passport_id: input.agent_passport_id,
      tenant_id: input.tenant_id ?? null,

      version: 1,
      revision: 1,

      provider: input.provider,
      runtime_adapter: input.runtime_adapter,

      desired_state: 'running',
      actual_state: 'pending',
      health_status: 'unknown',

      provider_status: null,
      provider_status_detail: null,

      provider_deployment_id: null,
      provider_region: null,
      deployment_url: null,
      a2a_endpoint: null,
      wallet_address: null,

      deployment_slot: 'primary',

      descriptor_snapshot: input.descriptor_snapshot,
      env_vars_hash: input.env_vars_hash ?? null,
      code_bundle_hash: input.code_bundle_hash ?? null,

      lease_expires_at: input.lease_expires_at ?? null,
      last_health_at: null,
      last_transition_at: now,
      terminated_at: null,
      terminated_reason: null,
      error: null,

      created_by: input.created_by ?? 'system',
      updated_by: input.created_by ?? 'system',
      idempotency_key: input.idempotency_key ?? null,

      created_at: now,
      updated_at: now,
    };

    this.deployments.set(deployment.deployment_id, deployment);
    return { ...deployment };
  }

  async getById(deploymentId: string): Promise<Deployment | null> {
    const d = this.deployments.get(deploymentId);
    return d ? { ...d } : null;
  }

  async getActiveByAgent(agentPassportId: string): Promise<Deployment | null> {
    // Latest non-terminated/non-failed in 'primary' slot
    let latest: Deployment | null = null;
    for (const d of this.deployments.values()) {
      if (
        d.agent_passport_id === agentPassportId &&
        d.deployment_slot === 'primary' &&
        d.actual_state !== 'terminated' &&
        d.actual_state !== 'failed'
      ) {
        if (!latest || d.created_at > latest.created_at) {
          latest = d;
        }
      }
    }
    return latest ? { ...latest } : null;
  }

  async getByProviderDeploymentId(provider: string, providerDeploymentId: string): Promise<Deployment | null> {
    for (const d of this.deployments.values()) {
      if (d.provider === provider && d.provider_deployment_id === providerDeploymentId) {
        return { ...d };
      }
    }
    return null;
  }

  async listByAgent(agentPassportId: string, filters?: DeploymentFilters): Promise<Deployment[]> {
    let results = Array.from(this.deployments.values())
      .filter(d => d.agent_passport_id === agentPassportId);
    results = this.applyFilters(results, filters);
    return results.map(d => ({ ...d }));
  }

  async list(filters?: DeploymentFilters): Promise<Deployment[]> {
    let results = Array.from(this.deployments.values());
    results = this.applyFilters(results, filters);
    return results.map(d => ({ ...d }));
  }

  /* ---------------------------------------------------------------- */
  /*  State transitions                                               */
  /* ---------------------------------------------------------------- */

  async transition(
    deploymentId: string,
    newState: ActualState,
    version: number,
    opts?: {
      actor?: string;
      error?: string;
      providerStatus?: string;
      providerStatusDetail?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      terminatedReason?: string;
    },
  ): Promise<Deployment> {
    const d = this.deployments.get(deploymentId);
    if (!d) throw new Error(`Deployment not found: ${deploymentId}`);

    // Validate transition
    assertValidTransition(d.actual_state, newState);

    // Optimistic locking
    if (d.version !== version) {
      throw new StaleVersionError(deploymentId, version, d.version);
    }

    const now = Date.now();
    d.actual_state = newState;
    d.version += 1;
    d.updated_at = now;
    d.updated_by = opts?.actor ?? 'system';
    d.last_transition_at = now;

    if (opts?.error !== undefined) d.error = opts.error;
    if (opts?.providerStatus !== undefined) d.provider_status = opts.providerStatus;
    if (opts?.providerStatusDetail !== undefined) d.provider_status_detail = opts.providerStatusDetail;

    // Terminal state handling
    if (newState === 'terminated') {
      d.terminated_at = now;
      d.terminated_reason = opts?.terminatedReason ?? 'user_request';
    }

    return { ...d };
  }

  /* ---------------------------------------------------------------- */
  /*  Health updates                                                  */
  /* ---------------------------------------------------------------- */

  async updateHealth(deploymentId: string, health: HealthStatus, lastCheckAt: number): Promise<void> {
    const d = this.deployments.get(deploymentId);
    if (!d) throw new Error(`Deployment not found: ${deploymentId}`);

    d.health_status = health;
    d.last_health_at = lastCheckAt;
    d.version += 1;
    d.updated_at = Date.now();
    d.updated_by = 'health_monitor';
  }

  /* ---------------------------------------------------------------- */
  /*  Provider resource updates                                       */
  /* ---------------------------------------------------------------- */

  async updateProviderResources(deploymentId: string, resources: {
    provider_deployment_id?: string;
    deployment_url?: string;
    a2a_endpoint?: string;
    wallet_address?: string;
    provider_status?: string;
    provider_status_detail?: Record<string, unknown>;
    provider_region?: string;
  }): Promise<void> {
    const d = this.deployments.get(deploymentId);
    if (!d) throw new Error(`Deployment not found: ${deploymentId}`);

    if (resources.provider_deployment_id !== undefined) d.provider_deployment_id = resources.provider_deployment_id;
    if (resources.deployment_url !== undefined) d.deployment_url = resources.deployment_url;
    if (resources.a2a_endpoint !== undefined) d.a2a_endpoint = resources.a2a_endpoint;
    if (resources.wallet_address !== undefined) d.wallet_address = resources.wallet_address;
    if (resources.provider_status !== undefined) d.provider_status = resources.provider_status;
    if (resources.provider_status_detail !== undefined) d.provider_status_detail = resources.provider_status_detail;
    if (resources.provider_region !== undefined) d.provider_region = resources.provider_region;

    d.version += 1;
    d.updated_at = Date.now();
    d.updated_by = 'system';
  }

  /* ---------------------------------------------------------------- */
  /*  Lease management                                                */
  /* ---------------------------------------------------------------- */

  async updateLease(deploymentId: string, expiresAt: number): Promise<void> {
    const d = this.deployments.get(deploymentId);
    if (!d) throw new Error(`Deployment not found: ${deploymentId}`);

    d.lease_expires_at = expiresAt;
    d.version += 1;
    d.updated_at = Date.now();
    d.updated_by = 'lease_manager';
  }

  /* ---------------------------------------------------------------- */
  /*  Revision                                                        */
  /* ---------------------------------------------------------------- */

  async incrementRevision(
    deploymentId: string,
    newDescriptor: Record<string, unknown>,
    actor: string,
  ): Promise<Deployment> {
    const d = this.deployments.get(deploymentId);
    if (!d) throw new Error(`Deployment not found: ${deploymentId}`);

    d.revision += 1;
    d.version += 1;
    d.descriptor_snapshot = newDescriptor;
    d.updated_at = Date.now();
    d.updated_by = actor;

    return { ...d };
  }

  /* ---------------------------------------------------------------- */
  /*  Events                                                          */
  /* ---------------------------------------------------------------- */

  async appendEvent(event: CreateDeploymentEvent): Promise<DeploymentEvent> {
    // Idempotency check
    if (event.idempotency_key) {
      const existing = this.events.find(e => e.idempotency_key === event.idempotency_key);
      if (existing) return { ...existing };
    }

    this.eventSequence += 1;
    const now = Date.now();

    const de: DeploymentEvent = {
      event_id: crypto.randomUUID(),
      deployment_id: event.deployment_id,
      sequence: this.eventSequence,
      event_type: event.event_type,
      actor: event.actor,
      previous_state: event.previous_state ?? null,
      new_state: event.new_state ?? null,
      metadata: event.metadata ?? {},
      idempotency_key: event.idempotency_key ?? null,
      correlation_id: event.correlation_id ?? null,
      created_at: now,
    };

    this.events.push(de);
    return { ...de };
  }

  async getEvents(
    deploymentId: string,
    options?: { limit?: number; since?: number; types?: DeploymentEventType[] },
  ): Promise<DeploymentEvent[]> {
    let results = this.events.filter(e => e.deployment_id === deploymentId);

    if (options?.types && options.types.length > 0) {
      results = results.filter(e => options.types!.includes(e.event_type));
    }

    if (options?.since) {
      results = results.filter(e => e.created_at >= options.since!);
    }

    // Order by created_at DESC (most recent first)
    results.sort((a, b) => b.created_at - a.created_at || b.sequence - a.sequence);

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results.map(e => ({ ...e }));
  }

  /* ---------------------------------------------------------------- */
  /*  Phase 2 queries                                                 */
  /* ---------------------------------------------------------------- */

  async listByState(state: ActualState): Promise<Deployment[]> {
    return Array.from(this.deployments.values())
      .filter(d => d.actual_state === state)
      .map(d => ({ ...d }));
  }

  async listExpiringLeases(withinMs: number): Promise<Deployment[]> {
    const deadline = Date.now() + withinMs;
    return Array.from(this.deployments.values())
      .filter(d =>
        d.lease_expires_at !== null &&
        d.lease_expires_at < deadline &&
        d.actual_state !== 'terminated',
      )
      .map(d => ({ ...d }));
  }

  async listDrifted(): Promise<Deployment[]> {
    return Array.from(this.deployments.values())
      .filter(d => {
        if (d.actual_state === 'terminated') return false;
        return d.desired_state !== d.actual_state;
      })
      .map(d => ({ ...d }));
  }

  /* ---------------------------------------------------------------- */
  /*  Idempotency                                                     */
  /* ---------------------------------------------------------------- */

  async getByIdempotencyKey(key: string): Promise<Deployment | null> {
    for (const d of this.deployments.values()) {
      if (d.idempotency_key === key) {
        return { ...d };
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------- */
  /*  Private helpers                                                 */
  /* ---------------------------------------------------------------- */

  private applyFilters(results: Deployment[], filters?: DeploymentFilters): Deployment[] {
    if (!filters) return results;

    if (filters.tenant_id) {
      results = results.filter(d => d.tenant_id === filters.tenant_id);
    }

    if (filters.provider) {
      results = results.filter(d => d.provider === filters.provider);
    }

    if (filters.actual_state) {
      const states = Array.isArray(filters.actual_state)
        ? filters.actual_state
        : [filters.actual_state];
      results = results.filter(d => states.includes(d.actual_state));
    }

    if (filters.health_status) {
      results = results.filter(d => d.health_status === filters.health_status);
    }

    // Ordering
    const orderBy = filters.order_by ?? 'created_at';
    const orderDir = filters.order_dir ?? 'desc';
    results.sort((a, b) => {
      const aVal = a[orderBy];
      const bVal = b[orderBy];
      return orderDir === 'desc' ? bVal - aVal : aVal - bVal;
    });

    // Pagination
    if (filters.offset) {
      results = results.slice(filters.offset);
    }
    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }
}
