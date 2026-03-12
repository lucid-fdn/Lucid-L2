/**
 * Blockchain Adapter Factory
 *
 * Singleton registry for blockchain adapters.
 * Pattern mirrors ProtocolRegistry from protocols/ProtocolRegistry.ts.
 */

import type { IBlockchainAdapter } from './adapter-interface';
import type { ChainConfig, ChainType } from './types';
import { CircuitBreaker } from '../utils/circuitBreaker';

interface RegisteredAdapter {
  adapter: IBlockchainAdapter;
  config: ChainConfig;
  circuitBreaker: CircuitBreaker;
}

export class BlockchainAdapterFactory {
  private adapters: Map<string, RegisteredAdapter> = new Map();
  private static instance: BlockchainAdapterFactory;

  private constructor() {}

  static getInstance(): BlockchainAdapterFactory {
    if (!BlockchainAdapterFactory.instance) {
      BlockchainAdapterFactory.instance = new BlockchainAdapterFactory();
    }
    return BlockchainAdapterFactory.instance;
  }

  /**
   * Register an adapter for a specific chain.
   */
  register(adapter: IBlockchainAdapter, config: ChainConfig): void {
    const key = config.chainId;
    if (this.adapters.has(key)) {
      console.warn(`Blockchain adapter for ${key} is already registered. Replacing...`);
    }
    this.adapters.set(key, {
      adapter,
      config,
      circuitBreaker: new CircuitBreaker({ name: key }),
    });
    console.log(`Registered blockchain adapter: ${config.name} (${key})`);
  }

  /**
   * Get an adapter by chain ID. Connects if not already connected.
   */
  async getAdapter(chainId: string): Promise<IBlockchainAdapter> {
    const entry = this.adapters.get(chainId);
    if (!entry) {
      throw new Error(`No blockchain adapter registered for chain: ${chainId}`);
    }

    // Circuit breaker check — fast-fail if chain is down
    // Connection failures also trip the circuit.
    if (!entry.adapter.isConnected()) {
      await entry.circuitBreaker.run(() => entry.adapter.connect(entry.config));
    }

    return entry.adapter;
  }

  /**
   * Run an async operation on a chain with circuit-breaker protection.
   * Combines adapter lookup + connection + circuit breaker in one call.
   */
  async run<T>(chainId: string, fn: (adapter: IBlockchainAdapter) => Promise<T>): Promise<T> {
    const entry = this.adapters.get(chainId);
    if (!entry) {
      throw new Error(`No blockchain adapter registered for chain: ${chainId}`);
    }

    return entry.circuitBreaker.run(async () => {
      if (!entry.adapter.isConnected()) {
        await entry.adapter.connect(entry.config);
      }
      return fn(entry.adapter);
    });
  }

  /**
   * Get the circuit breaker for a specific chain (for monitoring/reset).
   */
  getCircuitBreaker(chainId: string): CircuitBreaker | undefined {
    return this.adapters.get(chainId)?.circuitBreaker;
  }

  /**
   * Reset all circuit breakers (e.g. after manual intervention).
   */
  resetAllCircuitBreakers(): void {
    for (const entry of this.adapters.values()) {
      entry.circuitBreaker.reset();
    }
  }

  /**
   * Get an adapter synchronously (must already be connected).
   */
  get(chainId: string): IBlockchainAdapter | undefined {
    return this.adapters.get(chainId)?.adapter;
  }

  /**
   * Check if an adapter is registered for a chain.
   */
  has(chainId: string): boolean {
    return this.adapters.has(chainId);
  }

  /**
   * List all registered chains with status.
   */
  listChains(): Array<{ chainId: string; name: string; chainType: ChainType; isTestnet: boolean; connected: boolean }> {
    return Array.from(this.adapters.entries()).map(([chainId, entry]) => ({
      chainId,
      name: entry.config.name,
      chainType: entry.config.chainType,
      isTestnet: entry.config.isTestnet,
      connected: entry.adapter.isConnected(),
    }));
  }

  /**
   * List chains by type.
   */
  listByType(chainType: ChainType): string[] {
    return Array.from(this.adapters.entries())
      .filter(([, entry]) => entry.config.chainType === chainType)
      .map(([chainId]) => chainId);
  }

  /**
   * Get the config for a chain.
   */
  getConfig(chainId: string): ChainConfig | undefined {
    return this.adapters.get(chainId)?.config;
  }

  /**
   * Disconnect all adapters.
   */
  async disconnectAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const entry of this.adapters.values()) {
      if (entry.adapter.isConnected()) {
        promises.push(
          entry.adapter.disconnect().catch((err) => {
            console.error(`Error disconnecting adapter: ${err.message}`);
          })
        );
      }
    }
    await Promise.all(promises);
  }

  /**
   * Get count of registered adapters.
   */
  count(): number {
    return this.adapters.size;
  }
}

/** Global singleton instance */
export const blockchainAdapterFactory = BlockchainAdapterFactory.getInstance();
