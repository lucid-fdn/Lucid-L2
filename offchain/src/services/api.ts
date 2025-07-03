// offchain/src/services/api.ts
import express from 'express';
import { SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { runMockInference } from '../utils/inference';
import { initSolana, deriveEpochPDA } from '../solana/client';
import { loadStore, saveStore, MemoryStore } from '../utils/memoryStore';
import { makeComputeIx, makeBurnIx, calculateGasCost } from '../solana/gas';
import { LUCID_MINT, MGAS_PER_ROOT, IGAS_PER_BATCH } from '../utils/config';
import { batchCommit } from '../commands/batch';

export async function handleRun(req: express.Request, res: express.Response) {
  try {
    const { text } = req.body as { text: string };
    const rootBytes = runMockInference(text);
    const hexRoot = Buffer.from(rootBytes).toString('hex');

    const program = initSolana();
    const authority = (program.provider as any).wallet.publicKey;

    // PDA for this user
    const [pda] = await deriveEpochPDA(authority, program.programId);

    // 1) ComputeBudget (iGas) instruction
    const computeIx = makeComputeIx();

    // 2) Burn iGas & mGas from user's $LUCID ATA
    const userAta = await getAssociatedTokenAddress(LUCID_MINT, authority);
    const igasIx = makeBurnIx('iGas', userAta, LUCID_MINT, authority, 1);
    const mgasIx = makeBurnIx('mGas', userAta, LUCID_MINT, authority, 5);

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

    res.json({ success: true, txSignature: sig, root: hexRoot, store });
  } catch (error) {
    console.error('Error in handleRun:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

export async function handleBatch(req: express.Request, res: express.Response) {
  try {
    const { texts } = req.body as { texts: string[] };
    
    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid input: texts array is required' 
      });
    }

    const validTexts = texts.filter(t => t && t.trim());
    if (validTexts.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No valid texts provided' 
      });
    }

    // Use the existing batchCommit function
    const sig = await batchCommit(validTexts);
    
    // Calculate gas costs for response
    const gasCost = calculateGasCost('batch', validTexts.length);
    
    // Generate roots for response (same logic as batchCommit)
    const roots = validTexts.map(t => {
      const rootBytes = runMockInference(t);
      return Buffer.from(rootBytes).toString('hex');
    });

    res.json({ 
      success: true, 
      txSignature: sig, 
      roots,
      texts: validTexts,
      gasCost,
      savings: validTexts.length > 1 ? {
        individual: validTexts.length * 6,
        batch: gasCost.total,
        saved: (validTexts.length * 6) - gasCost.total,
        percentage: (((validTexts.length * 6) - gasCost.total) / (validTexts.length * 6) * 100).toFixed(1)
      } : null
    });
  } catch (error) {
    console.error('Error in handleBatch:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

export function createApiRouter(): express.Router {
  const router = express.Router();
  router.post('/run', handleRun);
  router.post('/batch', handleBatch);
  return router;
}
