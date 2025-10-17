/**
 * FlowSpec DSL - Type Definitions
 * 
 * A domain-specific language for defining n8n workflows programmatically.
 * Allows AI agents to generate and execute workflows dynamically.
 */

export type FlowNodeType = 
  | 'llm.chat'          // LLM inference
  | 'embed'             // Text embedding
  | 'search'            // Vector/semantic search
  | 'tool.http'         // HTTP API calls
  | 'tool.mcp'          // MCP tool execution
  | 'solana.write'      // Solana transaction
  | 'solana.read'       // Solana data query
  | 'ipfs.pin'          // IPFS pinning
  | 'branch'            // Conditional branching
  | 'transform'         // Data transformation
  | 'webhook'           // Webhook trigger
  | 'schedule';         // Scheduled execution

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  input?: Record<string, unknown>;
  config?: Record<string, unknown>;
  position?: { x: number; y: number }; // UI positioning
}

export interface FlowEdge {
  from: string;
  to: string;
  when?: string; // Conditional logic expression
  label?: string;
}

export interface FlowSpec {
  name: string;
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  credentials?: Record<string, string>; // Named credential references
  metadata?: Record<string, unknown>;
  version?: string;
}

export interface FlowExecutionContext {
  tenantId: string;
  userId?: string;
  variables?: Record<string, unknown>;
  timeout?: number; // milliseconds
}

export interface FlowExecutionResult {
  success: boolean;
  executionId: string;
  outputs: Record<string, unknown>;
  errors?: string[];
  duration?: number;
}

// Predefined node configurations
export interface LLMChatConfig {
  provider: 'openai' | 'anthropic' | 'cohere' | 'local';
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface SolanaWriteConfig {
  network: 'mainnet-beta' | 'devnet' | 'testnet';
  instruction: 'transfer' | 'createAccount' | 'custom';
  programId?: string;
}

export interface SearchConfig {
  index: string;
  topK?: number;
  minScore?: number;
  filters?: Record<string, unknown>;
}

// Helper type for node creation
export type NodeConfigs = {
  'llm.chat': LLMChatConfig;
  'solana.write': SolanaWriteConfig;
  'search': SearchConfig;
};
