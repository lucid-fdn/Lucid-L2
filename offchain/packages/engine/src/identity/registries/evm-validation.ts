/**
 * ERC-8004 Validation Registry Client
 *
 * Thin wrapper around viem calls to the Validation Registry contract.
 * Supports both the standard ERC-8004 ValidationRegistry and
 * Lucid's custom LucidValidator contract.
 */

import type { Hash } from 'viem';
import type { ValidationRecord } from './types';
import ValidationRegistryABI from './abis/ValidationRegistry.json';

/** LucidValidator-specific ABI entries */
export const LUCID_VALIDATOR_ABI = [
  {
    type: 'function',
    name: 'submitValidation',
    inputs: [
      { name: 'validationRegistry', type: 'address' },
      { name: 'agentTokenId', type: 'uint256' },
      { name: 'receiptHash', type: 'bytes32' },
      { name: 'valid', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'validateReceipt',
    inputs: [
      { name: 'receiptHash', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
      { name: 'signerPubkey', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'verifyMMRProof',
    inputs: [
      { name: 'leafHash', type: 'bytes32' },
      { name: 'siblings', type: 'bytes32[]' },
      { name: 'peaks', type: 'bytes32[]' },
      { name: 'leafIndex', type: 'uint64' },
      { name: 'expectedRoot', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'pure',
  },
] as const;

export class ValidationRegistryClient {
  constructor(
    private publicClient: any,
    private walletClient: any | null,
    private registryAddress: `0x${string}`,
    private lucidValidatorAddress?: `0x${string}`,
  ) {}

  /**
   * Request validation for an agent's receipt via the standard registry.
   */
  async requestValidation(
    agentTokenId: string,
    receiptHash: string,
    metadata: string = '0x',
  ): Promise<Hash> {
    if (!this.walletClient) throw new Error('Wallet client required');

    const { request } = await this.publicClient.simulateContract({
      address: this.registryAddress,
      abi: ValidationRegistryABI,
      functionName: 'requestValidation',
      args: [BigInt(agentTokenId), receiptHash, metadata],
      account: this.walletClient.account,
    });

    return this.walletClient.writeContract(request);
  }

  /**
   * Submit a validation result.
   * If LucidValidator is configured, goes through it for receipt verification.
   * Otherwise, submits directly to the registry.
   */
  async submitResult(
    agentTokenId: string,
    receiptHash: string,
    valid: boolean,
  ): Promise<Hash> {
    if (!this.walletClient) throw new Error('Wallet client required');

    // Use LucidValidator if available
    if (this.lucidValidatorAddress) {
      const { request } = await this.publicClient.simulateContract({
        address: this.lucidValidatorAddress,
        abi: LUCID_VALIDATOR_ABI,
        functionName: 'submitValidation',
        args: [this.registryAddress, BigInt(agentTokenId), receiptHash, valid],
        account: this.walletClient.account,
      });

      return this.walletClient.writeContract(request);
    }

    // Direct submission to standard registry
    const { request } = await this.publicClient.simulateContract({
      address: this.registryAddress,
      abi: ValidationRegistryABI,
      functionName: 'requestValidation',
      args: [BigInt(agentTokenId), receiptHash, '0x'],
      account: this.walletClient.account,
    });

    return this.walletClient.writeContract(request);
  }

  /**
   * Get a validation record by ID.
   */
  async getValidation(validationId: string): Promise<ValidationRecord | null> {
    try {
      const result = await this.publicClient.readContract({
        address: this.registryAddress,
        abi: ValidationRegistryABI,
        functionName: 'getValidation',
        args: [BigInt(validationId)],
      }) as any;

      return {
        validationId: BigInt(validationId),
        agentTokenId: result[0],
        validator: result[1],
        receiptHash: result[2],
        valid: result[3],
        timestamp: result[4],
      };
    } catch {
      return null;
    }
  }

  /**
   * Get validation count for an agent.
   */
  async getValidationCount(agentTokenId: string): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: this.registryAddress,
      abi: ValidationRegistryABI,
      functionName: 'getValidationCount',
      args: [BigInt(agentTokenId)],
    });
    return result as bigint;
  }

  // =========================================================================
  // LucidValidator-specific operations
  // =========================================================================

  /**
   * Verify a Lucid receipt hash + signature on-chain (view call, no gas).
   */
  async validateReceipt(
    receiptHash: string,
    signature: string,
    signerPubkey: string,
  ): Promise<boolean> {
    if (!this.lucidValidatorAddress) {
      throw new Error('LucidValidator not configured');
    }

    const result = await this.publicClient.readContract({
      address: this.lucidValidatorAddress,
      abi: LUCID_VALIDATOR_ABI,
      functionName: 'validateReceipt',
      args: [receiptHash, signature, signerPubkey],
    });
    return result as boolean;
  }

  /**
   * Verify an MMR inclusion proof on-chain (pure call, no gas).
   */
  async verifyMMRProof(
    leafHash: string,
    siblings: string[],
    peaks: string[],
    leafIndex: number,
    expectedRoot: string,
  ): Promise<boolean> {
    if (!this.lucidValidatorAddress) {
      throw new Error('LucidValidator not configured');
    }

    const result = await this.publicClient.readContract({
      address: this.lucidValidatorAddress,
      abi: LUCID_VALIDATOR_ABI,
      functionName: 'verifyMMRProof',
      args: [leafHash, siblings, peaks, BigInt(leafIndex), expectedRoot],
    });
    return result as boolean;
  }
}
