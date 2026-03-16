// offchain/packages/engine/src/deployment/control-plane/postgres-store.ts
// PostgreSQL implementation of IDeploymentStore — production store

import { pool } from '../../shared/db/pool';
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

/* ------------------------------------------------------------------ */
/*  Row Mappers                                                       */
/* ------------------------------------------------------------------ */

function mapDeploymentRow(row: Record<string, unknown>): Deployment {
  return {
    deployment_id: row.deployment_id as string,
    agent_passport_id: row.agent_passport_id as string,
    tenant_id: (row.tenant_id as string) ?? null,

    version: row.version as number,
    revision: row.revision as number,

    provider: row.provider as string,
    runtime_adapter: row.runtime_adapter as string,

    desired_state: row.desired_state as Deployment['desired_state'],
    actual_state: row.actual_state as Deployment['actual_state'],
    health_status: row.health_status as Deployment['health_status'],

    provider_status: (row.provider_status as string) ?? null,
    provider_status_detail: (row.provider_status_detail as Record<string, unknown>) ?? null,

    provider_deployment_id: (row.provider_deployment_id as string) ?? null,
    provider_region: (row.provider_region as string) ?? null,
    deployment_url: (row.deployment_url as string) ?? null,
    a2a_endpoint: (row.a2a_endpoint as string) ?? null,
    wallet_address: (row.wallet_address as string) ?? null,

    deployment_slot: row.deployment_slot as string,

    descriptor_snapshot: row.descriptor_snapshot as Record<string, unknown>,
    env_vars_hash: (row.env_vars_hash as string) ?? null,
    code_bundle_hash: (row.code_bundle_hash as string) ?? null,

    lease_expires_at: row.lease_expires_at ? new Date(row.lease_expires_at as string).getTime() : null,
    last_health_at: row.last_health_at ? new Date(row.last_health_at as string).getTime() : null,
    last_transition_at: row.last_transition_at ? new Date(row.last_transition_at as string).getTime() : null,
    terminated_at: row.terminated_at ? new Date(row.terminated_at as string).getTime() : null,
    terminated_reason: (row.terminated_reason as string) ?? null,
    error: (row.error as string) ?? null,

    created_by: row.created_by as string,
    updated_by: row.updated_by as string,
    idempotency_key: (row.idempotency_key as string) ?? null,

    created_at: new Date(row.created_at as string).getTime(),
    updated_at: new Date(row.updated_at as string).getTime(),
  };
}

