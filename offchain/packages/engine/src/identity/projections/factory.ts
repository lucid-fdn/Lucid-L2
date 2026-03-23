import type { ISolanaIdentityRegistry } from './ISolanaIdentityRegistry';
import { logger } from '../../shared/lib/logger';

let _registries: ISolanaIdentityRegistry[] | null = null;

export function getIdentityRegistries(): ISolanaIdentityRegistry[] {
  if (_registries) return _registries;
  _registries = [];

  const names = (process.env.IDENTITY_REGISTRIES || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  for (const name of names) {
    try {
      switch (name) {
        case 'metaplex': {
          const { getMetaplexConnection, MetaplexIdentityRegistry } = require('./metaplex');
          _registries.push(new MetaplexIdentityRegistry(getMetaplexConnection()));
          break;
        }
        case 'quantulabs': {
          const { getQuantuLabsConnection, QuantuLabsIdentityRegistry } = require('./quantulabs');
          _registries.push(new QuantuLabsIdentityRegistry(getQuantuLabsConnection()));
          break;
        }
        default:
          logger.warn(`[Identity] Unknown registry: ${name}`);
      }
    } catch (err) {
      logger.warn(`[Identity] Failed to init registry '${name}':`, err instanceof Error ? err.message : err);
    }
  }

  logger.info(`[Identity] Registries: ${_registries.length === 0 ? 'none' : _registries.map(r => r.registryName).join(', ')}`);
  return _registries;
}

export function resetIdentityRegistryFactory(): void {
  _registries = null;
}

/**
 * Recover projections stuck in 'pending' status (e.g., after process crash).
 * Call on server startup after stores are initialized.
 */
export async function recoverPendingProjections(): Promise<void> {
  const registries = getIdentityRegistries();
  if (registries.length === 0) return;

  try {
    const { getPassportStore } = await import('../stores/passportStore');
    const store = getPassportStore();
    const allPassports = await store.list({});
    let recovered = 0;

    for (const passport of allPassports.items) {
      if (!passport.external_registrations) continue;
      const pendingRegistries = Object.entries(passport.external_registrations)
        .filter(([, reg]) => reg.status === 'pending')
        .map(([name]) => name);

      if (pendingRegistries.length > 0) {
        logger.info(`[Identity] Recovering pending projections for ${passport.passport_id}: ${pendingRegistries.join(', ')}`);
        const { syncExternalIdentity } = await import('./jobs/syncExternalIdentity');
        await syncExternalIdentity(passport, 'register');
        recovered++;
      }
    }

    if (recovered > 0) {
      logger.info(`[Identity] Recovered ${recovered} pending projection(s)`);
    }
  } catch (err) {
    logger.warn('[Identity] Pending projection recovery failed:', err instanceof Error ? err.message : err);
  }
}
