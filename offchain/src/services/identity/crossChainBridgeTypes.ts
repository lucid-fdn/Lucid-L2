/**
 * Cross-Chain Bridge Types
 *
 * Types for LayerZero OFT $LUCID bridging.
 */

export interface BridgeParams {
  /** Source chain ID (e.g. 'base') */
  sourceChainId: string;
  /** Destination chain ID (e.g. 'arbitrum') */
  destChainId: string;
  /** Amount in $LUCID smallest unit (9 decimals) */
  amount: string;
  /** Recipient address on destination chain */
  recipientAddress: string;
  /** Sender address (optional, defaults to wallet) */
  senderAddress?: string;
}

export interface BridgeReceipt {
  /** Source chain transaction hash */
  txHash: string;
  /** Source chain ID */
  sourceChainId: string;
  /** Destination chain ID */
  destChainId: string;
  /** Amount bridged */
  amount: string;
  /** Recipient address */
  recipientAddress: string;
  /** LayerZero message nonce */
  lzNonce?: string;
  /** Timestamp */
  createdAt: number;
}

export interface BridgeStatus {
  txHash: string;
  sourceChainId: string;
  destChainId: string;
  status: 'pending' | 'inflight' | 'delivered' | 'failed';
  sourceConfirmed: boolean;
  destConfirmed: boolean;
  estimatedDeliveryMs?: number;
}

export interface BridgeQuote {
  sourceChainId: string;
  destChainId: string;
  amount: string;
  /** Estimated native gas fee on source chain (in wei) */
  estimatedFee: string;
  /** Estimated delivery time in ms */
  estimatedDeliveryMs: number;
}

export type LayerZeroChainId = number;

/** LayerZero V2 Endpoint IDs for supported chains */
export const LZ_CHAIN_IDS: Record<string, LayerZeroChainId> = {
  'ethereum': 30101,
  'base': 30184,
  'arbitrum': 30110,
  'avalanche': 30106,
  'polygon': 30109,
  // Testnets
  'base-sepolia': 40245,
  'ethereum-sepolia': 40161,
};
