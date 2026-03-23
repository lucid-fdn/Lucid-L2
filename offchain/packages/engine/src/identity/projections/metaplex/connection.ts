export class MetaplexConnection {
  private umi: any = null;

  async getUmi(): Promise<any> {
    if (this.umi) return this.umi;
    const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
    const { mplCore } = require('@metaplex-foundation/mpl-core');
    const { mplAgentIdentity } = require('@metaplex-foundation/mpl-agent-registry');
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.umi = createUmi(rpcUrl).use(mplCore()).use(mplAgentIdentity());
    const secretKey = process.env.LUCID_ORCHESTRATOR_SECRET_KEY;
    if (secretKey) {
      const { keypairIdentity } = require('@metaplex-foundation/umi');
      const decoded = Buffer.from(secretKey, 'base64');
      this.umi.use(keypairIdentity(this.umi.eddsa.createKeypairFromSecretKey(decoded)));
    }
    return this.umi;
  }
}

let _conn: MetaplexConnection | null = null;
export function getMetaplexConnection(): MetaplexConnection {
  if (!_conn) _conn = new MetaplexConnection();
  return _conn;
}
export function resetMetaplexConnection(): void { _conn = null; }
