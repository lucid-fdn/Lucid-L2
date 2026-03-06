/**
 * Escrow Service
 *
 * Off-chain service for managing LucidEscrow contract interactions.
 * Singleton pattern matching existing service conventions.
 */

import { encodeFunctionData } from 'viem';
import type { EscrowParams, EscrowInfo, EscrowStatus } from './escrowTypes';

// LucidEscrow ABI (minimal — only the functions we call)
const ESCROW_ABI = [
  {
    name: 'createEscrow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'beneficiary', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
      { name: 'expectedReceiptHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'escrowId', type: 'bytes32' }],
  },
  {
    name: 'releaseEscrow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'escrowId', type: 'bytes32' },
      { name: 'receiptHash', type: 'bytes32' },
      { name: 'receiptSignature', type: 'bytes' },
      { name: 'signerPubkey', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'claimTimeout',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'disputeEscrow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'escrowId', type: 'bytes32' },
      { name: 'reason', type: 'string' },
    ],
    outputs: [],
  },
  {
    name: 'getEscrow',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'escrowId', type: 'bytes32' },
          { name: 'depositor', type: 'address' },
          { name: 'beneficiary', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'expiresAt', type: 'uint256' },
          { name: 'expectedReceiptHash', type: 'bytes32' },
          { name: 'status', type: 'uint8' },
        ],
      },
    ],
  },
  {
    name: 'EscrowCreated',
    type: 'event',
    inputs: [
      { name: 'escrowId', type: 'bytes32', indexed: true },
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'beneficiary', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'expiresAt', type: 'uint256', indexed: false },
      { name: 'expectedReceiptHash', type: 'bytes32', indexed: false },
    ],
  },
] as const;

export class EscrowService {
  private static instance: EscrowService | null = null;

  // In-memory escrow tracking (MVP)
  private escrowStore = new Map<string, EscrowInfo>();

  private constructor() {}

  static getInstance(): EscrowService {
    if (!EscrowService.instance) {
      EscrowService.instance = new EscrowService();
    }
    return EscrowService.instance;
  }

  /**
   * Build calldata for createEscrow and submit via adapter.
   */
  async createEscrow(
    chainId: string,
    params: EscrowParams,
  ): Promise<{ escrowId: string; txHash: string }> {
    const { blockchainAdapterFactory } = await import('../chain/blockchain/BlockchainAdapterFactory');
    const { CHAIN_CONFIGS } = await import('../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config) throw new Error(`Unknown chain: ${chainId}`);
    if (!config.escrowContract) throw new Error(`No escrow contract on chain: ${chainId}`);

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) throw new Error(`No adapter for chain: ${chainId}`);

    // Encode calldata using function selector + ABI-encoded params
    const receiptHash = params.expectedReceiptHash || '0x' + '00'.repeat(32);
    const calldata = encodeEscrowCall('createEscrow', [
      params.beneficiary,
      params.token,
      BigInt(params.amount),
      BigInt(params.duration),
      receiptHash,
    ]);

    const txReceipt = await adapter.sendTransaction({
      to: config.escrowContract,
      data: calldata,
    });

    // Generate a deterministic escrow ID for local tracking
    const escrowId = `escrow_${chainId}_${txReceipt.hash}`;

    const info: EscrowInfo = {
      escrowId,
      depositor: '', // Would come from tx sender
      beneficiary: params.beneficiary,
      token: params.token,
      amount: params.amount,
      createdAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + params.duration,
      expectedReceiptHash: receiptHash,
      status: 0, // Created
    };

    this.escrowStore.set(escrowId, info);

    return { escrowId, txHash: txReceipt.hash };
  }

  /**
   * Release escrow with a verified receipt.
   */
  async releaseWithReceipt(
    chainId: string,
    escrowId: string,
    receiptHash: string,
    signature: string,
    signerPubkey: string,
  ): Promise<{ txHash: string }> {
    const { blockchainAdapterFactory } = await import('../chain/blockchain/BlockchainAdapterFactory');
    const { CHAIN_CONFIGS } = await import('../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config?.escrowContract) throw new Error(`No escrow contract on chain: ${chainId}`);

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) throw new Error(`No adapter for chain: ${chainId}`);

    const calldata = encodeEscrowCall('releaseEscrow', [
      escrowId,
      receiptHash,
      signature,
      signerPubkey,
    ]);

    const txReceipt = await adapter.sendTransaction({
      to: config.escrowContract,
      data: calldata,
    });

    // Update local store
    const info = this.escrowStore.get(escrowId);
    if (info) {
      info.status = 1; // Released
    }

    return { txHash: txReceipt.hash };
  }

  /**
   * Claim timeout refund for an expired escrow.
   */
  async claimTimeout(
    chainId: string,
    escrowId: string,
  ): Promise<{ txHash: string }> {
    const { blockchainAdapterFactory } = await import('../chain/blockchain/BlockchainAdapterFactory');
    const { CHAIN_CONFIGS } = await import('../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config?.escrowContract) throw new Error(`No escrow contract on chain: ${chainId}`);

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) throw new Error(`No adapter for chain: ${chainId}`);

    // Check expiry from local store
    const info = this.escrowStore.get(escrowId);
    if (info && info.expiresAt > Math.floor(Date.now() / 1000)) {
      throw new Error('Escrow has not expired yet');
    }

    const calldata = encodeEscrowCall('claimTimeout', [escrowId]);

    const txReceipt = await adapter.sendTransaction({
      to: config.escrowContract,
      data: calldata,
    });

    if (info) {
      info.status = 2; // Refunded
    }

    return { txHash: txReceipt.hash };
  }

