#!/usr/bin/env ts-node
// offchain/src/cli.ts
import { Command } from 'commander';
import { batchCommit } from './commands/batch';
import { runSingle } from './commands/run';
import { loadStore } from './utils/memoryStore';
import { MEMORY_WALLET_PATH } from './utils/config';

const program = new Command()
  .name('lucid-cli')
  .version('0.1.0')
  .description('Internal CLI for Lucid L2');

program
  .command('run <text>')
  .description('Mock-infer, burn gas, commit + update wallet')
  .action(async (text: string) => {
    try {
      console.log(`🔍 Running inference on "${text}"…`);
      await runSingle(text);
      console.log('📦 memory-wallet.json updated');
    } catch (err: any) {
      console.error('❌ Error:', err);
      process.exit(1);
    }
  });

program
  .command('batch <texts...>')
  .description('Mock-infer & batch-commit with dual-gas')
  .action(async (texts: string[]) => {
    try {
      console.log(`⛓ Batching ${texts.length} roots…`);
      await batchCommit(texts);
    } catch (err: any) {
      console.error('❌ Batch error:', err);
      process.exit(1);
    }
  });

program
  .command('wallet')
  .description('Show memory-wallet.json')
  .action(async () => {
    try {
      const store = await loadStore();
      console.log(JSON.stringify(store, null, 2));
    } catch (err: any) {
      console.error('❌ Error reading wallet:', err);
      process.exit(1);
    }
  });

program.parse(process.argv);
