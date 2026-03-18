#!/usr/bin/env ts-node
// offchain/src/cli.ts
import { Command } from 'commander';
import { batchCommit } from './commands/batch';
import { runSingle } from './commands/run';
import { loadStore } from './utils/memoryStore';
import { MEMORY_WALLET_PATH } from '../packages/engine/src/shared/config/config';
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
  .command('mmr:init <agentId> [depinCid]')
  .description('Initialize MMR for an agent (optionally load from DePIN storage CID)')
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
  .command('mmr:storage')
  .description('Check DePIN storage connectivity')
  .action(mmrCommands.checkStorage);

program
  .command('mmr:demo')
  .description('Run MMR demonstration')
  .action(mmrCommands.runDemo);

// Deploy Commands
program
  .command('deploy')
  .description('Deploy an agent to a target infrastructure provider')
  .requiredOption('-n, --name <name>', 'Agent name')
  .requiredOption('-p, --prompt <prompt>', 'System prompt')
  .requiredOption('-m, --model <model>', 'Model passport ID (which LLM the agent uses)')
  .option('-t, --target <target>', 'Deployment target (docker|railway|akash|phala|ionet|nosana)', 'docker')
  .option('-o, --owner <owner>', 'Owner address', 'local')
  .option('--gpu <gpu>', 'GPU type (e.g., rtx-4090, a100)')
  .option('--tools <tools...>', 'Tool passport IDs')
  .option('--adapter <adapter>', 'Preferred runtime adapter')
  .option('--marketplace', 'List on marketplace')
  .option('--share-token <symbol>', 'Auto-launch share token with this symbol')
  .option('--share-supply <supply>', 'Share token total supply', '1000000')
  .action(async (options) => {
    try {
      console.warn('Warning: "lucid deploy" uses the deprecated code-gen path. Use "lucid launch" instead.');
      let buildAgentDescriptor: any;
      try {
        // @ts-expect-error — descriptorBuilder moved to examples/adapters/ (Phase B)
        const mod = await import('../packages/engine/src/compute/control-plane/agent/descriptorBuilder');
        buildAgentDescriptor = mod.buildAgentDescriptor;
      } catch {
        console.error('Error: Code-gen adapters have been moved to examples/. Use "lucid launch --image" or "lucid launch --runtime base" instead.');
        process.exit(1);
      }
      const { getAgentDeploymentService } = await import('../packages/engine/src/compute/control-plane/agent/agentDeploymentService');
      const service = getAgentDeploymentService();

      const descriptor = buildAgentDescriptor(options);

      console.log(`Deploying agent "${options.name}" to ${options.target}...`);
      const result = await service.deployAgent({
        name: options.name,
        owner: options.owner,
        descriptor,
        preferred_adapter: options.adapter,
        list_on_marketplace: options.marketplace,
      });

      if (result.success) {
        console.log('\nDeployment successful:');
        console.log(`  Passport ID: ${result.passport_id}`);
        console.log(`  Deployment ID: ${result.deployment_id}`);
        console.log(`  URL: ${result.deployment_url || 'pending'}`);
        console.log(`  Adapter: ${result.adapter_used}`);
        console.log(`  Target: ${result.target_used}`);
        if (result.wallet_address) console.log(`  Wallet: ${result.wallet_address}`);
      } else {
        console.error(`\nDeployment failed: ${result.error}`);
        process.exit(1);
      }
    } catch (err: any) {
      console.error('Deploy error:', err.message || err);
      process.exit(1);
    }
  });

program
  .command('deploy:status <passportId>')
  .description('Get deployment status for an agent')
  .action(async (passportId: string) => {
    try {
      const { getAgentDeploymentService } = await import('../packages/engine/src/compute/control-plane/agent/agentDeploymentService');
      const service = getAgentDeploymentService();
      const status = await service.getAgentStatus(passportId);
      if (status) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        console.error('No deployment found for', passportId);
        process.exit(1);
      }
    } catch (err: any) {
      console.error('Error:', err.message || err);
      process.exit(1);
    }
  });

program
  .command('deploy:logs <passportId>')
  .description('Get deployment logs for an agent')
  .option('--tail <lines>', 'Number of log lines', '100')
  .action(async (passportId: string, options: any) => {
    try {
      const { getAgentDeploymentService } = await import('../packages/engine/src/compute/control-plane/agent/agentDeploymentService');
      const service = getAgentDeploymentService();
      const logs = await service.getAgentLogs(passportId, parseInt(options.tail));
      console.log(logs);
    } catch (err: any) {
      console.error('Error:', err.message || err);
      process.exit(1);
    }
  });

