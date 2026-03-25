// metaplex/identity.ts
import type { AssetType, TxReceipt } from '../../../reputation/types';
import type { Passport } from '../../stores/passportStore';
import {
  type ISolanaIdentityRegistry, type RegistryCapabilities, type RegistrationOptions,
  type RegistrationResult, type ExternalIdentity, RegistryCapabilityError,
} from '../ISolanaIdentityRegistry';
import { buildRegistrationDocFromPassport } from '../registration-doc/buildRegistrationDoc';
import type { MetaplexConnection } from './connection';
import { logger } from '../../../shared/lib/logger';

export class MetaplexIdentityRegistry implements ISolanaIdentityRegistry {
  readonly registryName = 'metaplex';
  readonly supportedAssetTypes: AssetType[] = ['agent'];
  readonly capabilities: RegistryCapabilities = { register: true, resolve: true, sync: true, deregister: false };
  private executiveRegistered = false;

  constructor(private connection: MetaplexConnection) {}

  async register(passport: Passport, options?: RegistrationOptions): Promise<RegistrationResult> {
    if (!passport.nft_mint) {
      throw new Error(`Cannot register on Metaplex: passport ${passport.passport_id} has no nft_mint`);
    }

    // Check if already registered when skipIfExists is set
    if (options?.skipIfExists) {
      const existing = await this.resolve(passport.nft_mint);
      if (existing) {
        logger.info(`[Metaplex] Passport ${passport.passport_id} already registered, skipping`);
        return {
          registryName: this.registryName,
          externalId: passport.nft_mint,
          txSignature: '',
          registrationDocUri: existing.registrationDocUri,
        };
      }
    }

    const umi = await this.connection.getUmi();
    const doc = buildRegistrationDocFromPassport(passport, { agentRegistry: 'solana:101:metaplex' });

    const { getAnchorDispatcher } = await import('../../../anchoring');
    const anchorResult = await getAnchorDispatcher().dispatch({
      artifact_type: 'agent_registration', artifact_id: `${passport.passport_id}:registration`,
      agent_passport_id: passport.passport_id, producer: 'MetaplexIdentityRegistry',
      storage_tier: 'permanent', payload: doc,
      tags: { 'Content-Type': 'application/json', 'lucid-registration': 'true' },
    });
    const registrationDocUri = anchorResult?.url ?? '';

    const { registerIdentityV1 } = require('@metaplex-foundation/mpl-agent-registry');
    const { publicKey } = require('@metaplex-foundation/umi');
    const collectionAddress = process.env.METAPLEX_COLLECTION_ADDRESS;
    const identityResult = await registerIdentityV1(umi, {
      asset: publicKey(passport.nft_mint),
      ...(collectionAddress ? { collection: publicKey(collectionAddress) } : {}),
      agentRegistrationUri: registrationDocUri,
    }).sendAndConfirm(umi);
    const txSignature = Buffer.from(identityResult.signature).toString('base64');

    await this.ensureExecutiveRegistered(umi);

    const { delegateExecutionV1, findAgentIdentityV1Pda, findExecutiveProfileV1Pda } = require('@metaplex-foundation/mpl-agent-registry');
    const agentIdentity = findAgentIdentityV1Pda(umi, { asset: publicKey(passport.nft_mint) });
    const executiveProfile = findExecutiveProfileV1Pda(umi, { authority: umi.payer.publicKey });
    await delegateExecutionV1(umi, { agentAsset: publicKey(passport.nft_mint), agentIdentity, executiveProfile }).sendAndConfirm(umi);

    return { registryName: this.registryName, externalId: passport.nft_mint, txSignature, registrationDocUri };
  }

  async resolve(agentId: string): Promise<ExternalIdentity | null> {
    try {
      const umi = await this.connection.getUmi();
      const { findAgentIdentityV1Pda } = require('@metaplex-foundation/mpl-agent-registry');
      const { fetchAssetV1 } = require('@metaplex-foundation/mpl-core');
      const { publicKey } = require('@metaplex-foundation/umi');
      const pda = findAgentIdentityV1Pda(umi, { asset: publicKey(agentId) });
      const account = await umi.rpc.getAccount(pda);
      if (!account.exists) return null;
      const asset = await fetchAssetV1(umi, publicKey(agentId));
      return {
        registryName: this.registryName, externalId: agentId, owner: asset.owner?.toString() ?? '',
        metadata: { type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1', name: asset.name ?? '', description: '' },
        registrationDocUri: asset.uri,
      };
    } catch (err) {
      logger.warn(`[Metaplex] resolve(${agentId}) failed:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  async sync(passport: Passport): Promise<TxReceipt | null> {
    if (!passport.nft_mint) return null;
    try {
      const umi = await this.connection.getUmi();
      const doc = buildRegistrationDocFromPassport(passport, { agentRegistry: 'solana:101:metaplex' });
      const { getAnchorDispatcher } = await import('../../../anchoring');
      const anchorResult = await getAnchorDispatcher().dispatch({
        artifact_type: 'agent_registration', artifact_id: `${passport.passport_id}:registration`,
        agent_passport_id: passport.passport_id, producer: 'MetaplexIdentityRegistry',
        storage_tier: 'permanent', payload: doc,
        tags: { 'Content-Type': 'application/json', 'lucid-registration': 'true' },
      });
      const { updateV1 } = require('@metaplex-foundation/mpl-core');
      const { publicKey } = require('@metaplex-foundation/umi');
      const result = await updateV1(umi, { asset: publicKey(passport.nft_mint), uri: anchorResult?.url ?? '' }).sendAndConfirm(umi);
      return { success: true, txHash: result?.signature ? Buffer.from(result.signature).toString('base64') : '' };
    } catch (err) {
      logger.warn(`[Metaplex] sync(${passport.passport_id}) failed:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  async deregister(_agentId: string): Promise<TxReceipt | null> {
    throw new RegistryCapabilityError(this.registryName, 'deregister');
  }

  async isAvailable(): Promise<boolean> {
    try { await this.connection.getUmi(); return true; } catch { return false; }
  }

  private async ensureExecutiveRegistered(umi: any): Promise<void> {
    if (this.executiveRegistered) return;
    const { registerExecutiveV1, findExecutiveProfileV1Pda } = require('@metaplex-foundation/mpl-agent-registry');
    const profilePda = findExecutiveProfileV1Pda(umi, { authority: umi.payer.publicKey });
    const account = await umi.rpc.getAccount(profilePda);
    if (!account.exists) { await registerExecutiveV1(umi, { payer: umi.payer }).sendAndConfirm(umi); }
    this.executiveRegistered = true;
  }
}
