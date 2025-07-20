// offchain/src/commands/run.ts
import { SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { runInference } from '../utils/inference';
import { initSolana, deriveEpochPDA } from '../solana/client';
import { loadStore, saveStore, MemoryStore } from '../utils/memoryStore';
import { makeComputeIx, makeBurnIx, calculateGasCost } from '../solana/gas';
import { LUCID_MINT, IGAS_PER_CALL, MGAS_PER_ROOT } from '../utils/config';

export async function runSingle(text: string) {
  const rootBytes = await runInference(text);
  const hexRoot = Buffer.from(rootBytes).toString('hex');

  const program = initSolana();
  const authority = (program.provider as any).wallet.publicKey;

  // PDA for this user
  const [pda] = await deriveEpochPDA(authority, program.programId);

  // 1) ComputeBudget (iGas) instruction
  const computeIx = makeComputeIx();

  // 2) Burn iGas & mGas from user's $LUCID ATA
  const userAta = await getAssociatedTokenAddress(LUCID_MINT, authority);
  const igasIx = makeBurnIx('iGas', userAta, LUCID_MINT, authority, IGAS_PER_CALL);
  const mgasIx = makeBurnIx('mGas', userAta, LUCID_MINT, authority, MGAS_PER_ROOT);

  // Calculate and log gas costs
  const gasCost = calculateGasCost('single', 1);
  console.log(`💰 Gas cost: ${gasCost.iGas} iGas + ${gasCost.mGas} mGas = ${gasCost.total} $LUCID`);

  // 3) Commit on-chain
  const sig = await program.methods
    .commitEpoch([...rootBytes])
    .accounts({
      epochRecord: pda,
      authority,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([computeIx, igasIx, mgasIx])
    .rpc();

  // 4) Update local memory-wallet
  const store: MemoryStore = await loadStore();
  store[authority.toBase58()] = hexRoot;
  await saveStore(store);

  console.log('✅ Single tx signature:', sig);
  return { txSignature: sig, root: hexRoot, store };
}
