/**
 * ERC-8004 Registry Types
 *
 * TypeScript types matching the ERC-8004 standard interfaces.
 */

/** Agent metadata as stored in tokenURI JSON */
export interface ERC8004AgentMetadata {
  name: string;
  description: string;
  endpoints?: string[];
  capabilities?: string[];
  wallets?: Record<string, string>;
  trust_models?: string[];
  image?: string;
}

/** Validation record returned from the Validation Registry */
export interface ValidationRecord {
  validationId: bigint;
  agentTokenId: bigint;
  validator: string;
  receiptHash: string;
  valid: boolean;
  timestamp: bigint;
  metadata?: string;
}

/** Reputation feedback record */
export interface ReputationRecord {
  feedbackId: bigint;
  agentTokenId: bigint;
  from: string;
  score: number;
  category: string;
  timestamp: bigint;
}

/** Average reputation score */
export interface ReputationSummary {
  agentTokenId: string;
  averageScore: number;
  totalFeedback: number;
  chainId: string;
}
