/**
 * Tenant Context — Multi-tenant isolation for cloud deployments.
 *
 * Self-hosted: MULTI_TENANT=false (default) — tenant_id is always 'default'.
 * Cloud: MULTI_TENANT=true — tenant_id injected per-request from gateway auth.
 *
 * Works with Postgres RLS: SET app.current_tenant = '<tenant_id>'
 * on each connection so RLS policies filter rows automatically.
 */

import { AsyncLocalStorage } from 'async_hooks';

const tenantStore = new AsyncLocalStorage<string>();

export const isMultiTenant = process.env.MULTI_TENANT === 'true';

const DEFAULT_TENANT = process.env.LUCID_TENANT_ID || 'default';

/**
 * Get the current tenant ID.
 * - Multi-tenant: returns the per-request tenant from AsyncLocalStorage
 * - Self-hosted: returns the configured default (or 'default')
 */
export function getTenantId(): string {
  if (!isMultiTenant) return DEFAULT_TENANT;
  return tenantStore.getStore() ?? DEFAULT_TENANT;
}

/**
 * Run a function within a tenant context.
 * Used by gateway auth middleware to set the tenant for the request lifecycle.
 */
export function withTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStore.run(tenantId, fn);
}

/**
 * Set tenant context on a Postgres client connection.
 * Call this after acquiring a client from the pool.
 * RLS policies use: current_setting('app.current_tenant', true)
 */
export async function setTenantOnConnection(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }): Promise<void> {
  if (!isMultiTenant) return;
  const tenantId = getTenantId();
  await client.query(`SET app.current_tenant = $1`, [tenantId]);
}
