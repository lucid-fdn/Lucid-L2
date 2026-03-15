/**
 * Dispute Service (ALPHA)
 *
 * Off-chain service for managing LucidArbitration contract interactions.
 *
 * Status:
 * - On-chain calls: functional via adapter (EVM only)
 * - Persistence: IN-MEMORY ONLY — disputes are lost on restart
 * - Production use requires: DB migration for disputes table, contract deployment
 */

import { encodeFunctionData } from 'viem';
import type { DisputeInfo, EvidenceSubmission } from './disputeTypes';
import { DisputeStatus } from './disputeTypes';

// LucidArbitration ABI (minimal)
const ARBITRATION_ABI = [
  {
    name: 'openDispute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'escrowId', type: 'bytes32' },
      { name: 'reason', type: 'string' },
    ],
    outputs: [{ name: 'disputeId', type: 'bytes32' }],
  },
  {
    name: 'submitEvidence',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'disputeId', type: 'bytes32' },
      { name: 'receiptHash', type: 'bytes32' },
      { name: 'mmrRoot', type: 'bytes32' },
      { name: 'mmrProof', type: 'bytes' },
      { name: 'description', type: 'string' },
    ],
    outputs: [],
  },
  {
    name: 'resolveDispute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'disputeId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'appealDecision',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'disputeId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'getDispute',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'disputeId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'disputeId', type: 'bytes32' },
          { name: 'escrowId', type: 'bytes32' },
          { name: 'initiator', type: 'address' },
          { name: 'reason', type: 'string' },
          { name: 'status', type: 'uint8' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'evidenceDeadline', type: 'uint256' },
          { name: 'resolvedInFavorOf', type: 'address' },
          { name: 'appealed', type: 'bool' },
          { name: 'appealDeadline', type: 'uint256' },
          { name: 'appealedBy', type: 'address' },
        ],
      },
    ],
  },
  {
    name: 'DisputeOpened',
    type: 'event',
    inputs: [
      { name: 'disputeId', type: 'bytes32', indexed: true },
      { name: 'escrowId', type: 'bytes32', indexed: true },
      { name: 'initiator', type: 'address', indexed: true },
      { name: 'reason', type: 'string', indexed: false },
      { name: 'evidenceDeadline', type: 'uint256', indexed: false },
    ],
  },
] as const;

function encodeArbitrationCall(funcName: string, args: unknown[]): `0x${string}` {
  const func = ARBITRATION_ABI.find((f) => 'name' in f && f.name === funcName && f.type === 'function');
  if (!func) throw new Error(`Unknown arbitration function: ${funcName}`);
  return encodeFunctionData({ abi: [func] as readonly unknown[], functionName: funcName, args } as Parameters<typeof encodeFunctionData>[0]);
}

export class DisputeService {
  private static instance: DisputeService | null = null;

  // In-memory dispute tracking (MVP)
  private disputeStore = new Map<string, DisputeInfo>();

  private constructor() {}

  static getInstance(): DisputeService {
    if (!DisputeService.instance) {
      DisputeService.instance = new DisputeService();
    }
    return DisputeService.instance;
  }

  /**
   * Open a dispute for an escrow.
   */
  async openDispute(
    chainId: string,
    escrowId: string,
    reason: string,
  ): Promise<{ disputeId: string; txHash: string }> {
    const { blockchainAdapterFactory } = await import('../../chain/blockchain/BlockchainAdapterFactory');
    const { CHAIN_CONFIGS } = await import('../../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config) throw new Error(`Unknown chain: ${chainId}`);
    if (!config.arbitrationContract) throw new Error(`No arbitration contract on chain: ${chainId}`);

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) throw new Error(`No adapter for chain: ${chainId}`);

    const txReceipt = await adapter.sendTransaction({
      to: config.arbitrationContract,
      data: encodeArbitrationCall('openDispute', [escrowId, reason]),
    });

    const disputeId = `dispute_${chainId}_${txReceipt.hash}`;
    const now = Math.floor(Date.now() / 1000);

    const info: DisputeInfo = {
      disputeId,
      escrowId,
      initiator: '',
      reason,
      status: DisputeStatus.EvidencePhase,
      createdAt: now,
      evidenceDeadline: now + 48 * 3600,
      resolvedInFavorOf: '',
      appealed: false,
      appealDeadline: 0,
      appealedBy: '',
    };

    this.disputeStore.set(disputeId, info);
    return { disputeId, txHash: txReceipt.hash };
  }

  /**
   * Submit evidence for a dispute.
   */
  async submitEvidence(
    chainId: string,
    disputeId: string,
    evidence: EvidenceSubmission,
  ): Promise<{ txHash: string }> {
    const { blockchainAdapterFactory } = await import('../../chain/blockchain/BlockchainAdapterFactory');
    const { CHAIN_CONFIGS } = await import('../../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config?.arbitrationContract) throw new Error(`No arbitration contract on chain: ${chainId}`);

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) throw new Error(`No adapter for chain: ${chainId}`);

    const txReceipt = await adapter.sendTransaction({
      to: config.arbitrationContract,
      data: encodeArbitrationCall('submitEvidence', [disputeId, evidence.receiptHash, evidence.mmrRoot, evidence.mmrProof, evidence.description]),
    });

    return { txHash: txReceipt.hash };
  }

  /**
   * Trigger on-chain dispute resolution.
   */
  async resolveDispute(
    chainId: string,
    disputeId: string,
  ): Promise<{ txHash: string }> {
    const { blockchainAdapterFactory } = await import('../../chain/blockchain/BlockchainAdapterFactory');
    const { CHAIN_CONFIGS } = await import('../../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config?.arbitrationContract) throw new Error(`No arbitration contract on chain: ${chainId}`);

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) throw new Error(`No adapter for chain: ${chainId}`);

    const txReceipt = await adapter.sendTransaction({
      to: config.arbitrationContract,
      data: encodeArbitrationCall('resolveDispute', [disputeId]),
    });

    const info = this.disputeStore.get(disputeId);
    if (info) {
      info.status = DisputeStatus.Resolved;
    }

    return { txHash: txReceipt.hash };
  }

  /**
   * Appeal a dispute decision with stake.
   */
  async appealDecision(
    chainId: string,
    disputeId: string,
  ): Promise<{ txHash: string }> {
    const { blockchainAdapterFactory } = await import('../../chain/blockchain/BlockchainAdapterFactory');
    const { CHAIN_CONFIGS } = await import('../../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config?.arbitrationContract) throw new Error(`No arbitration contract on chain: ${chainId}`);

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) throw new Error(`No adapter for chain: ${chainId}`);

    const txReceipt = await adapter.sendTransaction({
      to: config.arbitrationContract,
      data: encodeArbitrationCall('appealDecision', [disputeId]),
    });

    const info = this.disputeStore.get(disputeId);
    if (info) {
      info.status = DisputeStatus.Appealed;
      info.appealed = true;
      info.appealDeadline = Math.floor(Date.now() / 1000) + 72 * 3600;
    }

    return { txHash: txReceipt.hash };
  }

  /**
   * Get dispute info from local store.
   */
  getDispute(disputeId: string): DisputeInfo | null {
    return this.disputeStore.get(disputeId) || null;
  }

  /**
   * List disputes for an address.
   */
  listDisputes(address: string): DisputeInfo[] {
    return Array.from(this.disputeStore.values()).filter(
      (d) => d.initiator === address,
    );
  }

  /** Get the ABI for external use */
  static getABI() {
    return ARBITRATION_ABI;
  }
}

export function getDisputeService(): DisputeService {
  return DisputeService.getInstance();
}
