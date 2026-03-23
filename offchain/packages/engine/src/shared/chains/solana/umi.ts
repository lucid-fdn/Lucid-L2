/**
 * Shared Metaplex Umi factory.
 * Used by MetaplexCoreProvider (NFT minting) and MetaplexConnection (agent identity).
 * Avoids duplicating RPC + signer setup across modules.
 */
import { logger } from '../../lib/logger';

export interface CreateUmiOptions {
  /** Additional Umi plugins to apply after base setup (e.g., mplAgentIdentity) */
  plugins?: Array<() => any>;
}

/**
 * Create a Umi instance with mplCore, signer, and optional additional plugins.
 * Reads SOLANA_RPC_URL and LUCID_ORCHESTRATOR_SECRET_KEY from env.
 */
export function createBaseUmi(options?: CreateUmiOptions): any {
  const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
  const { mplCore } = require('@metaplex-foundation/mpl-core');

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const umi = createUmi(rpcUrl).use(mplCore());

  // Apply additional plugins
  if (options?.plugins) {
    for (const plugin of options.plugins) {
      umi.use(plugin());
    }
  }

  // Add signer from env
  const secretKey = process.env.LUCID_ORCHESTRATOR_SECRET_KEY;
  if (secretKey) {
    const { keypairIdentity } = require('@metaplex-foundation/umi');
    const decoded = Buffer.from(secretKey, 'base64');
    umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(decoded)));
  }

  return umi;
}

/**
 * Lazy singleton Umi with error handling.
 * Call reset() to force re-creation (e.g., after RPC config change).
 */
export class LazyUmi {
  private umi: any = null;
  private options: CreateUmiOptions;

  constructor(options?: CreateUmiOptions) {
    this.options = options ?? {};
  }

  async get(): Promise<any> {
    if (this.umi) return this.umi;
    try {
      this.umi = createBaseUmi(this.options);
      return this.umi;
    } catch (err) {
      this.umi = null;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('[Umi] Failed to initialize:', msg);
      throw new Error(`Failed to initialize Metaplex Umi: ${msg}`);
    }
  }

  reset(): void {
    this.umi = null;
  }
}
