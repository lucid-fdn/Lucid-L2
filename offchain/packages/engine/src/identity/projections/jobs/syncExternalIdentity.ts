import type { Passport } from '../../stores/passportStore';
import type { ISolanaIdentityRegistry } from '../ISolanaIdentityRegistry';
import { getIdentityRegistries } from '../factory';
import { logger } from '../../../shared/lib/logger';

const MAX_RETRIES = parseInt(process.env.IDENTITY_PROJECTION_MAX_RETRIES || '3', 10);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt - 1), 30000); // 1s, 2s, 4s... cap 30s
  const jitter = Math.random() * 300;
  return base + jitter;
}

async function projectToRegistry(
  registry: ISolanaIdentityRegistry,
  passport: Passport,
  mode: 'register' | 'sync',
): Promise<void> {
  const { getPassportStore } = await import('../../stores/passportStore');
  const store = getPassportStore();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (mode === 'register') {
        const result = await registry.register(passport, { skipIfExists: true });
        await store.updateExternalRegistration(passport.passport_id, registry.registryName, {
          externalId: result.externalId,
          txSignature: result.txSignature,
          registrationDocUri: result.registrationDocUri,
          registeredAt: Date.now(),
          lastSyncedAt: Date.now(),
          status: 'synced',
          lastError: undefined,
        });
      } else {
        const result = await registry.sync(passport);
        if (result) {
          await store.updateExternalRegistration(passport.passport_id, registry.registryName, {
            lastSyncedAt: Date.now(),
            status: 'synced',
            lastError: undefined,
          });
        }
      }

      logger.info(`[Identity] Projected ${passport.passport_id} to ${registry.registryName} (${mode}, attempt ${attempt})`);
      return;
    } catch (err) {
      logger.warn(`[Identity] ${registry.registryName} ${mode} attempt ${attempt}/${MAX_RETRIES} failed:`, err instanceof Error ? err.message : err);

      if (attempt === MAX_RETRIES) {
        try {
          await store.updateExternalRegistration(passport.passport_id, registry.registryName, {
            lastSyncedAt: Date.now(),
            status: 'failed',
            lastError: err instanceof Error ? err.message : String(err),
          });
        } catch { /* best effort */ }
      } else {
        await sleep(backoffMs(attempt));
      }
    }
  }
}

export async function syncExternalIdentity(passport: Passport, mode: 'register' | 'sync' = 'register'): Promise<void> {
  const registries = getIdentityRegistries();
  if (registries.length === 0) return;

  const capability = mode === 'register' ? 'register' : 'sync';
  const compatible = registries.filter(
    r => r.supportedAssetTypes.includes(passport.type as any) && r.capabilities[capability],
  );

  await Promise.allSettled(
    compatible.map(registry => projectToRegistry(registry, passport, mode)),
  );
}
