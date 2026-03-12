/**
 * Protocol Integration SDK - Protocol Registry
 * 
 * Manages registration, discovery, and lifecycle of protocol adapters.
 * Provides a central registry for all available protocols.
 */

import { BaseProtocolAdapter } from './BaseProtocolAdapter';
import { ProtocolMetadata, ProtocolConfig, HealthStatus } from './types';
import { logger } from '../../../engine/src/lib/logger';

interface RegisteredProtocol {
  adapter: BaseProtocolAdapter;
  metadata: ProtocolMetadata;
  instances: Map<string, BaseProtocolAdapter>; // instanceId -> adapter instance
  lastHealthCheck?: HealthStatus;
}

export class ProtocolRegistry {
  private protocols: Map<string, RegisteredProtocol> = new Map();
  private static instance: ProtocolRegistry;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): ProtocolRegistry {
    if (!ProtocolRegistry.instance) {
      ProtocolRegistry.instance = new ProtocolRegistry();
    }
    return ProtocolRegistry.instance;
  }

  /**
   * Register a protocol adapter
   */
  register(adapter: BaseProtocolAdapter): void {
    const metadata = adapter.getMetadata();
    
    if (this.protocols.has(metadata.id)) {
      logger.warn(`Protocol ${metadata.id} is already registered. Replacing...`);
    }

    this.protocols.set(metadata.id, {
      adapter,
      metadata,
      instances: new Map()
    });

    logger.info(`✅ Registered protocol: ${metadata.name} v${metadata.version}`);
  }

  /**
   * Unregister a protocol
   */
  unregister(protocolId: string): void {
    const protocol = this.protocols.get(protocolId);
    if (!protocol) {
      throw new Error(`Protocol not found: ${protocolId}`);
    }

    // Cleanup all instances
    for (const instance of protocol.instances.values()) {
      instance.cleanup().catch(err => {
        logger.error(`Error cleaning up instance: ${err.message}`);
      });
    }

    this.protocols.delete(protocolId);
    logger.info(`❌ Unregistered protocol: ${protocolId}`);
  }

  /**
   * Get a protocol adapter (creates new instance)
   */
  async getAdapter(
    protocolId: string,
    config?: ProtocolConfig,
    instanceId?: string
  ): Promise<BaseProtocolAdapter> {
    const protocol = this.protocols.get(protocolId);
    if (!protocol) {
      throw new Error(`Protocol not found: ${protocolId}`);
    }

    // If instanceId provided and exists, return that instance
    if (instanceId && protocol.instances.has(instanceId)) {
      return protocol.instances.get(instanceId)!;
    }

    // Create new instance
    const AdapterClass = protocol.adapter.constructor as new () => BaseProtocolAdapter;
    const instance = new AdapterClass();

    // Initialize if config provided
    if (config) {
      await instance.initialize(config);
    }

    // Store instance if instanceId provided
    if (instanceId) {
      protocol.instances.set(instanceId, instance);
    }

    return instance;
  }

  /**
   * Get protocol metadata
   */
  getMetadata(protocolId: string): ProtocolMetadata {
    const protocol = this.protocols.get(protocolId);
    if (!protocol) {
      throw new Error(`Protocol not found: ${protocolId}`);
    }
    return protocol.metadata;
  }

  /**
   * List all registered protocols
   */
  listProtocols(): ProtocolMetadata[] {
    return Array.from(this.protocols.values()).map(p => p.metadata);
  }

  /**
   * Search protocols by category
   */
  findByCategory(category: string): ProtocolMetadata[] {
    return this.listProtocols().filter(p => p.category === category);
  }

  /**
   * Search protocols by tag
   */
  findByTag(tag: string): ProtocolMetadata[] {
    return this.listProtocols().filter(p => 
      p.tags?.some(t => t.toLowerCase().includes(tag.toLowerCase()))
    );
  }

  /**
   * Get registered protocol adapter (synchronous)
   */
  get(protocolId: string): BaseProtocolAdapter | undefined {
    const protocol = this.protocols.get(protocolId);
    return protocol?.adapter;
  }

  /**
   * Check if protocol is registered
   */
  has(protocolId: string): boolean {
    return this.protocols.has(protocolId);
  }

  /**
   * Get count of registered protocols
   */
  count(): number {
    return this.protocols.size;
  }

  /**
   * Check health of all protocols
   */
  async checkAllHealth(): Promise<Record<string, HealthStatus>> {
    const results: Record<string, HealthStatus> = {};

    for (const [id, protocol] of this.protocols) {
      try {
        const health = await protocol.adapter.checkHealth();
        protocol.lastHealthCheck = health;
        results[id] = health;
      } catch (error) {
        const errorHealth: HealthStatus = {
          status: 'down',
          message: error instanceof Error ? error.message : 'Unknown error',
          lastCheck: Date.now()
        };
        protocol.lastHealthCheck = errorHealth;
        results[id] = errorHealth;
      }
    }

    return results;
  }

  /**
   * Get last health check results
   */
  getHealthStatus(): Record<string, HealthStatus | undefined> {
    const results: Record<string, HealthStatus | undefined> = {};
    
    for (const [id, protocol] of this.protocols) {
      results[id] = protocol.lastHealthCheck;
    }
    
    return results;
  }

  /**
   * Cleanup all protocol instances
   */
  async cleanup(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];

    for (const protocol of this.protocols.values()) {
      for (const instance of protocol.instances.values()) {
        cleanupPromises.push(
          instance.cleanup().catch(err => {
            logger.error(`Error cleaning up instance: ${err.message}`);
          })
        );
      }
      protocol.instances.clear();
    }

    await Promise.all(cleanupPromises);
  }

  /**
   * Get statistics about registered protocols
   */
  getStats() {
    const categories: Record<string, number> = {};
    let totalInstances = 0;

    for (const protocol of this.protocols.values()) {
      // Count by category
      categories[protocol.metadata.category] = 
        (categories[protocol.metadata.category] || 0) + 1;
      
      // Count instances
      totalInstances += protocol.instances.size;
    }

    return {
      totalProtocols: this.protocols.size,
      totalInstances,
      byCategory: categories,
      protocols: Array.from(this.protocols.entries()).map(([id, p]) => ({
        id,
        name: p.metadata.name,
        version: p.metadata.version,
        instances: p.instances.size,
        lastHealth: p.lastHealthCheck?.status
      }))
    };
  }

  /**
   * Validate protocol compatibility
   */
  async validateProtocol(protocolId: string): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const protocol = this.protocols.get(protocolId);
    if (!protocol) {
      return {
        valid: false,
        issues: ['Protocol not found']
      };
    }

    const issues: string[] = [];

    try {
      // Check required methods
      const adapter = protocol.adapter;
      const operations = adapter.getOperations();
      const credentialSchema = adapter.getCredentialSchema();
      const networks = adapter.getSupportedNetworks();

      if (!operations || operations.length === 0) {
        issues.push('No operations defined');
      }

      if (!credentialSchema) {
        issues.push('No credential schema defined');
      }

      if (!networks || networks.length === 0) {
        issues.push('No networks defined');
      }

      // Validate metadata
      const metadata = protocol.metadata;
      if (!metadata.id || !metadata.name || !metadata.version) {
        issues.push('Incomplete metadata');
      }

    } catch (error) {
      issues.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

/**
 * Global registry instance
 */
export const protocolRegistry = ProtocolRegistry.getInstance();

/**
 * Decorator for auto-registering protocol adapters
 */
export function RegisterProtocol() {
  return function<T extends { new (): BaseProtocolAdapter }>(constructor: T) {
    // Register on first instantiation
    const instance = new constructor();
    protocolRegistry.register(instance);
    return constructor;
  };
}
