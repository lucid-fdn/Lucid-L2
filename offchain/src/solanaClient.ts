import * as anchor from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';

export function initSolana(): anchor.Program {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);
  return anchor.workspace.ThoughtEpoch as anchor.Program;
}

export async function deriveEpochPDA(authority: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddress(
    [Buffer.from('epoch'), authority.toBuffer()],
    programId
  );
}
