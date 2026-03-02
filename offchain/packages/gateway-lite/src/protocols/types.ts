/**
 * Protocol Integration SDK - Core Types
 * 
 * Defines the standard interfaces for building protocol adapters.
 * These types enable a modular, community-driven ecosystem of protocol integrations.
 */

// =============================================================================
// Protocol Metadata
// =============================================================================

export type ProtocolCategory = 
  | 'dex'           // Decentralized exchanges (Hyperliquid, Jupiter, Uniswap)
  | 'defi'          // DeFi protocols (Aave, Compound)
  | 'bridge'        // Cross-chain bridges (Wormhole, Stargate)
  | 'social'        // Social protocols (X402, Farcaster)
  | 'oracle'        // Price oracles (Chainlink, Pyth)
  | 'prediction'    // Prediction markets (Polymarket)
  | 'nft'           // NFT marketplaces
  | 'gaming'        // Gaming protocols
  | 'identity'      // Identity protocols
  | 'other';        // Other protocols

export interface ProtocolMetadata {
  /** Unique protocol identifier (lowercase, no spaces) */
  id: string;
  
  /** Display name for UI */
  name: string;
  
  /** Protocol category */
  category: ProtocolCategory;
  
  /** Semantic version */
  version: string;
  
  /** Short description */
  description: string;
  
  /** Icon URL or path */
  icon?: string;
  
  /** Documentation URL */
  docsUrl?: string;
  
  /** Supported networks/chains */
  networks?: string[];
  
  /** Tags for discovery */
  tags?: string[];
  
  /** Author/maintainer */
  author?: string;
  
  /** Repository URL */
  repository?: string;
}

// =============================================================================
// Operation Definitions
// =============================================================================

export type ParameterType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'array' 
  | 'object'
  | 'address'  // Blockchain address
  | 'bigint'   // Large numbers
  | 'select';  // Dropdown options

export interface ParameterDefinition {
  /** Parameter name */
  name: string;
  
  /** Display name for UI */
  displayName?: string;
  
  /** Parameter type */
  type: ParameterType;
  
  /** Whether parameter is required */
  required?: boolean;
  
  /** Default value */
  default?: unknown;
  
  /** Description/help text */
  description?: string;
  
  /** Placeholder for input fields */
  placeholder?: string;
  
  /** Options for select type */
  options?: Array<{ label: string; value: string | number }>;
  
  /** Validation rules */
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: (string | number)[];
  };
  
  /** Pattern for validation (regex string) - can be at root level for convenience */
  pattern?: string;
}

export interface OperationDefinition {
  /** Unique operation ID within this protocol */
  id: string;
  
  /** Display name */
  name: string;
  
  /** Operation description */
  description: string;
  
  /** Input parameters */
  parameters: ParameterDefinition[];
  
  /** Whether this operation requires credentials */
  requiresAuth?: boolean;
  
  /** Whether this operation modifies state (write operation) */
  isWrite?: boolean;
  
  /** Expected return type description */
  returns?: string;
  
  /** Example usage */
  example?: string;
  
  /** Tags for categorization */
  tags?: string[];
}

// =============================================================================
// Credential Management
// =============================================================================

export type CredentialType = 
  | 'privateKey'    // Wallet private key
  | 'mnemonic'      // Seed phrase
  | 'apiKey'        // API key
  | 'oauth'         // OAuth token
  | 'address';      // Public address only (read-only)

export interface CredentialField {
  /** Field name */
  name: string;
  
  /** Display label */
  label: string;
  
  /** Field type */
  type: CredentialType;
  
  /** Whether field is required */
  required: boolean;
  
  /** Help text */
  description?: string;
  
  /** Should be encrypted in storage */
  encrypted?: boolean;
  
  /** Validation pattern */
  pattern?: string;
}

export interface CredentialSchema {
  /** Credential fields */
  fields: CredentialField[];
  
  /** Instructions for users */
  instructions?: string;
  
  /** Link to credential setup guide */
  setupUrl?: string;
}

// =============================================================================
// Protocol Configuration
// =============================================================================

export interface NetworkConfig {
  /** Network identifier */
  id: string;
  
  /** Network name */
  name: string;
  
  /** Whether this is a testnet */
  isTestnet: boolean;
  
  /** RPC endpoint(s) */
  rpcUrl?: string | string[];
  
  /** Chain ID */
  chainId?: number | string;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface ProtocolConfig {
  /** Network to use */
  network?: string;
  
  /** Timeout for operations (ms) */
  timeout?: number;
  
  /** Rate limiting */
  rateLimit?: {
    requestsPerSecond?: number;
    requestsPerMinute?: number;
  };
  
  /** Custom RPC endpoints */
  rpcEndpoints?: string[];
  
  /** Additional protocol-specific config */
  custom?: Record<string, unknown>;
}

// =============================================================================
// Operation Execution
// =============================================================================

export interface ExecutionContext {
  /** User making the request */
  userId: string;
  
  /** Workflow/execution ID for tracking */
  executionId?: string;
  
  /** User's credentials for this protocol */
  credentials?: Record<string, unknown>;
  
  /** Additional context */
  metadata?: Record<string, unknown>;
}

export interface ExecutionResult<T = unknown> {
  /** Whether execution was successful */
  success: boolean;
  
  /** Result data */
  data?: T;
  
  /** Error message if failed */
  error?: string;
  
  /** Error code for programmatic handling */
  errorCode?: string;
  
  /** Execution metadata */
  metadata?: {
    duration?: number;
    timestamp?: number;
    transactionHash?: string;
    gasUsed?: string;
    [key: string]: unknown;
  };
}

// =============================================================================
// Validation
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

// =============================================================================
// Protocol Health & Status
// =============================================================================

export interface HealthStatus {
  /** Overall health status */
  status: 'healthy' | 'degraded' | 'down';
  
  /** Status message */
  message?: string;
  
  /** Last check timestamp */
  lastCheck: number;
  
  /** Network-specific status */
  networks?: Record<string, {
    status: 'healthy' | 'degraded' | 'down';
    latency?: number;
    blockHeight?: number;
  }>;
  
  /** Additional details */
  details?: Record<string, unknown>;
}
