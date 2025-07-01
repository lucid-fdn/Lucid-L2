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
    const text    = (req.body.text as string) || 'Hello, Lucid!';
    const root    = runMockInference(text);
    const authority = program.provider.wallet.publicKey;
    const [pda]     = await deriveEpochPDA(authority, program.programId);

    // ← Add this block to request more compute units:
    const computeIx = ComputeBudgetProgram.requestUnits({
      units:         400_000, // bump up from default 200k
      additionalFee: 0
    });

    // commitEpoch with compute budget pre-instruction
    const tx = await program.methods
      .commitEpoch([...root])
      .accounts({
        epochRecord:   pda,
        authority,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions([computeIx])      // ← inject it here
      .rpc();

    const store: MemoryStore = await loadStore();
    store[authority.toBase58()] = Buffer.from(root).toString('hex');
    await saveStore(store);

    res.json({
      success:     true,
      txSignature: tx,
      root:        Buffer.from(root).toString('hex'),
      store
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('🚀 Off-chain service @ http://localhost:3000'));
