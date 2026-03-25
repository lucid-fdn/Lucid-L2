import { LazyUmi } from '../../../shared/chains/solana/umi';

export class MetaplexConnection {
  private lazyUmi = new LazyUmi({
    // METAPLEX_RPC_URL allows Metaplex identity to run on mainnet
    // while the rest of Lucid (passports, epochs) stays on devnet
    rpcUrl: process.env.METAPLEX_RPC_URL,
    plugins: [() => {
      const { mplAgentIdentity } = require('@metaplex-foundation/mpl-agent-registry');
      return mplAgentIdentity();
    }],
  });

  async getUmi(): Promise<any> {
    return this.lazyUmi.get();
  }
}

let _conn: MetaplexConnection | null = null;
export function getMetaplexConnection(): MetaplexConnection {
  if (!_conn) _conn = new MetaplexConnection();
  return _conn;
}
export function resetMetaplexConnection(): void { _conn = null; }
