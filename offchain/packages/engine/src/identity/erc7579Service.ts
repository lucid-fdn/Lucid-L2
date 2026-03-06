/**
 * ERC-7579 Module Service
 *
 * Off-chain service for managing installable smart account modules.
 * Supports Policy, Payout, and Receipt modules.
 */

import { encodeFunctionData, encodeAbiParameters } from 'viem';
import type {
  ModuleType,
  InstalledModule,
  PolicyConfig,
  PayoutSplitConfig,
  ReceiptData,
} from './erc7579Types';
import { ModuleType as ModuleTypeEnum } from './erc7579Types';

// Policy Module ABI
const POLICY_MODULE_ABI = [
  {
    name: 'onInstall',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'data', type: 'bytes' }],
    outputs: [],
  },
  {
    name: 'onUninstall',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'data', type: 'bytes' }],
    outputs: [],
  },
  {
    name: 'setPolicy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'policyHash', type: 'bytes32' },
      { name: 'allowed', type: 'bool' },
    ],
    outputs: [],
  },
  {
    name: 'isPolicyAllowed',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'policyHash', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// Payout Module ABI
const PAYOUT_MODULE_ABI = [
  {
    name: 'onInstall',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'data', type: 'bytes' }],
    outputs: [],
  },
  {
    name: 'setSplit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipients', type: 'address[]' },
      { name: 'basisPoints', type: 'uint256[]' },
    ],
    outputs: [],
  },
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'getSplit',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [
      { name: 'recipients', type: 'address[]' },
      { name: 'basisPoints', type: 'uint256[]' },
    ],
  },
] as const;

