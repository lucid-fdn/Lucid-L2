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