function mapEventRow(row: Record<string, unknown>): DeploymentEvent {
  return {
    event_id: row.event_id as string,
    deployment_id: row.deployment_id as string,
    sequence: Number(row.sequence),
    event_type: row.event_type as DeploymentEventType,
    actor: row.actor as string,
    previous_state: (row.previous_state as string) ?? null,
    new_state: (row.new_state as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    idempotency_key: (row.idempotency_key as string) ?? null,
    correlation_id: (row.correlation_id as string) ?? null,
    created_at: new Date(row.created_at as string).getTime(),
  };
}

/* ------------------------------------------------------------------ */
/*  PostgresDeploymentStore                                           */
/* ------------------------------------------------------------------ */

export class PostgresDeploymentStore implements IDeploymentStore {

  /* ---------------------------------------------------------------- */
  /*  CRUD                                                            */
  /* ---------------------------------------------------------------- */

  async create(input: CreateDeploymentInput): Promise<Deployment> {
    const result = await pool.query(
      `INSERT INTO deployments (
        agent_passport_id, tenant_id,
        provider, runtime_adapter,
        descriptor_snapshot, env_vars_hash, code_bundle_hash,
        lease_expires_at, created_by, updated_by, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10)
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
      RETURNING *`,
      [
        input.agent_passport_id,
        input.tenant_id ?? null,
        input.provider,
        input.runtime_adapter,
        JSON.stringify(input.descriptor_snapshot),
        input.env_vars_hash ?? null,
        input.code_bundle_hash ?? null,
        input.lease_expires_at ? new Date(input.lease_expires_at).toISOString() : null,
        input.created_by ?? 'system',
        input.idempotency_key ?? null,
      ],
    );

    // If rowCount=0, idempotency conflict — fetch existing
    if (result.rowCount === 0 && input.idempotency_key) {
      const existing = await this.getByIdempotencyKey(input.idempotency_key);
      if (existing) return existing;
    }

    return mapDeploymentRow(result.rows[0]);
  }

  async getById(deploymentId: string): Promise<Deployment | null> {
    const result = await pool.query(
      'SELECT * FROM deployments WHERE deployment_id = $1',
      [deploymentId],
    );
    return result.rows.length > 0 ? mapDeploymentRow(result.rows[0]) : null;
  }

  async getActiveByAgent(agentPassportId: string): Promise<Deployment | null> {
    const result = await pool.query(
      `SELECT * FROM deployments
       WHERE agent_passport_id = $1
         AND deployment_slot = 'primary'
         AND actual_state NOT IN ('terminated', 'failed')
       ORDER BY created_at DESC
       LIMIT 1`,
      [agentPassportId],
    );
    return result.rows.length > 0 ? mapDeploymentRow(result.rows[0]) : null;
  }

  async getByProviderDeploymentId(provider: string, providerDeploymentId: string): Promise<Deployment | null> {
    const result = await pool.query(
      `SELECT * FROM deployments
       WHERE provider = $1 AND provider_deployment_id = $2`,
      [provider, providerDeploymentId],
    );
    return result.rows.length > 0 ? mapDeploymentRow(result.rows[0]) : null;
  }

  async listByAgent(agentPassportId: string, filters?: DeploymentFilters): Promise<Deployment[]> {
    const { where, params } = this.buildFilterClauses(filters, 2);
    const orderBy = filters?.order_by ?? 'created_at';
    const orderDir = filters?.order_dir ?? 'desc';
    const limit = filters?.limit ?? 100;
    const offset = filters?.offset ?? 0;

    const result = await pool.query(
      `SELECT * FROM deployments
       WHERE agent_passport_id = $1 ${where}
       ORDER BY ${orderBy} ${orderDir}
       LIMIT ${limit} OFFSET ${offset}`,
      [agentPassportId, ...params],
    );
    return result.rows.map(mapDeploymentRow);
  }

  async list(filters?: DeploymentFilters): Promise<Deployment[]> {
    const { where, params } = this.buildFilterClauses(filters, 1);
    const orderBy = filters?.order_by ?? 'created_at';
    const orderDir = filters?.order_dir ?? 'desc';
    const limit = filters?.limit ?? 100;
    const offset = filters?.offset ?? 0;

    const result = await pool.query(
      `SELECT * FROM deployments
       WHERE true ${where}
       ORDER BY ${orderBy} ${orderDir}
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    return result.rows.map(mapDeploymentRow);
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
    // Read current state for validation
    const current = await this.getById(deploymentId);
    if (!current) throw new Error(`Deployment not found: ${deploymentId}`);

    // Validate transition before hitting DB
    assertValidTransition(current.actual_state, newState);

    const actor = opts?.actor ?? 'system';
    const isTerminated = newState === 'terminated';

    const result = await pool.query(
      `UPDATE deployments
       SET actual_state = $1,
           version = version + 1,
           updated_at = NOW(),
           updated_by = $2,
           last_transition_at = NOW(),
           error = COALESCE($3, error),
           provider_status = COALESCE($4, provider_status),
           provider_status_detail = COALESCE($5, provider_status_detail),
           terminated_at = CASE WHEN $6 THEN NOW() ELSE terminated_at END,
           terminated_reason = CASE WHEN $6 THEN $7 ELSE terminated_reason END
       WHERE deployment_id = $8 AND version = $9
       RETURNING *`,
      [
        newState,
        actor,
        opts?.error ?? null,
        opts?.providerStatus ?? null,
        opts?.providerStatusDetail ? JSON.stringify(opts.providerStatusDetail) : null,
        isTerminated,
        isTerminated ? (opts?.terminatedReason ?? 'user_request') : null,
        deploymentId,
        version,
      ],
    );

    if (result.rowCount === 0) {
      throw new StaleVersionError(deploymentId, version, current.version);
    }

    return mapDeploymentRow(result.rows[0]);
  }

  /* ---------------------------------------------------------------- */
  /*  Health updates                                                  */
  /* ---------------------------------------------------------------- */

  async updateHealth(deploymentId: string, health: HealthStatus, lastCheckAt: number): Promise<void> {
    await pool.query(
      `UPDATE deployments
       SET health_status = $1,
           last_health_at = $2,
           version = version + 1,
           updated_at = NOW(),
           updated_by = 'health_monitor'
       WHERE deployment_id = $3`,
      [health, new Date(lastCheckAt).toISOString(), deploymentId],
    );
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
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (resources.provider_deployment_id !== undefined) {
      sets.push(`provider_deployment_id = $${idx++}`);
      params.push(resources.provider_deployment_id);
    }
    if (resources.deployment_url !== undefined) {
      sets.push(`deployment_url = $${idx++}`);
      params.push(resources.deployment_url);
    }
    if (resources.a2a_endpoint !== undefined) {
      sets.push(`a2a_endpoint = $${idx++}`);
      params.push(resources.a2a_endpoint);
    }
    if (resources.wallet_address !== undefined) {
      sets.push(`wallet_address = $${idx++}`);
      params.push(resources.wallet_address);
    }
    if (resources.provider_status !== undefined) {
      sets.push(`provider_status = $${idx++}`);
      params.push(resources.provider_status);
    }
    if (resources.provider_status_detail !== undefined) {
      sets.push(`provider_status_detail = $${idx++}`);
      params.push(JSON.stringify(resources.provider_status_detail));
    }
    if (resources.provider_region !== undefined) {
      sets.push(`provider_region = $${idx++}`);
      params.push(resources.provider_region);
    }

    if (sets.length === 0) return;

    sets.push(`version = version + 1`);
    sets.push(`updated_at = NOW()`);
    sets.push(`updated_by = 'system'`);

    params.push(deploymentId);

    await pool.query(
      `UPDATE deployments SET ${sets.join(', ')} WHERE deployment_id = $${idx}`,
      params,
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Lease management                                                */
  /* ---------------------------------------------------------------- */

  async updateLease(deploymentId: string, expiresAt: number): Promise<void> {
    await pool.query(
      `UPDATE deployments
       SET lease_expires_at = $1,
           version = version + 1,
           updated_at = NOW(),
           updated_by = 'lease_manager'
       WHERE deployment_id = $2`,
      [new Date(expiresAt).toISOString(), deploymentId],
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Revision                                                        */
  /* ---------------------------------------------------------------- */

  async incrementRevision(
    deploymentId: string,
    newDescriptor: Record<string, unknown>,
    actor: string,
  ): Promise<Deployment> {
    const result = await pool.query(
      `UPDATE deployments
       SET revision = revision + 1,
           version = version + 1,
           descriptor_snapshot = $1,
           updated_at = NOW(),
           updated_by = $2
       WHERE deployment_id = $3
       RETURNING *`,
      [JSON.stringify(newDescriptor), actor, deploymentId],
    );

    if (result.rowCount === 0) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    return mapDeploymentRow(result.rows[0]);
  }

  /* ---------------------------------------------------------------- */
  /*  Events                                                          */
  /* ---------------------------------------------------------------- */

  async appendEvent(event: CreateDeploymentEvent): Promise<DeploymentEvent> {
    const result = await pool.query(
      `INSERT INTO deployment_events (
        deployment_id, event_type, actor,
        previous_state, new_state, metadata,
        idempotency_key, correlation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
      RETURNING *`,
      [
        event.deployment_id,
        event.event_type,
        event.actor,
        event.previous_state ?? null,
        event.new_state ?? null,
        JSON.stringify(event.metadata ?? {}),
        event.idempotency_key ?? null,
        event.correlation_id ?? null,
      ],
    );

    // Idempotency: if conflict, find existing
    if (result.rowCount === 0 && event.idempotency_key) {
      const existing = await pool.query(
        `SELECT * FROM deployment_events WHERE idempotency_key = $1`,
        [event.idempotency_key],
      );
      if (existing.rows.length > 0) return mapEventRow(existing.rows[0]);
    }

    return mapEventRow(result.rows[0]);
  }

  async getEvents(
    deploymentId: string,
    options?: { limit?: number; since?: number; types?: DeploymentEventType[] },
  ): Promise<DeploymentEvent[]> {
    const params: unknown[] = [deploymentId];
    let where = 'WHERE deployment_id = $1';
    let idx = 2;

    if (options?.types && options.types.length > 0) {
      where += ` AND event_type = ANY($${idx++})`;
      params.push(options.types);
    }

    if (options?.since) {
      where += ` AND created_at >= $${idx++}`;
      params.push(new Date(options.since).toISOString());
    }

    const limit = options?.limit ?? 100;

    const result = await pool.query(
      `SELECT * FROM deployment_events
       ${where}
       ORDER BY created_at DESC
       LIMIT ${limit}`,
      params,
    );

    return result.rows.map(mapEventRow);
  }

  /* ---------------------------------------------------------------- */
  /*  Phase 2 queries                                                 */
  /* ---------------------------------------------------------------- */

  async listByState(state: ActualState): Promise<Deployment[]> {
    const result = await pool.query(
      'SELECT * FROM deployments WHERE actual_state = $1 ORDER BY updated_at DESC',
      [state],
    );
    return result.rows.map(mapDeploymentRow);
  }

  async listExpiringLeases(withinMs: number): Promise<Deployment[]> {
    const result = await pool.query(
      `SELECT * FROM deployments
       WHERE lease_expires_at IS NOT NULL
         AND lease_expires_at < NOW() + make_interval(secs => $1::double precision / 1000)
         AND actual_state NOT IN ('terminated')
       ORDER BY lease_expires_at ASC`,
      [withinMs],
    );
    return result.rows.map(mapDeploymentRow);
  }

  async listDrifted(): Promise<Deployment[]> {
    const result = await pool.query(
      `SELECT * FROM deployments
       WHERE desired_state != actual_state
         AND actual_state NOT IN ('terminated')
       ORDER BY updated_at DESC`,
    );
    return result.rows.map(mapDeploymentRow);
  }

  /* ---------------------------------------------------------------- */
  /*  Idempotency                                                     */
  /* ---------------------------------------------------------------- */

  async getByIdempotencyKey(key: string): Promise<Deployment | null> {
    const result = await pool.query(
      'SELECT * FROM deployments WHERE idempotency_key = $1',
      [key],
    );
    return result.rows.length > 0 ? mapDeploymentRow(result.rows[0]) : null;
  }

  /* ---------------------------------------------------------------- */
  /*  Private helpers                                                 */
  /* ---------------------------------------------------------------- */

  private buildFilterClauses(
    filters: DeploymentFilters | undefined,
    startIdx: number,
  ): { where: string; params: unknown[] } {
    if (!filters) return { where: '', params: [] };

    const clauses: string[] = [];
    const params: unknown[] = [];
    let idx = startIdx;

    if (filters.tenant_id) {
      clauses.push(`AND tenant_id = $${idx++}`);
      params.push(filters.tenant_id);
    }

    if (filters.provider) {
      clauses.push(`AND provider = $${idx++}`);
      params.push(filters.provider);
    }

    if (filters.actual_state) {
      if (Array.isArray(filters.actual_state)) {
        clauses.push(`AND actual_state = ANY($${idx++})`);
        params.push(filters.actual_state);
      } else {
        clauses.push(`AND actual_state = $${idx++}`);
        params.push(filters.actual_state);
      }
    }

    if (filters.health_status) {
      clauses.push(`AND health_status = $${idx++}`);
      params.push(filters.health_status);
    }

    return { where: clauses.join(' '), params };
  }
}
