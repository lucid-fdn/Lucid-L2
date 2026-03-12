/**
 * Protocol Manager Service
 * 
 * Orchestrates protocol adapters, handles execution routing,
 * and manages credential resolution for protocol operations.
 */

import { BaseProtocolAdapter } from './BaseProtocolAdapter';
import { protocolRegistry } from './ProtocolRegistry';
import {
  ProtocolConfig,
  ExecutionContext,
  ExecutionResult,
  ProtocolMetadata,
  OperationDefinition
} from './types';
import { logger } from '../../../engine/src/lib/logger';

export interface ProtocolExecutionRequest {
  protocolId: string;
  operationId: string;
  parameters: Record<string, unknown>;
  userId: string;
  credentialId?: string;
  executionId?: string;
  config?: ProtocolConfig;
}

export class ProtocolManager {
  private static instance: ProtocolManager;
  private credentialService?: any; // Will be injected

  private constructor() {}

  static getInstance(): ProtocolManager {
    if (!ProtocolManager.instance) {
      ProtocolManager.instance = new ProtocolManager();
    }
    return ProtocolManager.instance;
  }

  /**
   * Inject credential service for resolving user credentials
   */
  setCredentialService(service: any): void {
    this.credentialService = service;
  }

  /**
   * Execute a protocol operation
   */
  async execute(request: ProtocolExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // 1. Validate protocol exists
      if (!protocolRegistry.has(request.protocolId)) {
        return {
          success: false,
          error: `Protocol not found: ${request.protocolId}`,
          errorCode: 'PROTOCOL_NOT_FOUND',
          metadata: { duration: Date.now() - startTime }
        };
      }

      // 2. Get protocol adapter
      const adapter = await protocolRegistry.getAdapter(
        request.protocolId,
        request.config,
        `${request.userId}-${request.protocolId}` // Instance per user-protocol
      );

      // 3. Validate parameters
      const paramValidation = await adapter.validateParameters(
        request.operationId,
        request.parameters
      );

      if (!paramValidation.valid) {
        return {
          success: false,
          error: `Invalid parameters: ${paramValidation.errors?.join(', ')}`,
          errorCode: 'INVALID_PARAMETERS',
          metadata: { duration: Date.now() - startTime }
        };
      }

      // 4. Resolve credentials
      let credentials: Record<string, unknown> | undefined;
      
      if (request.credentialId && this.credentialService) {
        try {
          credentials = await this.credentialService.getCredential(
            request.userId,
            request.credentialId
          );
        } catch (error) {
          return {
            success: false,
            error: 'Failed to resolve credentials',
            errorCode: 'CREDENTIAL_ERROR',
            metadata: { duration: Date.now() - startTime }
          };
        }
      }

      // 5. Build execution context
      const context: ExecutionContext = {
        userId: request.userId,
        executionId: request.executionId,
        credentials,
        metadata: {
          protocolId: request.protocolId,
          operationId: request.operationId
        }
      };

      // 6. Execute operation
      const result = await adapter.execute(
        request.operationId,
        request.parameters,
        context
      );

      // 7. Add execution metadata
      result.metadata = {
        ...result.metadata,
        duration: Date.now() - startTime,
        protocolId: request.protocolId,
        operationId: request.operationId
      };

      // 8. Log credential usage if applicable
      if (request.credentialId && this.credentialService) {
        await this.logCredentialUsage(
          request.credentialId,
          request.executionId,
          result.success
        ).catch(err => {
          logger.error('Failed to log credential usage:', err);
        });
      }

      return result;

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'EXECUTION_ERROR',
        metadata: {
          duration: Date.now() - startTime,
          protocolId: request.protocolId,
          operationId: request.operationId
        }
      };
    }
  }

  /**
   * Get all available protocols
   */
  listProtocols(): ProtocolMetadata[] {
    return protocolRegistry.listProtocols();
  }

  /**
   * Get protocols by category
   */
  getProtocolsByCategory(category: string): ProtocolMetadata[] {
    return protocolRegistry.findByCategory(category);
  }

  /**
   * Get protocol metadata
   */
  getProtocolMetadata(protocolId: string): ProtocolMetadata {
    return protocolRegistry.getMetadata(protocolId);
  }

  /**
   * Get operations for a protocol
   */
  async getProtocolOperations(
    protocolId: string,
    config?: ProtocolConfig
  ): Promise<OperationDefinition[]> {
    const adapter = await protocolRegistry.getAdapter(protocolId, config);
    return adapter.getOperations();
  }

  /**
   * Get credential schema for a protocol
   */
  async getCredentialSchema(protocolId: string) {
    const adapter = await protocolRegistry.getAdapter(protocolId);
    return adapter.getCredentialSchema();
  }

  /**
   * Check health of all protocols
   */
  async checkHealth(): Promise<Record<string, any>> {
    return protocolRegistry.checkAllHealth();
  }

  /**
   * Get protocol statistics
   */
  getStats() {
    return protocolRegistry.getStats();
  }

  /**
   * Validate a protocol configuration
   */
  async validateProtocolConfig(
    protocolId: string,
    config: ProtocolConfig
  ): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const adapter = await protocolRegistry.getAdapter(protocolId);
      return await adapter.validateConfig(config);
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Validate protocol credentials
   */
  async validateCredentials(
    protocolId: string,
    credentials: Record<string, unknown>
  ): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const adapter = await protocolRegistry.getAdapter(protocolId);
      return await adapter.validateCredentials(credentials);
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Log credential usage (integrate with existing credential tracking)
   */
  private async logCredentialUsage(
    credentialId: string,
    executionId: string | undefined,
    success: boolean
  ): Promise<void> {
    if (!this.credentialService?.logUsage) {
      return;
    }

    await this.credentialService.logUsage({
      credentialId,
      executionId,
      success,
      timestamp: Date.now()
    });
  }

  /**
   * Search protocols by tags or keywords
   */
  searchProtocols(query: string): ProtocolMetadata[] {
    const lowerQuery = query.toLowerCase();
    return this.listProtocols().filter(protocol => 
      protocol.name.toLowerCase().includes(lowerQuery) ||
      protocol.description.toLowerCase().includes(lowerQuery) ||
      protocol.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get supported networks for a protocol
   */
  async getSupportedNetworks(protocolId: string) {
    const adapter = await protocolRegistry.getAdapter(protocolId);
    return adapter.getSupportedNetworks();
  }

  /**
   * Cleanup all protocol instances
   */
  async cleanup(): Promise<void> {
    await protocolRegistry.cleanup();
  }
}

/**
 * Global protocol manager instance
 */
export const protocolManager = ProtocolManager.getInstance();
