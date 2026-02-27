/**
 * Escrow Types
 *
 * TypeScript types mirroring the on-chain LucidEscrow contract.
 */

export enum EscrowStatus {
  Created = 0,
  Released = 1,
  Refunded = 2,
  Disputed = 3,
}

export interface EscrowParams {
  beneficiary: string;
  token: string;
  amount: string; // BigInt as string for JSON serialization
  duration: number; // seconds
  expectedReceiptHash?: string;
}

export interface EscrowInfo {
  escrowId: string;
  depositor: string;
  beneficiary: string;
  token: string;
  amount: string;
  createdAt: number;
  expiresAt: number;
  expectedReceiptHash: string;
  status: EscrowStatus;
}

export interface EscrowRelease {
  escrowId: string;
  receiptHash: string;
  signature: string;
  signerPubkey: string;
}

export interface EscrowDispute {
  escrowId: string;
  reason: string;
}
