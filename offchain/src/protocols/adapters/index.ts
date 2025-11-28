/**
 * Protocol Adapters - Auto-Registration
 * 
 * This file automatically registers all protocol adapters when imported.
 * Add new protocol imports here to make them available system-wide.
 */

import { protocolRegistry } from '../ProtocolRegistry';
import { HyperliquidAdapter } from './hyperliquid';
import { PrivyAdapter } from './privy';
import { SolanaAdapter } from './solana';

// =============================================================================
// Auto-register all adapters
// =============================================================================

export function registerAllAdapters(): void {
  // Register Hyperliquid
  protocolRegistry.register(new HyperliquidAdapter());

  // Register Privy
  protocolRegistry.register(new PrivyAdapter());

  // Register Solana
  protocolRegistry.register(new SolanaAdapter());

  // Future protocols will be registered here:
  // protocolRegistry.register(new PolymarketAdapter());
  // protocolRegistry.register(new JupiterAdapter());
  // etc.

  console.log(`📦 Registered ${protocolRegistry.count()} protocol adapters`);
}

// Auto-register on import
registerAllAdapters();

// Re-export for convenience
export { HyperliquidAdapter } from './hyperliquid';
export { PrivyAdapter } from './privy';
export { SolanaAdapter } from './solana';
