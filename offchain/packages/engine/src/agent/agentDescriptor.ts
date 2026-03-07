/**
 * Universal Agent Descriptor (UAD)
 *
 * Runtime-agnostic definition for AI agents. Extends the Passport system
 * to enable one-click deployment to any supported runtime and target.
 */

// --- Stop Conditions ---

export type StopConditionType = 'max_steps' | 'max_cost_usd' | 'max_duration_ms' | 'goal_achieved' | 'human_stop';

export interface StopCondition {
  type: StopConditionType;
  value: number | string;
}

// --- Guardrails ---

export type GuardrailType = 'input_filter' | 'output_filter' | 'tool_approval' | 'budget_limit' | 'scope_restriction';

export interface Guardrail {
  type: GuardrailType;
  config: Record<string, unknown>;
}

// --- Multi-Agent ---

export interface HandoffRule {
  from_agent: string;
  to_agent: string;
  condition: string;
}

// --- Channels ---

export type ChannelType = 'telegram' | 'discord' | 'whatsapp' | 'slack' | 'web' | 'a2a' | 'webhook';

export interface ChannelConfig {
  type: ChannelType;
  config: Record<string, unknown>;
}

// --- Autonomy ---

export type AutonomyLevel = 'supervised' | 'semi_autonomous' | 'fully_autonomous';

// --- Memory ---

export type MemoryProvider = 'supabase' | 'lighthouse' | 'redis';

// --- Workflow ---

export type WorkflowType = 'single' | 'sequential' | 'parallel' | 'dag';

// --- Agent Config ---

export interface AgentConfig {
  // Core
  system_prompt: string;
  model_passport_id: string;
  fallback_model_ids?: string[];
  temperature?: number;
  max_tokens?: number;

  // Tools & Skills
  tool_passport_ids: string[];
  skill_slugs: string[];
  mcp_servers: string[];

  // Autonomy
  autonomy_level: AutonomyLevel;
  stop_conditions: StopCondition[];
  guardrails: Guardrail[];

  // Memory
  memory_enabled: boolean;
  memory_provider: MemoryProvider;
  memory_window_size: number;

  // Multi-agent
  workflow_type: WorkflowType;
  sub_agents?: string[];
  handoff_rules?: HandoffRule[];

  // Communication
  channels: ChannelConfig[];
  a2a_enabled: boolean;
  a2a_capabilities?: string[];
}

// --- Wallet ---

export type WalletProvider = 'crossmint' | 'erc6551' | 'squads' | 'custom';

export interface SpendingLimits {
  per_tx_usd: number;
  daily_usd: number;
}

export interface WalletConfig {
  enabled: boolean;
  provider?: WalletProvider;
  chains: string[];
  spending_limits?: SpendingLimits;
  auto_fund?: boolean;
}

// --- Deployment ---

export type DeploymentTargetType = 'railway' | 'akash' | 'phala' | 'ionet' | 'nosana' | 'vercel_edge' | 'docker' | 'aws_bedrock' | 'self_hosted';

export interface DeploymentTarget {
  type: DeploymentTargetType;
  [key: string]: unknown;
}

export type RestartPolicy = 'always' | 'on_failure' | 'never';

export interface DeploymentConfig {
  target: DeploymentTarget;
  replicas?: number;
  auto_scale?: boolean;
  health_check_interval_ms?: number;
  restart_policy: RestartPolicy;
  env_vars?: Record<string, string>;
  secrets?: string[];
}

// --- Monetization ---

export type PricingModel = 'free' | 'per_call' | 'subscription' | 'token_gated';

export interface RevenueSplit {
  creator: number;
  compute: number;
  protocol: number;
}

export interface ShareTokenConfig {
  symbol: string;
  total_supply: number;
  auto_launch: boolean;
}

export interface MonetizationConfig {
  enabled: boolean;
  pricing_model: PricingModel;
  price_per_call_usd?: number;
  share_token_mint?: string;
  revenue_split?: RevenueSplit;
  share_token?: ShareTokenConfig;
}

// --- Compliance ---

export type EUAIActCategory = 'minimal' | 'limited' | 'high' | 'unacceptable';

export interface ComplianceConfig {
  audit_all_actions: boolean;
  require_human_approval: string[];
  data_retention_days: number;
  eu_ai_act_category?: EUAIActCategory;
}

// --- Universal Agent Descriptor ---

export interface AgentDescriptor {
  agent_config: AgentConfig;
  wallet_config?: WalletConfig;
  deployment_config: DeploymentConfig;
  monetization?: MonetizationConfig;
  compliance?: ComplianceConfig;
}

// --- Deployment State ---

export type DeploymentStatus = 'deploying' | 'running' | 'stopped' | 'failed' | 'terminated';
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface AgentDeployment {
  id: string;
  agent_passport_id: string;
  tenant_id: string;
  deployment_target: string;
  deployment_id?: string;
  status: DeploymentStatus;
  runtime_adapter: string;
  wallet_address?: string;
  a2a_endpoint?: string;
  health_status: HealthStatus;
  last_health_check?: number;
  config: AgentDescriptor;
  created_at: number;
  updated_at: number;
}

// --- Runtime Artifact ---

export interface RuntimeArtifact {
  adapter: string;
  files: Map<string, string>;
  entrypoint: string;
  dependencies: Record<string, string>;
  env_vars: Record<string, string>;
  dockerfile?: string;
}

// --- Deployment Result ---

export interface DeploymentResult {
  success: boolean;
  deployment_id: string;
  agent_passport_id: string;
  target: string;
  url?: string;
  a2a_endpoint?: string;
  wallet_address?: string;
  error?: string;
}

// --- Agent Wallet ---

export interface AgentWallet {
  address: string;
  chain: string;
  provider: string;
  agent_passport_id: string;
  created_at: number;
}

export interface WalletBalance {
  address: string;
  balances: Array<{
    token: string;
    amount: string;
    decimals: number;
    usd_value?: number;
  }>;
}

export interface TransactionRequest {
  to: string;
  value?: string;
  data?: string;
  token_mint?: string;
  amount?: string;
}

export interface TransactionResult {
  success: boolean;
  tx_signature: string;
  chain: string;
  error?: string;
}

// --- Default values ---

export const DEFAULT_AGENT_CONFIG: Partial<AgentConfig> = {
  temperature: 0.7,
  tool_passport_ids: [],
  skill_slugs: [],
  mcp_servers: [],
  autonomy_level: 'supervised',
  stop_conditions: [{ type: 'max_steps', value: 50 }],
  guardrails: [],
  memory_enabled: true,
  memory_provider: 'supabase',
  memory_window_size: 20,
  workflow_type: 'single',
  channels: [],
  a2a_enabled: false,
};

export const DEFAULT_DEPLOYMENT_CONFIG: Partial<DeploymentConfig> = {
  replicas: 1,
  auto_scale: false,
  health_check_interval_ms: 30000,
  restart_policy: 'on_failure',
};

export const DEFAULT_COMPLIANCE: ComplianceConfig = {
  audit_all_actions: true,
  require_human_approval: [],
  data_retention_days: 90,
};
