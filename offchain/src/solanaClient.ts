import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';
import { readFileSync } from 'fs';
import path from 'path';

export function initSolana(): anchor.Program {
  // Read wallet from ANCHOR_WALLET env or default
  const walletPath = process.env.ANCHOR_WALLET || path.join(__dirname, '../../anchor-wallet.json');
  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(walletPath, 'utf-8')))
  );

  // Use devnet or localhost
  const network = process.env.SOLANA_NETWORK || 'http://127.0.0.1:8899';
  const connection = new Connection(network, 'confirmed');

  // Create wallet and provider
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  
  anchor.setProvider(provider);

  // Load program ID from Anchor.toml in parent directory
  const anchorTomlPath = path.join(__dirname, '../../../Anchor.toml');
  let programId: PublicKey;
  
  try {
    const tomlContent = readFileSync(anchorTomlPath, 'utf-8');
    // Simple regex to extract program ID (devnet or localnet)
    const match = tomlContent.match(/thought_epoch\s*=\s*"([^"]+)"/);
    if (match && match[1]) {
      programId = new PublicKey(match[1]);
    } else {
      // Fallback to a placeholder - will need to be updated
      throw new Error('Could not find program ID in Anchor.toml');
    }
  } catch (error) {
    console.warn('⚠️  Could not load program ID from Anchor.toml, using placeholder');
    // Use a placeholder program ID - this should be updated with actual deployed program
    programId = new PublicKey('11111111111111111111111111111111');
  }

  // Create a minimal program object (we're not using anchor.workspace)
  return {
    programId,
    provider,
    methods: {} as any,
    account: {} as any,
    rpc: {} as any,
  } as any as anchor.Program;
}

export async function deriveEpochPDA(authority: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddress(
    [Buffer.from('epoch'), authority.toBuffer()],
    programId
  );
}
