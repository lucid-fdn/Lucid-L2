/**
 * Cross-Chain Bridge Service
 *
 * Handles $LUCID cross-chain transfers via LayerZero OFT.
 * Solana is canonical (SPL token), EVM chains use mint/burn OFT.
 */

import { encodeFunctionData } from 'viem';
import { blockchainAdapterFactory } from '../chain/blockchain/BlockchainAdapterFactory';
import { CHAIN_CONFIGS } from '../chain/blockchain/chains';
import type {
  BridgeParams,
  BridgeReceipt,
  BridgeStatus,
  BridgeQuote,
} from './crossChainBridgeTypes';
import { LZ_CHAIN_IDS } from './crossChainBridgeTypes';

// OFT send ABI (LayerZero V2)
const OFT_SEND_ABI = [
  {
    name: 'send',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: '_sendParam',
        type: 'tuple',
        components: [
          { name: 'dstEid', type: 'uint32' },
          { name: 'to', type: 'bytes32' },
          { name: 'amountLD', type: 'uint256' },
          { name: 'minAmountLD', type: 'uint256' },
          { name: 'extraOptions', type: 'bytes' },
          { name: 'composeMsg', type: 'bytes' },
          { name: 'oftCmd', type: 'bytes' },
        ],
      },
      {
        name: '_fee',
        type: 'tuple',
        components: [
          { name: 'nativeFee', type: 'uint256' },
          { name: 'lzTokenFee', type: 'uint256' },
        ],
      },
      { name: '_refundAddress', type: 'address' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'guid', type: 'bytes32' },
          { name: 'nonce', type: 'uint64' },
          { name: 'fee', type: 'tuple', components: [
            { name: 'nativeFee', type: 'uint256' },
            { name: 'lzTokenFee', type: 'uint256' },
          ]},
        ],
      },
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'amountSentLD', type: 'uint256' },
          { name: 'amountReceivedLD', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'quoteSend',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      {
        name: '_sendParam',
        type: 'tuple',
        components: [
          { name: 'dstEid', type: 'uint32' },
          { name: 'to', type: 'bytes32' },
          { name: 'amountLD', type: 'uint256' },
          { name: 'minAmountLD', type: 'uint256' },
          { name: 'extraOptions', type: 'bytes' },
          { name: 'composeMsg', type: 'bytes' },
          { name: 'oftCmd', type: 'bytes' },
        ],
      },
      { name: '_payInLzToken', type: 'bool' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'nativeFee', type: 'uint256' },
          { name: 'lzTokenFee', type: 'uint256' },
        ],
      },
    ],
  },
] as const;

// In-memory bridge receipt store
const bridgeStore = new Map<string, BridgeReceipt>();

export class CrossChainBridgeService {
  private static instance: CrossChainBridgeService | null = null;

  private constructor() {}

  static getInstance(): CrossChainBridgeService {
    if (!CrossChainBridgeService.instance) {
      CrossChainBridgeService.instance = new CrossChainBridgeService();
    }
    return CrossChainBridgeService.instance;
  }

  /**
   * Initiate a cross-chain $LUCID transfer via LayerZero OFT.
   */
  async bridgeTokens(params: BridgeParams): Promise<BridgeReceipt> {
    const sourceConfig = CHAIN_CONFIGS[params.sourceChainId];
    if (!sourceConfig) {
      throw new Error(`Unknown source chain: ${params.sourceChainId}`);
    }
    if (!sourceConfig.lucidTokenAddress) {
      throw new Error(`No $LUCID OFT address configured for chain: ${params.sourceChainId}`);
    }

    const destLzId = LZ_CHAIN_IDS[params.destChainId];
    if (!destLzId) {
      throw new Error(`No LayerZero endpoint ID for chain: ${params.destChainId}`);
    }

    const adapter = await blockchainAdapterFactory.getAdapter(params.sourceChainId);

    // Encode recipient as bytes32 (left-padded for EVM, raw for Solana)
    const recipientBytes32 = this.addressToBytes32(params.recipientAddress);

    const amountBigInt = BigInt(params.amount);
    const minAmount = (amountBigInt * 99n) / 100n; // 1% slippage tolerance

    const sendParam = {
      dstEid: destLzId,
      to: recipientBytes32 as `0x${string}`,
      amountLD: amountBigInt,
      minAmountLD: minAmount,
      extraOptions: '0x' as `0x${string}`,   // no extra options
      composeMsg: '0x' as `0x${string}`,      // no compose message
      oftCmd: '0x' as `0x${string}`,          // no OFT command
    };

    // Get a quote for the messaging fee from the OFT contract
    const quote = await this.quoteSendOnChain(
      params.sourceChainId,
      sourceConfig.lucidTokenAddress,
      sendParam,
    );

    // Resolve refund address (sender)
    const account = await adapter.getAccount();
    const refundAddress = account.address as `0x${string}`;

    // ABI-encode the send() call with proper struct encoding
    const calldata = encodeFunctionData({
      abi: OFT_SEND_ABI,
      functionName: 'send',
      args: [
        sendParam,
        { nativeFee: quote.nativeFee, lzTokenFee: 0n },
        refundAddress,
      ],
    });

    const txReceipt = await adapter.sendTransaction({
      to: sourceConfig.lucidTokenAddress,
      data: calldata,
      value: quote.nativeFee.toString(), // Pay LayerZero native fee
    });

    const receipt: BridgeReceipt = {
      txHash: txReceipt.hash,
      sourceChainId: params.sourceChainId,
      destChainId: params.destChainId,
      amount: params.amount,
      recipientAddress: params.recipientAddress,
      createdAt: Math.floor(Date.now() / 1000),
    };

    bridgeStore.set(txReceipt.hash, receipt);
    return receipt;
  }

