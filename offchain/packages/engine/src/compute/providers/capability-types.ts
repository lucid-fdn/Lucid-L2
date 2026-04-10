/**
 * Provider Capability Types
 *
 * Shared types for extended deployer capabilities (metrics, redeploy, env, domains, etc.).
 * All types are provider-agnostic — providers map their native data to these.
 */

// ─── Metrics ───

export interface MetricsDatapoint {
  timestamp: number
  value: number
}

export interface MetricSeries {
  current?: number
  series?: MetricsDatapoint[]
  unit?: 'percent' | 'bytes' | 'count' | 'ms'
}

export interface DeploymentMetrics {
  cpu?: MetricSeries
  memory?: MetricSeries
  disk?: MetricSeries
  network?: {
    rxBytes?: MetricSeries
    txBytes?: MetricSeries
  }
  collectedAt: number // epoch ms
}

export interface MetricsOptions {
  range?: number // seconds of history
  granularity?: 'minute' | 'hour' | 'day'
}

// ─── Redeploy ───

export interface RedeployResult {
  success: boolean
  deployment_id: string
  status: 'queued' | 'deploying' | 'running' | 'failed'
  url?: string
  operation_id?: string // for async tracking
}

// ─── Env Vars ───

/** string = set/update, null = delete, absent key = unchanged */
export type EnvVarPatch = Record<string, string | null>

// ─── Domains ───

export interface DomainInfo {
  domain: string
  isDefault: boolean
  ssl: boolean
}

export interface DomainResult {
  domain: string
  status: 'active' | 'pending' | 'failed'
}

// ─── Healthcheck ───

export interface HealthcheckConfig {
  path: string
  intervalSeconds: number
  timeoutSeconds: number
}

// ─── Restart Policy ───

export type RestartPolicy = 'always' | 'on_failure' | 'never'

// ─── Volumes ───

export interface VolumeConfig {
  mountPath: string
  sizeGb: number
}

export interface VolumeInfo {
  id: string
  mountPath: string
  sizeGb: number
  usedGb?: number
}

// ─── Regions ───

export interface RegionInfo {
  id: string
  name: string
  available: boolean
}
