// offchain/packages/engine/src/deploy/IDeployer.ts
// Deployer interface — handles deployment of generated agent artifacts to infrastructure targets.
// Each deployer targets one platform (Railway, Docker, Akash, Phala, io.net, etc.).

import type { ImageDeployInput } from './types';
import type {
  DeploymentMetrics,
  MetricsOptions,
  RedeployResult,
  EnvVarPatch,
  DomainInfo,
  DomainResult,
  HealthcheckConfig,
  RestartPolicy,
  VolumeConfig,
  VolumeInfo,
  RegionInfo,
} from './capability-types';

export type {
  DeploymentMetrics,
  MetricsOptions,
  RedeployResult,
  EnvVarPatch,
  DomainInfo,
  DomainResult,
  HealthcheckConfig,
  RestartPolicy as RestartPolicyType,
  VolumeConfig,
  VolumeInfo,
  RegionInfo,
} from './capability-types';

/**
 * Deployment lifecycle status
 */
export type DeploymentStatusType = 'deploying' | 'running' | 'stopped' | 'failed' | 'terminated' | 'unknown';

/**
 * Result of a deploy operation
 */
export interface DeploymentResult {
  /** Whether deployment succeeded */
  success: boolean;
  /** Unique deployment identifier */
  deployment_id: string;
  /** Target platform name */
  target: string;
  /** Public URL of the deployed agent (if available) */
  url?: string;
  /** Error message (if failed) */
  error?: string;
  /** Platform-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Current status of a deployment
 */
export interface DeploymentStatus {
  /** Unique deployment identifier */
  deployment_id: string;
  /** Current lifecycle status */
  status: DeploymentStatusType;
  /** Public URL (if available) */
  url?: string;
  /** Health state of the running deployment */
  health?: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  /** Uptime in milliseconds since deployment start */
  uptime_ms?: number;
  /** Timestamp of last health check */
  last_check?: number;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Options for fetching deployment logs
 */
export interface LogOptions {
  /** Unix timestamp — only return logs after this time */
  since?: number;
  /** Number of most recent log lines to return */
  tail?: number;
  /** Stream logs continuously (not all deployers support this) */
  follow?: boolean;
}

/**
 * Agent runtime artifact — the output of code generation, input to deployment
 */
export interface RuntimeArtifact {
  /** Adapter name that generated this artifact (e.g., 'mcp', 'openai-assistant') */
  adapter: string;
  /** Map of filename → file content */
  files: Map<string, string>;
  /** Entry point file path within the artifact */
  entrypoint: string;
  /** NPM dependencies (name → version) */
  dependencies: Record<string, string>;
  /** Environment variables required at runtime */
  env_vars: Record<string, string>;
  /** Optional Dockerfile content (if pre-generated) */
  dockerfile?: string;
}

/**
 * Configuration for a deployment
 */
export interface DeploymentConfig {
  /** Target platform config — type field identifies the deployer */
  target: { type: string; [key: string]: unknown };
  /** Number of replicas (default: 1) */
  replicas?: number;
  /** Enable auto-scaling (if supported by target) */
  auto_scale?: boolean;
  /** Health check interval in milliseconds */
  health_check_interval_ms?: number;
  /** Container restart policy */
  restart_policy?: 'always' | 'on_failure' | 'never';
  /** Additional environment variables (merged with artifact env_vars) */
  env_vars?: Record<string, string>;
  /** Secret names to inject (platform-specific resolution) */
  secrets?: string[];
}

/**
 * Deployer interface — all deployment providers implement this.
 * Swappable at runtime via factory + env var.
 */
export interface IDeployer {
  /** Target platform name (e.g., 'docker', 'railway', 'akash') */
  readonly target: string;
  /** Human-readable description */
  readonly description: string;

  /** Deploy an agent artifact or pre-built image to this target */
  deploy(input: RuntimeArtifact | ImageDeployInput, config: DeploymentConfig, passportId: string): Promise<DeploymentResult>;

  /** Get deployment status */
  status(deploymentId: string): Promise<DeploymentStatus>;

  /** Get deployment logs */
  logs(deploymentId: string, options?: LogOptions): Promise<string>;

  /** Terminate a deployment */
  terminate(deploymentId: string): Promise<void>;

  /** Scale replicas (if supported) */
  scale(deploymentId: string, replicas: number): Promise<void>;

  /** Health check for the deployer itself */
  isHealthy(): Promise<boolean>;

  // ─── Extended Capabilities (all optional) ───

  /** Tier 1: Get deployment metrics (CPU, memory, disk, network) */
  metrics?(deploymentId: string, options?: MetricsOptions): Promise<DeploymentMetrics>

  /** Tier 1: Redeploy (rebuild + restart) */
  redeploy?(deploymentId: string): Promise<RedeployResult>

  /** Tier 2: Update environment variables (string = set, null = delete) */
  updateEnvVars?(deploymentId: string, vars: EnvVarPatch): Promise<void>

  /** Tier 3: Add a custom domain */
  addDomain?(deploymentId: string, domain: string): Promise<DomainResult>

  /** Tier 3: Remove a custom domain */
  removeDomain?(deploymentId: string, domain: string): Promise<void>

  /** Tier 3: List domains */
  listDomains?(deploymentId: string): Promise<DomainInfo[]>

  /** Tier 3: Set healthcheck configuration */
  setHealthcheck?(deploymentId: string, config: HealthcheckConfig): Promise<void>

  /** Tier 3: Set restart policy */
  setRestartPolicy?(deploymentId: string, policy: RestartPolicy): Promise<void>

  /** Tier 4: Add a volume (deferred) */
  addVolume?(deploymentId: string, config: VolumeConfig): Promise<VolumeInfo>

  /** Tier 4: List volumes (deferred) */
  listVolumes?(deploymentId: string): Promise<VolumeInfo[]>

  /** Tier 4: List available regions (deferred) */
  listRegions?(): Promise<RegionInfo[]>

  /** Tier 4: Set deployment region (deferred) */
  setRegion?(deploymentId: string, region: string): Promise<void>
}
