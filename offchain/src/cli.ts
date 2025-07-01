#!/usr/bin/env ts-node

import { Command } from 'commander';
import { runMockInference } from './inference';
import { initSolana, deriveEpochPDA } from './solanaClient';
import { loadStore, saveStore, MemoryStore } from './memoryWallet';
import { SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';

const program = new Command()
  .name('lucid-cli')
  .description('Internal CLI for Lucid L2 Phase 1/2')
  .version('0.1.0');

program
  .command('run <text>')
  .description('Mock-infer, commit Thought Epoch, update wallet')
  .action(async (text: string) => {
    try {
      console.log(`🔍 Running inference on: "${text}"`);
      const rootBytes = runMockInference(text);
      const hexRoot   = Buffer.from(rootBytes).toString('hex');
      console.log(`✅ Inference root: ${hexRoot}`);

      const anchorProg = initSolana();
      const authority  = anchorProg.provider.wallet.publicKey;
      const [pda]      = await deriveEpochPDA(authority, anchorProg.programId);

      // Phase 2a: bump compute budget
      const computeIx = ComputeBudgetProgram.requestUnits({
        units:         400_000,
        additionalFee: 0,
      });

      console.log(`⛓ Committing to chain…`);
      const sig = await anchorProg.methods
        .commitEpoch([...rootBytes])
        .accounts({
          epochRecord:   pda,
          authority,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions([computeIx])
        .rpc();

      console.log(`✅ Transaction signature: ${sig}`);

      const store: MemoryStore = await loadStore();
      store[authority.toBase58()] = hexRoot;
      await saveStore(store);
      console.log('📦 memory-wallet.json updated.');
    } catch (err: any) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

program
  .command('wallet')
  .description('Show current memory-wallet.json')
  .action(() => {
    const store = require('../memory-wallet.json');
    console.log('🗄 memory-wallet.json contents:\n', JSON.stringify(store, null, 2));
  });

program.parse(process.argv);
