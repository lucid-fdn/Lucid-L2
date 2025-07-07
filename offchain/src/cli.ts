#!/usr/bin/env ts-node
// offchain/src/cli.ts
import { Command } from 'commander';
import { batchCommit } from './commands/batch';
import { runSingle } from './commands/run';
import { loadStore } from './utils/memoryStore';
import { MEMORY_WALLET_PATH } from './utils/config';
import * as mmrCommands from './commands/mmr';

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

// MMR Commands
program
  .command('mmr:init <agentId> [ipfsCid]')
  .description('Initialize MMR for an agent')
  .action(mmrCommands.initAgent);

program
  .command('mmr:epoch <agentId> <vectors...>')
  .description('Process epoch for an agent with vectors')
  .option('-e, --epoch <number>', 'Epoch number', parseInt)
  .action(async (agentId: string, vectors: string[], options: any) => {
    await mmrCommands.processEpoch(agentId, vectors, options.epoch);
  });

program
  .command('mmr:proof <agentId> <vectorText> <epochNumber>')
  .description('Generate contribution proof for a vector')
  .action(async (agentId: string, vectorText: string, epochNumber: string) => {
    await mmrCommands.generateProof(agentId, vectorText, parseInt(epochNumber));
  });

program
  .command('mmr:stats <agentId>')
  .description('Get MMR statistics for an agent')
  .action(mmrCommands.getAgentStats);

program
  .command('mmr:history <agentId>')
  .description('Get MMR root history for an agent')
  .action(mmrCommands.getAgentHistory);

program
  .command('mmr:list')
  .description('List all registered agents')
  .action(mmrCommands.listAgents);

program
  .command('mmr:verify <agentId>')
  .description('Verify MMR integrity for an agent')
  .action(mmrCommands.verifyAgent);

program
  .command('mmr:ipfs')
  .description('Check IPFS connectivity')
  .action(mmrCommands.checkIPFS);

program
  .command('mmr:demo')
  .description('Run MMR demonstration')
  .action(mmrCommands.runDemo);

program.parse(process.argv);
