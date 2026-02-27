/**
 * Token Bound Account Service
 *
 * Manages ERC-6551 TBAs for Lucid passport NFTs.
 * Each passport NFT can have a TBA that receives payouts and signs transactions.
 */

import { blockchainAdapterFactory } from '../../blockchain/BlockchainAdapterFactory';
import { CHAIN_CONFIGS } from '../../blockchain/chains';
import { ERC6551RegistryClient, ERC6551_REGISTRY_ADDRESS } from '../../blockchain/evm/erc6551/ERC6551RegistryClient';
import { EVMAdapter } from '../../blockchain/evm/EVMAdapter';

export interface TBAInfo {
  address: string;
  chainId: string;
  tokenContract: string;
  tokenId: string;
  deployed: boolean;
  nativeBalance?: string;
  lucidBalance?: string;
}

// Cache TBA addresses to avoid repeated RPC calls
const tbaCache = new Map<string, string>();

export class TBAService {
  private static instance: TBAService | null = null;

  private constructor() {}

  static getInstance(): TBAService {
    if (!TBAService.instance) {
      TBAService.instance = new TBAService();
    }
    return TBAService.instance;
  }

  /**
   * Create a Token Bound Account for a passport NFT.
   */
  async createTBA(
    chainId: string,
    tokenContract: string,
    tokenId: string,
  ): Promise<{ address: string; txHash: string }> {
    const client = await this.getRegistryClient(chainId);
    const chainConfig = CHAIN_CONFIGS[chainId];
    const evmChainId = chainConfig?.evmChainId || 1;

    const result = await client.createAccount(evmChainId, tokenContract, tokenId);

    // Cache the address
    const cacheKey = `${chainId}:${tokenContract}:${tokenId}`;
    tbaCache.set(cacheKey, result.address);

    return result;
  }

  /**
   * Get the deterministic TBA address for a passport NFT.
   * Does not require the TBA to be deployed.
   */
  async getTBA(chainId: string, tokenContract: string, tokenId: string): Promise<TBAInfo> {
    const cacheKey = `${chainId}:${tokenContract}:${tokenId}`;
    let address = tbaCache.get(cacheKey);

    const client = await this.getRegistryClient(chainId);
    const chainConfig = CHAIN_CONFIGS[chainId];
    const evmChainId = chainConfig?.evmChainId || 1;

    if (!address) {
      address = await client.getAccount(evmChainId, tokenContract, tokenId);
      tbaCache.set(cacheKey, address);
    }

    const deployed = await client.isDeployed(address);

    let nativeBalance: string | undefined;
    if (deployed) {
      nativeBalance = await client.getBalance(address);
    }

    return {
      address,
      chainId,
      tokenContract,
      tokenId,
      deployed,
      nativeBalance,
    };
  }

  /**
   * Get the TBA balance (native + $LUCID).
   */
  async getTBABalance(
    chainId: string,
    tbaAddress: string,
  ): Promise<{ native: string; lucid: string }> {
    const client = await this.getRegistryClient(chainId);

    const native = await client.getBalance(tbaAddress);

    // Get $LUCID balance if configured
    const chainConfig = CHAIN_CONFIGS[chainId];
    let lucid = '0';
    if (chainConfig?.lucidTokenAddress) {
      const adapter = await blockchainAdapterFactory.getAdapter(chainId);
      if (adapter && adapter instanceof EVMAdapter) {
        try {
          // ERC-20 balanceOf(address)
          const publicClient = (adapter as EVMAdapter).publicClient;
          if (publicClient) {
            const balance = await publicClient.readContract({
              address: chainConfig.lucidTokenAddress as `0x${string}`,
              abi: [
                {
                  inputs: [{ name: 'account', type: 'address' }],
                  name: 'balanceOf',
                  outputs: [{ name: '', type: 'uint256' }],
                  stateMutability: 'view',
                  type: 'function',
                },
              ],
              functionName: 'balanceOf',
              args: [tbaAddress as `0x${string}`],
            });
            lucid = balance.toString();
          }
        } catch {
          // LUCID balance not available
        }
      }
    }

    return { native, lucid };
  }

  /**
   * Resolve a TBA address from an agent's passport token ID.
   * Returns null if no ERC-6551 config exists on the chain.
   */
  async resolveTBAForAgent(
    chainId: string,
    agentTokenId: string,
  ): Promise<string | null> {
    const chainConfig = CHAIN_CONFIGS[chainId];
    if (!chainConfig?.erc6551 || !chainConfig?.erc8004?.identityRegistry) {
      return null;
    }

    const cacheKey = `${chainId}:${chainConfig.erc8004.identityRegistry}:${agentTokenId}`;
    const cached = tbaCache.get(cacheKey);
    if (cached) return cached;

    try {
      const client = await this.getRegistryClient(chainId);
      const evmChainId = chainConfig.evmChainId || 1;

      const address = await client.getAccount(
        evmChainId,
        chainConfig.erc8004.identityRegistry,
        agentTokenId,
      );

      tbaCache.set(cacheKey, address);
      return address;
    } catch {
      return null;
    }
  }

  private async getRegistryClient(chainId: string): Promise<ERC6551RegistryClient> {
    const chainConfig = CHAIN_CONFIGS[chainId];
    if (!chainConfig) {
      throw new Error(`Unknown chain: ${chainId}`);
    }

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter || !(adapter instanceof EVMAdapter)) {
      throw new Error(`No EVM adapter available for chain: ${chainId}`);
    }

    const registryAddress = chainConfig.erc6551?.registry || ERC6551_REGISTRY_ADDRESS;
    const implementation = chainConfig.erc6551?.accountImplementation;
    if (!implementation) {
      throw new Error(`No ERC-6551 account implementation configured for chain: ${chainId}`);
    }

    return new ERC6551RegistryClient(
      (adapter as EVMAdapter).publicClient,
      (adapter as EVMAdapter).walletClient,
      registryAddress,
      implementation,
    );
  }
}

export function getTBAService(): TBAService {
  return TBAService.getInstance();
}