  /**
   * Get bridge transfer status.
   */
  async getBridgeStatus(txHash: string, sourceChainId: string): Promise<BridgeStatus> {
    const receipt = bridgeStore.get(txHash);

    // Check source chain confirmation
    let sourceConfirmed = false;
    try {
      const adapter = await blockchainAdapterFactory.getAdapter(sourceChainId);
      const txStatus = await adapter.getTransactionStatus(txHash);
      sourceConfirmed = txStatus.success;
    } catch {
      // Source chain not available
    }

    return {
      txHash,
      sourceChainId,
      destChainId: receipt?.destChainId || 'unknown',
      status: sourceConfirmed ? 'inflight' : 'pending',
      sourceConfirmed,
      destConfirmed: false, // Would need LayerZero scan API to check
      estimatedDeliveryMs: 120_000, // ~2 minutes typical for LayerZero
    };
  }

  /**
   * Get a bridge quote (estimated fees) by calling quoteSend() on-chain.
   */
  async getQuote(
    sourceChainId: string,
    destChainId: string,
    amount: string,
  ): Promise<BridgeQuote> {
    const destLzId = LZ_CHAIN_IDS[destChainId];
    if (!destLzId) {
      throw new Error(`No LayerZero endpoint ID for chain: ${destChainId}`);
    }

    const sourceConfig = CHAIN_CONFIGS[sourceChainId];
    if (!sourceConfig?.lucidTokenAddress) {
      throw new Error(`No $LUCID OFT address configured for chain: ${sourceChainId}`);
    }

    const amountBigInt = BigInt(amount);
    const minAmount = (amountBigInt * 99n) / 100n;

    const sendParam = {
      dstEid: destLzId,
      to: this.addressToBytes32('0x0000000000000000000000000000000000000000') as `0x${string}`,
      amountLD: amountBigInt,
      minAmountLD: minAmount,
      extraOptions: '0x' as `0x${string}`,
      composeMsg: '0x' as `0x${string}`,
      oftCmd: '0x' as `0x${string}`,
    };

    try {
      const quote = await this.quoteSendOnChain(sourceChainId, sourceConfig.lucidTokenAddress, sendParam);
      return {
        sourceChainId,
        destChainId,
        amount,
        estimatedFee: quote.nativeFee.toString(),
        estimatedDeliveryMs: 120_000,
      };
    } catch {
      // Fallback to estimate if on-chain quote fails
      return {
        sourceChainId,
        destChainId,
        amount,
        estimatedFee: '50000000000000', // ~0.00005 ETH fallback
        estimatedDeliveryMs: 120_000,
      };
    }
  }

  /**
   * Call quoteSend() on the OFT contract to get the exact LayerZero messaging fee.
   */
  private async quoteSendOnChain(
    chainId: string,
    oftAddress: string,
    sendParam: {
      dstEid: number;
      to: `0x${string}`;
      amountLD: bigint;
      minAmountLD: bigint;
      extraOptions: `0x${string}`;
      composeMsg: `0x${string}`;
      oftCmd: `0x${string}`;
    },
  ): Promise<{ nativeFee: bigint; lzTokenFee: bigint }> {
    const { EVMAdapter } = await import('../chain/blockchain/evm/EVMAdapter');
    const adapter = await blockchainAdapterFactory.getAdapter(chainId);

    if (!adapter || !(adapter instanceof EVMAdapter)) {
      throw new Error(`No EVM adapter for chain: ${chainId}`);
    }

    const publicClient = adapter.publicClient;
    if (!publicClient) {
      throw new Error(`No public client for chain: ${chainId}`);
    }

    const result = await publicClient.readContract({
      address: oftAddress as `0x${string}`,
      abi: OFT_SEND_ABI,
      functionName: 'quoteSend',
      args: [sendParam, false],
    });

    return {
      nativeFee: result.nativeFee,
      lzTokenFee: result.lzTokenFee,
    };
  }

  /**
   * Convert an address to bytes32 format (left-padded with zeros, 0x-prefixed).
   */
  private addressToBytes32(address: string): string {
    const clean = address.startsWith('0x') ? address.slice(2) : address;
    return '0x' + clean.padStart(64, '0');
  }
}

export function getCrossChainBridgeService(): CrossChainBridgeService {
  return CrossChainBridgeService.getInstance();
}
