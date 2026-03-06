/**
 * Domain Sub-Interfaces for Blockchain Adapters
 *
 * Capability-gated interfaces so services can depend on exactly
 * the chain features they need (epochs, escrow, passports, etc.)
 * rather than the full IBlockchainAdapter.
 */

import type { TxReceipt } from './types';

// =============================================================================
// Supporting Types
// =============================================================================

export interface EscrowCreateParams {
  /** Payer address */
  payer: string;

  /** Payee (service provider) address */
  payee: string;

  /** Amount in native token (lamports / wei) */
  amount: string;

  /** Timeout in seconds before payer can reclaim */
  timeoutSeconds: number;

  /** Receipt hash the payee must present to claim */
  receiptHash?: string;

  /** Optional metadata (e.g. passport ID, run ID) */
  metadata?: string;
}

export interface WalletPolicy {
  /** Maximum single-transaction amount (native units) */
  maxAmount?: string;

  /** Allowed program/contract addresses the wallet may call */
  allowedTargets?: string[];

  /** Whether the wallet can transfer native tokens */
  allowNativeTransfer?: boolean;

  /** Rate limit: max transactions per window */
  rateLimit?: {
    maxTxPerWindow: number;
    windowSeconds: number;
  };
}

export interface GasRecipient {
  /** Recipient address */
  address: string;

  /** Share in basis points (1 bp = 0.01%) */
  bps: number;
}

// =============================================================================
// IEpochAdapter
// =============================================================================

export interface IEpochAdapter {
  /** Commit an epoch root on-chain */
  commitEpoch(
    agentId: string,
    root: string,
    epochId: number,
    leafCount: number,
    mmrSize: number,
  ): Promise<TxReceipt>;

  /** Commit a batch of epoch roots in a single transaction */
  commitEpochBatch(
    epochs: Array<{
      agentId: string;
      root: string;
      epochId: number;
      leafCount: number;
      mmrSize: number;
    }>,
  ): Promise<TxReceipt>;

  /** Verify an epoch root matches what is stored on-chain */
  verifyEpoch(
    agentId: string,
    epochId: number,
    expectedRoot: string,
  ): Promise<boolean>;
}

// =============================================================================
// IEscrowAdapter
// =============================================================================

export interface IEscrowAdapter {
  /** Create a new escrow */
  createEscrow(params: EscrowCreateParams): Promise<{ escrowId: string; tx: TxReceipt }>;

  /** Release escrow funds to the payee */
  releaseEscrow(
    escrowId: string,
    receiptHash: string,
    signature: string,
  ): Promise<TxReceipt>;

  /** Reclaim funds after timeout */
  claimTimeout(escrowId: string): Promise<TxReceipt>;

  /** Open a dispute on an escrow */
  disputeEscrow(escrowId: string, reason: string): Promise<TxReceipt>;
}

// =============================================================================
// IPassportAdapter
// =============================================================================

export interface IPassportAdapter {
  /** Anchor a passport hash on-chain */
  anchorPassport(
    passportId: string,
    contentHash: string,
    owner: string,
  ): Promise<TxReceipt>;

  /** Update the on-chain status of a passport */
  updatePassportStatus(
    passportId: string,
    status: string,
  ): Promise<TxReceipt>;

  /** Verify a passport's content hash matches the on-chain anchor */
  verifyAnchor(
    passportId: string,
    contentHash: string,
  ): Promise<boolean>;

  /** Set payment gate pricing for a passport */
  setPaymentGate(
    passportId: string,
    priceNative: string,
    priceLucid: string,
  ): Promise<TxReceipt>;

  /** Pay for access to a gated passport */
  payForAccess(
    passportId: string,
    duration: number,
  ): Promise<TxReceipt>;

  /** Check whether a user has access to a gated passport */
  checkAccess(
    passportId: string,
    user: string,
  ): Promise<boolean>;

  /** Withdraw accumulated revenue from a passport's payment gate */
  withdrawRevenue(passportId: string): Promise<TxReceipt>;
}

// =============================================================================
// IAgentWalletAdapter
// =============================================================================

export interface IAgentWalletAdapter {
  /** Create a PDA/smart-account wallet for an agent */
  createWallet(
    passportRef: string,
  ): Promise<{ walletAddress: string; tx: TxReceipt }>;

  /** Execute an instruction from the agent wallet */
  execute(
    walletAddress: string,
    instruction: string,
  ): Promise<TxReceipt>;

  /** Set the spending/call policy for a wallet */
  setPolicy(
    walletAddress: string,
    policy: WalletPolicy,
  ): Promise<TxReceipt>;

  /** Create a delegated session key */
  createSession(
    walletAddress: string,
    delegate: string,
    permissions: string[],
    expiresAt: number,
    maxAmount: string,
  ): Promise<TxReceipt>;

  /** Revoke a delegated session key */
  revokeSession(
    walletAddress: string,
    delegate: string,
  ): Promise<TxReceipt>;
}

// =============================================================================
// IGasAdapter
// =============================================================================

export interface IGasAdapter {
  /** Collect iGas + mGas and split among recipients, burning a portion */
  collectAndSplit(
    iGas: string,
    mGas: string,
    recipients: GasRecipient[],
    burnBps: number,
  ): Promise<TxReceipt>;
}
