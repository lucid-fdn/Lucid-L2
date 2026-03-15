/**
 * ERC-8004 Identity Registry Client
 *
 * Thin wrapper around viem calls to the deployed Identity Registry contract.
 * The Identity Registry is an ERC-721 that mints agent NFTs with tokenURI metadata.
 */

import type { Hash } from 'viem';
import type { AgentIdentity } from '../../shared/chains/types';
import IdentityRegistryABI from './abis/IdentityRegistry.json';

export class IdentityRegistryClient {
  constructor(
    private publicClient: any,
    private walletClient: any | null,
    private contractAddress: `0x${string}`,
  ) {}

  /**
   * Register a new agent (mints an ERC-721 token).
   */
  async register(metadataURI: string, to: string): Promise<Hash> {
    if (!this.walletClient) {
      throw new Error('Wallet client required for register');
    }

    const { request } = await this.publicClient.simulateContract({
      address: this.contractAddress,
      abi: IdentityRegistryABI,
      functionName: 'register',
      args: [to, metadataURI],
      account: this.walletClient.account,
    });

    return this.walletClient.writeContract(request);
  }

  /**
   * Get an agent by token ID.
   */
  async getAgent(tokenId: string, chainId: string): Promise<AgentIdentity | null> {
    try {
      const [owner, tokenURI] = await Promise.all([
        this.publicClient.readContract({
          address: this.contractAddress,
          abi: IdentityRegistryABI,
          functionName: 'ownerOf',
          args: [BigInt(tokenId)],
        }),
        this.publicClient.readContract({
          address: this.contractAddress,
          abi: IdentityRegistryABI,
          functionName: 'tokenURI',
          args: [BigInt(tokenId)],
        }),
      ]);

      return {
        tokenId,
        owner: owner as string,
        tokenURI: tokenURI as string,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get the tokenURI for an agent.
   */
  async getTokenURI(tokenId: string): Promise<string | null> {
    try {
      const uri = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: IdentityRegistryABI,
        functionName: 'tokenURI',
        args: [BigInt(tokenId)],
      });
      return uri as string;
    } catch {
      return null;
    }
  }

  /**
   * Get total number of registered agents.
   */
  async totalSupply(): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: IdentityRegistryABI,
      functionName: 'totalSupply',
    });
    return result as bigint;
  }

  /**
   * List agents owned by an address.
   */
  async listAgents(owner: string): Promise<string[]> {
    const balance = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: IdentityRegistryABI,
      functionName: 'balanceOf',
      args: [owner],
    }) as bigint;

    const tokenIds: string[] = [];
    for (let i = 0n; i < balance; i++) {
      const tokenId = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: IdentityRegistryABI,
        functionName: 'tokenOfOwnerByIndex',
        args: [owner, i],
      }) as bigint;
      tokenIds.push(tokenId.toString());
    }

    return tokenIds;
  }
}
