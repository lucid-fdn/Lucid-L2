import express from 'express';
import { runMockInference } from './inference';
import { initSolana, deriveEpochPDA } from './solanaClient';
import { loadStore, saveStore, MemoryStore } from './memoryWallet';
import { SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';

const app = express();
app.use(express.json());

const program = initSolana();

app.post('/run', async (req, res) => {
  try {
    const text      = (req.body.text as string) || 'Hello, Lucid!';
    const rootBytes = runMockInference(text);
    const authority = program.provider.wallet.publicKey;
    const [pda]     = await deriveEpochPDA(authority, program.programId);

    // ← Phase 2a: bump compute budget to 400k CU
    const computeIx = ComputeBudgetProgram.requestUnits({
      units:         400_000,
      additionalFee: 0,
    });

    // commit to chain in one shot
    const txSignature = await program.methods
      .commitEpoch([...rootBytes])
      .accounts({
        epochRecord:   pda,
        authority,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions([computeIx]) // ← compute-budget here
      .rpc();

    // update local memory wallet
    const store: MemoryStore = await loadStore();
    store[authority.toBase58()] = Buffer.from(rootBytes).toString('hex');
    await saveStore(store);

    res.json({
      success:     true,
      txSignature,
      root:        Buffer.from(rootBytes).toString('hex'),
      store,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('🚀 Off-chain service @ http://localhost:3000'));