// Receipt Module ABI
const RECEIPT_MODULE_ABI = [
  {
    name: 'emitReceipt',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'receiptData', type: 'bytes' }],
    outputs: [],
  },
  {
    name: 'ReceiptEmitted',
    type: 'event',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'receiptHash', type: 'bytes32', indexed: true },
      { name: 'policyHash', type: 'bytes32', indexed: false },
      { name: 'modelPassportId', type: 'string', indexed: false },
      { name: 'computePassportId', type: 'string', indexed: false },
      { name: 'tokensIn', type: 'uint256', indexed: false },
      { name: 'tokensOut', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const;

/** Encode a call against one of the module ABIs. */
function encodeModuleCall(abi: readonly any[], funcName: string, args: unknown[]): `0x${string}` {
  const func = abi.find((f: any) => f.name === funcName && f.type === 'function');
  if (!func) throw new Error(`Unknown module function: ${funcName}`);
  return encodeFunctionData({ abi: [func], functionName: funcName, args });
}

/** Select the correct ABI for a given module type. */
function abiForModuleType(moduleType: ModuleType): readonly any[] {
  switch (moduleType) {
    case ModuleTypeEnum.Validator:
      return POLICY_MODULE_ABI;
    case ModuleTypeEnum.Executor:
      return PAYOUT_MODULE_ABI;
    default:
      throw new Error(`No ABI mapping for module type: ${moduleType}`);
  }
}

export class ERC7579Service {
  private static instance: ERC7579Service | null = null;

  // In-memory module tracking
  private installedModules = new Map<string, InstalledModule[]>();

  private constructor() {}

  static getInstance(): ERC7579Service {
    if (!ERC7579Service.instance) {
      ERC7579Service.instance = new ERC7579Service();
    }
    return ERC7579Service.instance;
  }

  /**
   * Install a module on a smart account.
   */
  async installModule(
    chainId: string,
    accountAddress: string,
    moduleType: ModuleType,
    moduleAddress: string,
    initData?: string,
  ): Promise<{ txHash: string }> {
    const { blockchainAdapterFactory } = await import('../chain/blockchain/BlockchainAdapterFactory');
    const { CHAIN_CONFIGS } = await import('../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config) throw new Error(`Unknown chain: ${chainId}`);

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) throw new Error(`No adapter for chain: ${chainId}`);

    const txReceipt = await adapter.sendTransaction({
      to: accountAddress,
      data: encodeModuleCall(abiForModuleType(moduleType), 'onInstall', [initData ?? '0x']),
    });

    // Track locally
    const key = `${chainId}:${accountAddress}`;
    const modules = this.installedModules.get(key) || [];
    modules.push({
      moduleType,
      moduleAddress,
      installedAt: Math.floor(Date.now() / 1000),
    });
    this.installedModules.set(key, modules);

    return { txHash: txReceipt.hash };
  }

  /**
   * Uninstall a module from a smart account.
   */
  async uninstallModule(
    chainId: string,
    accountAddress: string,
    moduleType: ModuleType,
    moduleAddress: string,
  ): Promise<{ txHash: string }> {
    const { blockchainAdapterFactory } = await import('../chain/blockchain/BlockchainAdapterFactory');
    const { CHAIN_CONFIGS } = await import('../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config) throw new Error(`Unknown chain: ${chainId}`);

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) throw new Error(`No adapter for chain: ${chainId}`);

    const txReceipt = await adapter.sendTransaction({
      to: accountAddress,
      data: encodeModuleCall(POLICY_MODULE_ABI, 'onUninstall', ['0x']),
    });

    // Remove from local tracking
    const key = `${chainId}:${accountAddress}`;
    const modules = this.installedModules.get(key) || [];
    this.installedModules.set(
      key,
      modules.filter((m) => m.moduleAddress !== moduleAddress || m.moduleType !== moduleType),
    );

    return { txHash: txReceipt.hash };
  }

  /**
   * Configure the policy module with allowed policy hashes.
   */
  async configurePolicyModule(
    chainId: string,
    accountAddress: string,
    policyHashes: string[],
  ): Promise<{ txHash: string }> {
    const { blockchainAdapterFactory } = await import('../chain/blockchain/BlockchainAdapterFactory');
    const { CHAIN_CONFIGS } = await import('../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config) throw new Error(`Unknown chain: ${chainId}`);
    if (!config.modules?.policy) throw new Error(`No policy module on chain: ${chainId}`);

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) throw new Error(`No adapter for chain: ${chainId}`);

    const txReceipt = await adapter.sendTransaction({
      to: config.modules.policy,
      data: encodeModuleCall(POLICY_MODULE_ABI, 'setPolicy', [policyHashes[0], true]),
    });

    return { txHash: txReceipt.hash };
  }

  /**
   * Configure the payout module with split recipients.
   */
  async configurePayoutModule(
    chainId: string,
    accountAddress: string,
    recipients: string[],
    basisPoints: number[],
  ): Promise<{ txHash: string }> {
    const { blockchainAdapterFactory } = await import('../chain/blockchain/BlockchainAdapterFactory');
    const { CHAIN_CONFIGS } = await import('../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config) throw new Error(`Unknown chain: ${chainId}`);
    if (!config.modules?.payout) throw new Error(`No payout module on chain: ${chainId}`);

    // Validate basis points sum to 10000
    const total = basisPoints.reduce((a, b) => a + b, 0);
    if (total !== 10000) {
      throw new Error(`Basis points must sum to 10000, got ${total}`);
    }

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) throw new Error(`No adapter for chain: ${chainId}`);

    const txReceipt = await adapter.sendTransaction({
      to: config.modules.payout,
      data: encodeModuleCall(PAYOUT_MODULE_ABI, 'setSplit', [recipients, basisPoints.map(BigInt)]),
    });

    return { txHash: txReceipt.hash };
  }

  /**
   * Emit a receipt via the receipt module.
   */
  async emitReceipt(
    chainId: string,
    accountAddress: string,
    receiptData: ReceiptData,
  ): Promise<{ txHash: string }> {
    const { blockchainAdapterFactory } = await import('../chain/blockchain/BlockchainAdapterFactory');
    const { CHAIN_CONFIGS } = await import('../chain/blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config) throw new Error(`Unknown chain: ${chainId}`);
    if (!config.modules?.receipt) throw new Error(`No receipt module on chain: ${chainId}`);

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) throw new Error(`No adapter for chain: ${chainId}`);

    const txReceipt = await adapter.sendTransaction({
      to: config.modules.receipt,
      data: encodeModuleCall(RECEIPT_MODULE_ABI, 'emitReceipt', [
        encodeAbiParameters(
          [
            { name: 'receiptHash', type: 'bytes32' },
            { name: 'policyHash', type: 'bytes32' },
            { name: 'modelPassportId', type: 'string' },
            { name: 'computePassportId', type: 'string' },
            { name: 'tokensIn', type: 'uint256' },
            { name: 'tokensOut', type: 'uint256' },
          ],
          [
            receiptData.receiptHash as `0x${string}`,
            receiptData.policyHash as `0x${string}`,
            receiptData.modelPassportId,
            receiptData.computePassportId,
            BigInt(receiptData.tokensIn),
            BigInt(receiptData.tokensOut),
          ],
        ),
      ]),
    });

    return { txHash: txReceipt.hash };
  }

  /**
   * List installed modules for an account.
   */
  listInstalledModules(chainId: string, accountAddress: string): InstalledModule[] {
    const key = `${chainId}:${accountAddress}`;
    return this.installedModules.get(key) || [];
  }

  /** Get ABIs for external use */
  static getABIs() {
    return {
      policy: POLICY_MODULE_ABI,
      payout: PAYOUT_MODULE_ABI,
      receipt: RECEIPT_MODULE_ABI,
    };
  }
}

export function getERC7579Service(): ERC7579Service {
  return ERC7579Service.getInstance();
}
