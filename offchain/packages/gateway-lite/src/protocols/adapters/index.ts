/**
 * Protocol Adapters - Auto-Registration
 * 
 * This file automatically registers all protocol adapters when imported.
 * Add new protocol imports here to make them available system-wide.
 */

import { protocolRegistry } from '../ProtocolRegistry';
import { HyperliquidAdapter } from '../../../../contrib/protocols/hyperliquid';
import { PrivyAdapter } from '../../../../contrib/protocols/privy';
import { SolanaProtocolAdapter } from './solana';
import { logger } from '../../../../engine/src/lib/logger';

// =============================================================================
// Auto-register all adapters
// =============================================================================

export function registerAllAdapters(): void {
  // Register Hyperliquid
  protocolRegistry.register(new HyperliquidAdapter());

  // Register Privy
  protocolRegistry.register(new PrivyAdapter());

  // Register Solana
  protocolRegistry.register(new SolanaProtocolAdapter());

  // Future protocols will be registered here:
  // protocolRegistry.register(new PolymarketAdapter());
  // protocolRegistry.register(new JupiterAdapter());
  // etc.

  logger.info(`📦 Registered ${protocolRegistry.count()} protocol adapters`);
}

// Auto-register on import
registerAllAdapters();

// Re-export for convenience
export { HyperliquidAdapter } from '../../../../contrib/protocols/hyperliquid';
export { PrivyAdapter } from '../../../../contrib/protocols/privy';
export { SolanaProtocolAdapter, SolanaAdapter } from './solana';
