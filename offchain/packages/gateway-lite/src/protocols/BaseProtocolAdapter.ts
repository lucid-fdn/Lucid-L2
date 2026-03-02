/**
 * Protocol Integration SDK - Base Adapter
 * 
 * Abstract base class for all protocol adapters.
 * Extend this class to create new protocol integrations.
 */

import {
  ProtocolMetadata,
  OperationDefinition,
  CredentialSchema,
  ProtocolConfig,
  ExecutionContext,
  ExecutionResult,
  ValidationResult,
  NetworkConfig,
  HealthStatus
} from './types';

export abstract class BaseProtocolAdapter {
  protected config: ProtocolConfig = {};
  protected initialized = false;

  // =============================================================================
  // Abstract Methods - Must be implemented by adapters
  // =============================================================================

  /**
   * Get protocol metadata
   */
  abstract getMetadata(): ProtocolMetadata;

  /**
   * Get available operations
   */
  abstract getOperations(): OperationDefinition[];

  /**
   * Get credential schema
   */
  abstract getCredentialSchema(): CredentialSchema;

  /**
   * Execute an operation
   */
  abstract execute(
    operationId: string,
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutionResult>;

  // =============================================================================
  // Optional Methods - Can be overridden
  // =============================================================================

  /**
   * Get supported networks
   */
  getSupportedNetworks(): NetworkConfig[] {
    return [
      {
        id: 'mainnet',
        name: 'Mainnet',
        isTestnet: false
      }
    ];
  }

  /**
   * Validate protocol configuration
   */
  async validateConfig(config: ProtocolConfig): Promise<ValidationResult> {
    const errors: string[] = [];

    // Validate network if specified
    if (config.network) {
      const networks = this.getSupportedNetworks();
      const networkExists = networks.some(n => n.id === config.network);
      if (!networkExists) {
        errors.push(`Unsupported network: ${config.network}`);
      }
    }

    // Validate timeout
    if (config.timeout !== undefined && config.timeout < 0) {
      errors.push('Timeout must be positive');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Validate credentials
   */
  async validateCredentials(credentials: Record<string, unknown>): Promise<ValidationResult> {
    const schema = this.getCredentialSchema();
    const errors: string[] = [];

    // Check required fields
    for (const field of schema.fields) {
      if (field.required && !credentials[field.name]) {
        errors.push(`Missing required credential: ${field.name}`);
      }

      // Pattern validation
      if (field.pattern && credentials[field.name]) {
        const regex = new RegExp(field.pattern);
        if (!regex.test(String(credentials[field.name]))) {
          errors.push(`Invalid format for ${field.name}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Validate operation parameters
   */
  async validateParameters(
    operationId: string,
    parameters: Record<string, unknown>
  ): Promise<ValidationResult> {
    const operation = this.getOperations().find(op => op.id === operationId);
    
    if (!operation) {
      return {
        valid: false,
        errors: [`Unknown operation: ${operationId}`]
      };
    }

    const errors: string[] = [];

    // Check required parameters
    for (const param of operation.parameters) {
      if (param.required && parameters[param.name] === undefined) {
        errors.push(`Missing required parameter: ${param.name}`);
      }

      // Type validation
      if (parameters[param.name] !== undefined) {
        const value = parameters[param.name];
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        
        if (param.type === 'number' && actualType !== 'number') {
          errors.push(`Parameter ${param.name} must be a number`);
        }
        if (param.type === 'string' && actualType !== 'string') {
          errors.push(`Parameter ${param.name} must be a string`);
        }
        if (param.type === 'boolean' && actualType !== 'boolean') {
          errors.push(`Parameter ${param.name} must be a boolean`);
        }
        if (param.type === 'array' && !Array.isArray(value)) {
          errors.push(`Parameter ${param.name} must be an array`);
        }

        // Validation rules
        if (param.validation) {
          const val = param.validation;
          if (typeof value === 'number') {
            if (val.min !== undefined && value < val.min) {
              errors.push(`Parameter ${param.name} must be >= ${val.min}`);
            }
            if (val.max !== undefined && value > val.max) {
              errors.push(`Parameter ${param.name} must be <= ${val.max}`);
            }
          }
          if (val.enum && !val.enum.includes(value as string | number)) {
            errors.push(`Parameter ${param.name} must be one of: ${val.enum.join(', ')}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Check protocol health
   */
  async checkHealth(): Promise<HealthStatus> {
    return {
      status: 'healthy',
      lastCheck: Date.now(),
      message: 'Protocol adapter is operational'
    };
  }

  /**
   * Initialize the adapter with configuration
   */
  async initialize(config: ProtocolConfig): Promise<void> {
    // Validate config
    const validation = await this.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid config: ${validation.errors?.join(', ')}`);
    }

    this.config = config;
    this.initialized = true;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.initialized = false;
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  /**
   * Check if adapter is initialized
   */
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Protocol adapter not initialized. Call initialize() first.');
    }
  }

  /**
   * Get current network configuration
   */
  protected getCurrentNetwork(): NetworkConfig {
    const networks = this.getSupportedNetworks();
    const networkId = this.config.network || 'mainnet';
    const network = networks.find(n => n.id === networkId);
    
    if (!network) {
      throw new Error(`Network not found: ${networkId}`);
    }
    
    return network;
  }

  /**
   * Create a success result
   */
  protected success<T>(data: T, metadata?: Record<string, unknown>): ExecutionResult<T> {
    return {
      success: true,
      data,
      metadata: {
        timestamp: Date.now(),
        ...metadata
      }
    };
  }

  /**
   * Create an error result
   */
  protected error(
    message: string,
    code?: string,
    metadata?: Record<string, unknown>
  ): ExecutionResult {
    return {
      success: false,
      error: message,
      errorCode: code,
      metadata: {
        timestamp: Date.now(),
        ...metadata
      }
    };
  }

  /**
   * Measure execution time of an async operation
   */
  protected async measure<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    const result = await operation();
    const duration = Date.now() - start;
    return { result, duration };
  }

  /**
   * Safely extract credentials from context
   */
  protected getCredentials(context: ExecutionContext): Record<string, unknown> {
    if (!context.credentials) {
      throw new Error('No credentials provided in execution context');
    }
    return context.credentials;
  }

  /**
   * Get operation definition by ID
   */
  protected getOperation(operationId: string): OperationDefinition {
    const operation = this.getOperations().find(op => op.id === operationId);
    if (!operation) {
      throw new Error(`Unknown operation: ${operationId}`);
    }
    return operation;
  }
}