program
  .command('deploy:list')
  .description('List all agent deployments')
  .option('--status <status>', 'Filter by status')
  .option('--target <target>', 'Filter by target')
  .action(async (options: any) => {
    try {
      const { getAgentDeploymentService } = await import('../packages/engine/src/compute/control-plane/agent/agentDeploymentService');
      const service = getAgentDeploymentService();
      const deployments = await service.listDeployments({
        status: options.status,
        target: options.target,
      });
      if (deployments.length === 0) {
        console.log('No deployments found');
      } else {
        for (const d of deployments) {
          console.log(`${d.agent_passport_id}  ${d.status.padEnd(12)}  ${d.deployment_target.padEnd(10)}  ${d.health_status}`);
        }
      }
    } catch (err: any) {
      console.error('Error:', err.message || err);
      process.exit(1);
    }
  });

program
  .command('deploy:terminate <passportId>')
  .description('Terminate an agent deployment')
  .action(async (passportId: string) => {
    try {
      const { getAgentDeploymentService } = await import('../packages/engine/src/compute/control-plane/agent/agentDeploymentService');
      const service = getAgentDeploymentService();
      const result = await service.terminateAgent(passportId);
      if (result.success) {
        console.log(`Agent ${passportId} terminated successfully`);
      } else {
        console.error(`Termination failed: ${result.error}`);
        process.exit(1);
      }
    } catch (err: any) {
      console.error('Error:', err.message || err);
      process.exit(1);
    }
  });

program
  .command('deploy:targets')
  .description('List available deployment targets')
  .action(async () => {
    try {
      const { listDeployerTargets } = await import('../packages/engine/src/compute/providers');
      const targets = listDeployerTargets();
      console.log('Available deployment targets:');
      for (const t of targets) {
        console.log(`  - ${t}`);
      }
    } catch (err: any) {
      console.error('Error:', err.message || err);
      process.exit(1);
    }
  });

// Launch Commands
program
  .command('launch')
  .description('Launch an agent via image (Path A) or base runtime (Path B)')
  .option('--image <image>', 'Docker image to deploy (BYOI path)')
  .option('--runtime <runtime>', 'Pre-built runtime (e.g., "base")')
  .option('-m, --model <model>', 'Model for base runtime')
  .option('-p, --prompt <prompt>', 'System prompt for base runtime')
  .option('--tools <tools>', 'Comma-separated tool passport IDs')
  .option('-t, --target <target>', 'Deployment target', 'docker')
  .option('-o, --owner <owner>', 'Owner wallet address')
  .option('-n, --name <name>', 'Agent name')
  .option('--port <port>', 'Container port', '3100')
  .option('--verification <mode>', 'Verification mode: full or minimal', 'full')
  .action(async (options) => {
    try {
      const { launchImage, launchBaseRuntime } = await import('../packages/engine/src/compute/control-plane/launch');

      let result;

      if (options.image) {
        // Path A: Bring Your Own Image
        result = await launchImage({
          image: options.image,
          target: options.target,
          owner: options.owner ?? 'local',
          name: options.name ?? options.image.split('/').pop()?.split(':')[0] ?? 'agent',
          port: parseInt(options.port, 10),
          verification: options.verification as 'full' | 'minimal',
          env_vars: {
            PROVIDER_URL: process.env.PROVIDER_URL || '',
            PROVIDER_API_KEY: process.env.PROVIDER_API_KEY || '',
          },
        });
      } else if (options.runtime === 'base') {
        // Path B: Base Runtime
        if (!options.model || !options.prompt) {
          console.error('Error: --runtime base requires --model and --prompt');
          process.exit(1);
        }
        const tools = options.tools ? options.tools.split(',').map((t: string) => t.trim()) : undefined;
        result = await launchBaseRuntime({
          model: options.model,
          prompt: options.prompt,
          target: options.target,
          owner: options.owner ?? 'local',
          name: options.name ?? `base-${options.model}`,
          tools,
        });
      } else {
        console.error('Error: provide --image <image> (Path A) or --runtime base (Path B)');
        process.exit(1);
      }

      if (result.success) {
        console.log('\nAgent launched:');
        console.log(`  Passport: ${result.passport_id}`);
        console.log(`  Deployment: ${result.deployment_id}`);
        console.log(`  URL: ${result.deployment_url || 'pending'}`);
        console.log(`  Verification: ${result.verification_mode ?? options.verification}`);
        console.log(`  Reputation eligible: ${result.reputation_eligible}`);
      } else {
        console.error(`\nLaunch failed: ${result.error}`);
        process.exit(1);
      }
    } catch (err: any) {
      console.error('Launch error:', err.message || err);
      process.exit(1);
    }
  });

program.parse(process.argv);
