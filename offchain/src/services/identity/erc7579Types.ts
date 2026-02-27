/**
 * ERC-7579 Module Types
 *
 * TypeScript types for smart account module management.
 */

export enum ModuleType {
  Validator = 1,
  Executor = 2,
}

export interface ModuleConfig {
  moduleType: ModuleType;
  moduleAddress: string;
  initData?: string;
}

export interface InstalledModule {
  moduleType: ModuleType;
  moduleAddress: string;
  installedAt?: number;
}

export interface PolicyConfig {
  policyHashes: string[];
}

export interface PayoutSplitConfig {
  recipients: string[];
  basisPoints: number[];
}

export interface ReceiptData {
  receiptHash: string;
  policyHash: string;
  modelPassportId: string;
  computePassportId: string;
  tokensIn: number;
  tokensOut: number;
}
