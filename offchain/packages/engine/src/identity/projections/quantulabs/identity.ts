import type { AssetType, TxReceipt } from '../../../reputation/types';
import type { Passport } from '../../stores/passportStore';
import {
  type ISolanaIdentityRegistry,
  type RegistryCapabilities,
  type RegistrationOptions,
  type RegistrationResult,
  type ExternalIdentity,
  RegistryCapabilityError,
} from '../ISolanaIdentityRegistry';
import { buildRegistrationDocFromPassport } from '../registration-doc/buildRegistrationDoc';
import type { QuantuLabsConnection } from './connection';

export class QuantuLabsIdentityRegistry implements ISolanaIdentityRegistry {
  readonly registryName = 'quantulabs';
  readonly supportedAssetTypes: AssetType[] = ['agent'];

  constructor(private connection: QuantuLabsConnection) {}

  get capabilities(): RegistryCapabilities {
    const has = this.connection.capabilities.identityRegistration;
    return { register: has, resolve: has, sync: has, deregister: false };
  }

  async register(passport: Passport, _options?: RegistrationOptions): Promise<RegistrationResult> {
    if (!this.capabilities.register) {
      throw new RegistryCapabilityError(this.registryName, 'register');
    }
    const sdk = this.connection.getSDK();
    const doc = buildRegistrationDocFromPassport(passport, { agentRegistry: 'solana:101:quantulabs' });
    const result = await sdk.register(passport.passport_id, doc);
    return {
      registryName: this.registryName,
      externalId: result?.id ?? passport.passport_id,
      txSignature: result?.txHash ?? result?.signature ?? '',
    };
  }

  async resolve(agentId: string): Promise<ExternalIdentity | null> {
    if (!this.capabilities.resolve) {
      throw new RegistryCapabilityError(this.registryName, 'resolve');
    }
    try {
      const sdk = this.connection.getSDK();
      const agent = await sdk.getAgent(agentId);
      if (!agent) return null;
      return {
        registryName: this.registryName,
        externalId: agent.id ?? agentId,
        owner: agent.owner ?? '',
        metadata: {
          type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
          name: agent.name ?? '',
          description: agent.description ?? '',
        },
      };
    } catch {
      return null;
    }
  }

  async sync(passport: Passport): Promise<TxReceipt | null> {
    if (!this.capabilities.sync) {
      throw new RegistryCapabilityError(this.registryName, 'sync');
    }
    try {
      const sdk = this.connection.getSDK();
      const externalId = (passport as any).external_registrations?.quantulabs?.externalId || passport.passport_id;
      const doc = buildRegistrationDocFromPassport(passport, { agentRegistry: 'solana:101:quantulabs' });
      const result = await sdk.updateAgent(externalId, doc);
      return { success: true, txHash: result?.txHash ?? result?.signature };
    } catch {
      return null;
    }
  }

  async deregister(_agentId: string): Promise<TxReceipt | null> {
    throw new RegistryCapabilityError(this.registryName, 'deregister');
  }

  async isAvailable(): Promise<boolean> {
    return this.capabilities.register && !!this.connection.getSDK();
  }
}