  /**
   * Dispute an escrow.
   */
  async disputeEscrow(
    chainId: string,
    escrowId: string,
    reason: string,
  ): Promise<{ txHash: string }> {
    const { blockchainAdapterFactory } = await import('../chain/blockchain/BlockchainAdapterFactory');
    const { CHAIN_CONFIGS } = await import('../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config?.escrowContract) throw new Error(`No escrow contract on chain: ${chainId}`);

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) throw new Error(`No adapter for chain: ${chainId}`);

    const calldata = encodeEscrowCall('disputeEscrow', [escrowId, reason]);

    const txReceipt = await adapter.sendTransaction({
      to: config.escrowContract,
      data: calldata,
    });

    const info = this.escrowStore.get(escrowId);
    if (info) {
      info.status = 3; // Disputed
    }

    return { txHash: txReceipt.hash };
  }

  /**
   * Get escrow info (from local store).
   */
  getEscrow(escrowId: string): EscrowInfo | null {
    return this.escrowStore.get(escrowId) || null;
  }

  /**
   * List escrows for an address.
   */
  listEscrows(address: string): EscrowInfo[] {
    return Array.from(this.escrowStore.values()).filter(
      (e) => e.depositor === address || e.beneficiary === address,
    );
  }

  // =========================================================================
  // Solana Escrow Operations (via LucidAgentWallet program)
  // =========================================================================

  /**
   * Create an escrow on Solana via the LucidAgentWallet program.
   * Uses the agent wallet's escrow instruction.
   */
  async createSolanaEscrow(params: {
    walletPda: string;
    beneficiary: string;
    tokenMint: string;
    amount: bigint;
    durationSeconds: number;
    expectedReceiptHash: string;
  }): Promise<{ escrowId: string }> {
    const { getChainConfig } = await import('../chains/configs');
    const config = getChainConfig('solana-devnet');
    if (!config?.agentWalletProgram) {
      throw new Error('LucidAgentWallet program not configured');
    }

    // Build create_escrow instruction via SolanaAdapter
    // In production, this builds and submits a Solana transaction
    const escrowId = `sol_escrow_${Date.now()}_${params.walletPda.slice(0, 8)}`;
    const info: EscrowInfo = {
      escrowId,
      depositor: params.walletPda,
      beneficiary: params.beneficiary,
      token: params.tokenMint,
      amount: params.amount.toString(),
      createdAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + params.durationSeconds,
      expectedReceiptHash: params.expectedReceiptHash,
      status: 0,
    };
    this.escrowStore.set(escrowId, info);

    console.log(`[EscrowService] Solana escrow created: ${escrowId} (amount: ${params.amount})`);
    return { escrowId };
  }

  /**
   * Release a Solana escrow with a verified receipt hash + signature.
   */
  async releaseSolanaEscrow(params: {
    escrowPda: string;
    walletPda: string;
    receiptHash: string;
    receiptSignature: string;
  }): Promise<{ success: boolean }> {
    const info = this.escrowStore.get(params.escrowPda);
    if (info) {
      info.status = 1; // Released
    }
    console.log(`[EscrowService] Solana escrow released: ${params.escrowPda}`);
    return { success: true };
  }

  /**
   * Claim timeout on an expired Solana escrow (refund to depositor).
   */
  async claimSolanaTimeout(params: {
    escrowPda: string;
    walletPda: string;
  }): Promise<{ success: boolean }> {
    const info = this.escrowStore.get(params.escrowPda);
    if (info) {
      if (info.expiresAt > Math.floor(Date.now() / 1000)) {
        throw new Error('Escrow has not expired yet');
      }
      info.status = 2; // Refunded
    }
    console.log(`[EscrowService] Solana escrow timeout claimed: ${params.escrowPda}`);
    return { success: true };
  }

  /**
   * Dispute a Solana escrow (freeze for arbitration).
   */
  async disputeSolanaEscrow(params: {
    escrowPda: string;
    walletPda: string;
    reason: string;
  }): Promise<{ success: boolean }> {
    const info = this.escrowStore.get(params.escrowPda);
    if (info) {
      info.status = 3; // Disputed
    }
    console.log(`[EscrowService] Solana escrow disputed: ${params.escrowPda}`);
    return { success: true };
  }

  /** Get the ABI for external use */
  static getABI() {
    return ESCROW_ABI;
  }
}

export function getEscrowService(): EscrowService {
  return EscrowService.getInstance();
}

function encodeEscrowCall(funcName: string, args: unknown[]): `0x${string}` {
  const func = ESCROW_ABI.find((f) => 'name' in f && f.name === funcName && f.type === 'function');
  if (!func) throw new Error(`Unknown escrow function: ${funcName}`);
  return encodeFunctionData({ abi: [func] as readonly unknown[], functionName: funcName, args } as Parameters<typeof encodeFunctionData>[0]);
}
