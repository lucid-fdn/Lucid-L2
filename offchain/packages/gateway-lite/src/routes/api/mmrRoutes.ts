import express from 'express';
import { SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { runInference, runBatchInference } from '../../../../../src/utils/inference';
import { initSolana, deriveEpochPDA } from '../../../../engine/src/chain/solana/client';
import { loadStore, saveStore, MemoryStore } from '../../../../../src/utils/memoryStore';
import { makeComputeIx, makeBurnIx, calculateGasCost } from '../../../../engine/src/chain/solana/gas';
import { LUCID_MINT } from '../../../../engine/src/shared/config/config';
import { batchCommit } from '../../../../../src/commands/batch';
import { logger } from '../../../../engine/src/shared/lib/logger';

export const mmrApiRouter = express.Router();

async function handleRun(req: express.Request, res: express.Response) {
  try {
    // Debug: log incoming requests to verify connectivity from the extension
    const body: any = req.body || {};
    const preview = typeof body.text === 'string' ? body.text.slice(0, 80) : body;
    logger.info(`➡️  API POST /run | textPreview="${preview}" wallet="${body.wallet || ''}"`);
    const { text } = req.body as { text: string };
    const rootBytes = await runInference(text);
    const hexRoot = Buffer.from(rootBytes).toString('hex');

    const program = initSolana();
    const wallet = (program.provider as any).wallet;
    const authority = wallet.publicKey;

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
    logger.info(`💰 Gas cost: ${gasCost.iGas} iGas + ${gasCost.mGas} mGas = ${gasCost.total} $LUCID`);

    // 3) Commit on-chain
    // Note: The provider's wallet automatically signs since it's the authority
    // Do NOT add .signers() for the provider's wallet - it causes AccountNotSigner errors
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
    logger.error('Error in handleRun:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleBatch(req: express.Request, res: express.Response) {
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
    const rootsBytes = await runBatchInference(validTexts);
    const roots = rootsBytes.map(rootBytes => Buffer.from(rootBytes).toString('hex'));

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
    logger.error('Error in handleBatch:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

mmrApiRouter.post('/run', handleRun);
mmrApiRouter.post('/batch', handleBatch);
