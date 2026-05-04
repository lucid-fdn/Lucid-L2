import type { DeploymentTargetType } from '../agent/agentDescriptor';
import type { PassportClaimStatus, PassportOwnershipMode } from './ownership';

export interface LaunchImageInput {
  image: string;
  target: DeploymentTargetType;
  owner?: string;
  owner_mode?: PassportOwnershipMode;
  name: string;
  passport_id?: string;
  port?: number;
  env_vars?: Record<string, string>;
  verification?: 'full' | 'minimal';
  registry_auth?: { username: string; password: string };
}

export interface LaunchBaseRuntimeInput {
  model: string;
  prompt: string;
  target: DeploymentTargetType;
  owner?: string;
  owner_mode?: PassportOwnershipMode;
  name: string;
  tools?: string[];
  runtime_version?: string;
}

export interface LaunchResult {
  success: boolean;
  passport_id?: string;
  deployment_id?: string;
  deployment_url?: string;
  wallet_address?: string;
  passport_owner?: string;
  owner_mode?: PassportOwnershipMode;
  claim_status?: PassportClaimStatus;
  wallet_required_features?: string[];
  verification_mode?: 'full' | 'minimal';
  config_hash?: string;
  reputation_eligible: boolean;
  error?: string;
}

export interface VerificationCapabilities {
  receipts: boolean;
  memory: boolean;
  payment: boolean;
  tool_gateway: boolean;
}

export const BASE_RUNTIME_IMAGE = 'ghcr.io/lucid-fdn/agent-runtime';
export const DEFAULT_RUNTIME_VERSION = 'v1.0.0';
export const DEFAULT_PORT = 3100;
