/**
 * Paymaster Service
 *
 * Off-chain service for ERC-4337 Paymaster interactions.
 * Agents pay gas in $LUCID instead of ETH.
 */

import type { UserOperation, GasEstimate, PaymasterConfig } from './paymasterTypes';

// LucidPaymaster ABI (minimal)
const PAYMASTER_ABI = [
  {
    name: 'validatePaymasterUserOp',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      {
        name: 'userOp',
        type: 'tuple',
        components: [
          { name: 'sender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'initCode', type: 'bytes' },
          { name: 'callData', type: 'bytes' },
          { name: 'accountGasLimits', type: 'bytes32' },
          { name: 'preVerificationGas', type: 'uint256' },
          { name: 'gasFees', type: 'bytes32' },
          { name: 'paymasterAndData', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
      },
      { name: 'userOpHash', type: 'bytes32' },
      { name: 'maxCost', type: 'uint256' },
    ],
    outputs: [
      { name: 'context', type: 'bytes' },
      { name: 'validationData', type: 'uint256' },
    ],
  },
  {
    name: 'lucidPerEth',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'maxCostLucid',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'estimateLucidCost',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'ethCost', type: 'uint256' }],
    outputs: [{ name: 'lucidCost', type: 'uint256' }],
  },
  {
    name: 'getDeposit',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// EntryPoint v0.7 address (canonical across all EVM chains)
const ENTRY_POINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

export class PaymasterService {
  private static instance: PaymasterService | null = null;

  private constructor() {}

  static getInstance(): PaymasterService {
    if (!PaymasterService.instance) {
      PaymasterService.instance = new PaymasterService();
    }
    return PaymasterService.instance;
  }

  /**
   * Estimate gas cost in $LUCID for a UserOp.
   */
  async estimateGasInLucid(
    chainId: string,
    userOp: UserOperation,
  ): Promise<GasEstimate> {
    const { CHAIN_CONFIGS } = await import('../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config) throw new Error(`Unknown chain: ${chainId}`);
    if (!config.paymaster) throw new Error(`No paymaster on chain: ${chainId}`);

    // For MVP, estimate based on calldata size
    const calldataSize = userOp.callData ? (userOp.callData.length - 2) / 2 : 0;
    const baseGas = 21000n;
    const calldataGas = BigInt(calldataSize) * 16n;
    const estimatedGas = baseGas + calldataGas + 100000n; // Include overhead

    // Use a typical gas price of 1 gwei for estimation
    const gasPrice = 1000000000n; // 1 gwei
    const ethCost = estimatedGas * gasPrice;

    // Convert to $LUCID at default rate (1000 LUCID/ETH)
    const lucidPerEth = 1000n * 10n ** 18n;
    const lucidCost = (ethCost * lucidPerEth) / 10n ** 18n;

    return {
      ethCost: ethCost.toString(),
      lucidCost: lucidCost.toString(),
      exchangeRate: lucidPerEth.toString(),
    };
  }

  /**
   * Sponsor a UserOp by adding paymasterAndData.
   */
  async sponsorUserOp(
    chainId: string,
    userOp: UserOperation,
  ): Promise<{ paymasterAndData: string; estimatedLucidCost: string }> {
    const { CHAIN_CONFIGS } = await import('../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config) throw new Error(`Unknown chain: ${chainId}`);
    if (!config.paymaster) throw new Error(`No paymaster on chain: ${chainId}`);

    const estimate = await this.estimateGasInLucid(chainId, userOp);

    // Construct paymasterAndData: paymaster address (20 bytes) + validation data
    const paymasterAndData = config.paymaster + '00'.repeat(32); // Paymaster address + empty data

    return {
      paymasterAndData,
      estimatedLucidCost: estimate.lucidCost,
    };
  }

  /**
   * Get the current exchange rate from the paymaster contract.
   */
  async getExchangeRate(chainId: string): Promise<string> {
    const { CHAIN_CONFIGS } = await import('../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config?.paymaster) throw new Error(`No paymaster on chain: ${chainId}`);

    // MVP: return default rate
    return (1000n * 10n ** 18n).toString();
  }

  /**
   * Get the paymaster's ETH balance in EntryPoint.
   */
  async getPaymasterBalance(chainId: string): Promise<string> {
    const { CHAIN_CONFIGS } = await import('../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config?.paymaster) throw new Error(`No paymaster on chain: ${chainId}`);

    // MVP: return 0 (would read from EntryPoint)
    return '0';
  }

  /**
   * Get the canonical EntryPoint v0.7 address.
   */
  getEntryPointAddress(): string {
    return ENTRY_POINT_V07;
  }

  /** Get the ABI for external use */
  static getABI() {
    return PAYMASTER_ABI;
  }
}

export function getPaymasterService(): PaymasterService {
  return PaymasterService.getInstance();
}
