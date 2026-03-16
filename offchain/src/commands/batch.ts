// offchain/src/commands/batch.ts
import { SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { runBatchInference } from '../utils/inference';
import { initSolana, deriveEpochBatchPDA } from '../../packages/engine/src/chain/solana/client';
import { makeComputeIx, makeBurnIx, calculateGasCost } from '../../packages/engine/src/chain/solana/gas';
import { LUCID_MINT, MGAS_PER_ROOT, IGAS_PER_BATCH } from '../../packages/engine/src/shared/config/config';

export async function batchCommit(texts: string[]) {
  const roots = await runBatchInference(texts);
  const program = initSolana();
  const authority = (program.provider as any).wallet.publicKey;
  const [pda] = await deriveEpochBatchPDA(authority, program.programId);

  const computeIx = makeComputeIx();

  const userAta = await getAssociatedTokenAddress(LUCID_MINT, authority);
  // burn iGas
  const igasIx = makeBurnIx('iGas', userAta, LUCID_MINT, authority, IGAS_PER_BATCH);
  // burn mGas for each root
  const totalMgas = BigInt(texts.length * MGAS_PER_ROOT);
  const mgasIx = makeBurnIx('mGas', userAta, LUCID_MINT, authority, totalMgas);

  // Calculate and log gas costs
  const gasCost = calculateGasCost('batch', texts.length);
  console.log(`💰 Batch gas cost: ${gasCost.iGas} iGas + ${gasCost.mGas} mGas = ${gasCost.total} $LUCID`);

  console.log(`⛓ Sending batch of ${texts.length} roots…`);
  
  const sig = await program.methods
    .commitEpochs(roots.map(r => Array.from(r)))
    .accounts({
      epochRecordBatch: pda,
      authority,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([computeIx, igasIx, mgasIx])
    .rpc();

  console.log('✅ Batch tx signature:', sig);
  return sig;
}
