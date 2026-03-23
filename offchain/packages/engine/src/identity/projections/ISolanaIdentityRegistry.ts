import type { AssetType, TxReceipt } from '../../reputation/types';
import type { Passport } from '../stores/passportStore';
import type { ERC8004RegistrationDoc } from './registration-doc/types';

export interface RegistryCapabilities {
  register: boolean;
  resolve: boolean;
  sync: boolean;
  deregister: boolean;
}

export interface RegistrationOptions {
  skipIfExists?: boolean;
}

export interface RegistrationResult {
  registryName: string;
  externalId: string;
  txSignature: string;
  registrationDocUri?: string;
}

export interface ExternalIdentity {
  registryName: string;
  externalId: string;
  owner: string;
  metadata: ERC8004RegistrationDoc;
  registrationDocUri?: string;
}

export class RegistryCapabilityError extends Error {
  constructor(registryName: string, capability: string) {
    super(`Registry '${registryName}' does not support '${capability}'`);
    this.name = 'RegistryCapabilityError';
  }
}

export interface ISolanaIdentityRegistry {
  readonly registryName: string;
  readonly supportedAssetTypes: AssetType[];
  readonly capabilities: RegistryCapabilities;

  register(passport: Passport, options?: RegistrationOptions): Promise<RegistrationResult>;
  resolve(agentId: string): Promise<ExternalIdentity | null>;
  sync(passport: Passport): Promise<TxReceipt | null>;
  deregister(agentId: string): Promise<TxReceipt | null>;
  isAvailable(): Promise<boolean>;
}
