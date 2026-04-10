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

// Authentication Commands
program.command('login')
  .description('Authenticate with Lucid')
  .option('--token <token>', 'API token (for CI/headless)')
  .action(async (opts) => {
    const { loginCommand } = await import('./cli/auth');
    await loginCommand(opts);
  });

program.command('logout')
  .description('Log out of Lucid or disconnect a provider')
  .option('--provider <name>', 'Disconnect specific provider')
  .action(async (opts) => {
    const { logoutCommand } = await import('./cli/auth');
    await logoutCommand(opts);
  });

program.command('whoami')
  .description('Show current authentication status')
  .action(async () => {
    const { whoamiCommand } = await import('./cli/auth');
    await whoamiCommand();
  });

// Provider Management Commands
const providerCmd = program.command('provider').description('Manage deployment providers');

providerCmd.command('add <provider>')
  .description('Connect a provider (railway, akash, phala, ionet, nosana)')
  .option('--key <key>', 'API key (non-interactive)')
  .option('--token <token>', 'Auth token (non-interactive)')
  .action(async (provider: string, opts: { key?: string; token?: string }) => {
    const { addProviderCommand } = await import('./cli/providers');
    await addProviderCommand(provider, opts);
  });

providerCmd.command('list')
  .description('List connected providers')
  .action(async () => {
    const { listProvidersCommand } = await import('./cli/providers');
    await listProvidersCommand();
  });

providerCmd.command('remove <provider>')
  .description('Remove a provider connection')
  .action(async (provider: string) => {
    const { removeProviderCommand } = await import('./cli/providers');
    await removeProviderCommand(provider);
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
  .option('--path <path>', 'Build from source directory')
  .option('--verification <mode>', 'Verification mode: full or minimal', 'full')
  .option('--mode <mode>', 'Force layer or cloud path (layer|cloud)')
  .option('--agent <slug>', 'Deploy from marketplace catalog')
  .option('--config <file>', 'Config file for agent env vars (.env format)')
  .option('--env <vars...>', 'Environment variables (KEY=VALUE)')
  .action(async (options) => {
    try {
      // Resolve launch path (skip for docker — local, no credentials needed)
      const isDocker = options.target === 'docker' && !options.mode;
      if (!isDocker) {
        const { resolveLaunchPath } = await import('./cli/launch-resolver');
        const resolved = resolveLaunchPath({ mode: options.mode, target: options.target });

        if (resolved.path === 'error') {
          console.error(resolved.error);
          process.exit(1);
        }

        // Print which path was chosen (architect requirement: never be mysterious)
        if (resolved.path === 'cloud') {
          console.log('Using Lucid Cloud (managed deployment)');
          console.error('Lucid Cloud deployment not yet implemented. Use --target <provider> with local credentials.');
          process.exit(1);
        } else if (resolved.path === 'layer') {
          console.log(`Using local ${resolved.provider} account`);
          console.log(`Credential source: ~/.lucid/credentials.json`);

          // Inject provider credential into env for deployer
          const PROVIDER_ENV_MAP: Record<string, string> = {
            railway: 'RAILWAY_API_TOKEN',
            akash: 'AKASH_CONSOLE_API_KEY',
            phala: 'PHALA_CLOUD_API_KEY',
            ionet: 'IONET_API_KEY',
            nosana: 'NOSANA_API_KEY',
          };

          if (resolved.provider && resolved.providerCredential) {
            const envVar = PROVIDER_ENV_MAP[resolved.provider];
            if (envVar) {
              const credValue = resolved.providerCredential.token || resolved.providerCredential.key || '';
              if (credValue) {
                process.env[envVar] = credValue;
              }
            }
            // Use resolved provider as target if not explicitly set via --target
            if (!options.target || options.target === 'docker') {
              options.target = resolved.provider;
            }
          }
        }
      }

      // Path C: Build from source (--path)
      if (options.path) {
        const { buildFromSource, detectSourceType } = await import('../packages/engine/src/compute/control-plane/launch');
        const { checkProviderCompat } = await import('../packages/engine/src/compute/control-plane/launch/provider-compat');
        const { getRegistry } = await import('./cli/credentials');
        const pathMod = await import('path');

        const target = options.target || 'docker';
        const sourceType = detectSourceType(options.path);
        const hasDockerfile = sourceType === 'dockerfile';

        // Check provider compatibility
        const compat = checkProviderCompat(target, 'source', hasDockerfile);
        if (compat.ok === false) {
          console.error(compat.error);
          process.exit(1);
        }

        // For remote targets, require registry
        const registry = target === 'docker' ? undefined : getRegistry()?.url;
        if (target !== 'docker' && !registry) {
          console.error('Registry required for remote targets. Run: lucid registry set ghcr.io/myorg');
          process.exit(1);
        }

        // Create real passport via resolvePassport (never fake IDs)
        const { resolvePassport } = await import('../packages/engine/src/compute/control-plane/launch');
        const owner = options.owner || '0x0000000000000000000000000000000000000000';
        const passportResult = await resolvePassport({
          owner,
          name: options.name || pathMod.basename(options.path),
          target,
        });
        if (passportResult.ok === false) {
          console.error(`Passport creation failed: ${passportResult.error}`);
          process.exit(1);
        }
        const passportId = passportResult.passport_id;
        console.log(`Passport: ${passportId}`);
        console.log(`Building from ${options.path}...`);

        const buildResult = await buildFromSource({
          sourcePath: options.path,
          passportId,
          registryUrl: registry,
        });

        if (!buildResult.success) {
          console.error(`Build failed: ${buildResult.error}`);
          process.exit(1);
        }

        console.log(`Image built: ${buildResult.image}`);

        // Set the image so the existing --image path handles deployment
        options.image = buildResult.image;
      }

      // Path D: Marketplace catalog (--agent <slug>)
      if (options.agent) {
        const catalogUrl = process.env.LUCID_CATALOG_URL || 'https://raw.githubusercontent.com/lucid-fdn/lucid-agents/main/catalog.json';
        const catalogRes = await fetch(catalogUrl);
        if (!catalogRes.ok) { console.error('Failed to fetch agent catalog'); process.exit(1); }
        const catalog = await catalogRes.json() as any;
        const manifest = (catalog.agents || []).find((a: any) => a.name === options.agent);
        if (!manifest) {
          console.error(`Agent "${options.agent}" not found in catalog. Run: lucid marketplace list`);
          process.exit(1);
        }

        console.log(`Deploying ${manifest.display_name} (${manifest.version}) [${manifest.trust_tier || 'community'}]`);
        options.image = manifest.image;
        if (!options.name) options.name = manifest.name;

        // Pass catalog skills to the UI (fetched from API, not Docker)
        if (manifest.skills) {
          (manifest as any)._catalogSkills = manifest.skills;
        }

        // Parse --env flags upfront (needed for both paths)
        const envFlags: Record<string, string> = {};
        if (options.env) {
          for (const e of (Array.isArray(options.env) ? options.env : [options.env])) {
            const eq = (e as string).indexOf('=');
            if (eq > 0) envFlags[(e as string).slice(0, eq)] = (e as string).slice(eq + 1);
          }
        }

        // Use clack UI whenever TTY is available (even with --env flags — they just pre-fill)
        // Only skip clack for: --config file (fully non-interactive) or piped stdin (no TTY)
        const isTTY = process.stdin.isTTY === true;
        const hasConfigFile = !!options.config;
        const useClackUI = isTTY && !hasConfigFile;

        // Initialize catalog env with manifest defaults
        options._catalogEnv = {} as Record<string, string>;
        if (manifest.defaults?.model) options._catalogEnv['LUCID_MODEL'] = manifest.defaults.model;
        if (manifest.defaults?.prompt) options._catalogEnv['LUCID_PROMPT'] = manifest.defaults.prompt;
        if (manifest.defaults?.tools) options._catalogEnv['LUCID_TOOLS'] = Array.isArray(manifest.defaults.tools) ? manifest.defaults.tools.join(',') : manifest.defaults.tools;

        if (useClackUI) {
          // --- Beautiful clack UI (interactive TTY, no --config or --env flags) ---
          const { runLaunchUI, showPreLaunchSummary } = await import('./cli/agent-launch-ui');
          const { getLucidAuth } = await import('./cli/credentials');

          const auth = getLucidAuth();
          const uiResult = await runLaunchUI(manifest, {
            isLoggedIn: !!auth?.token,
            hasProviderUrl: !!process.env.PROVIDER_URL,
            lucidToken: auth?.token,
            prefilled: envFlags, // --env flags pre-fill values, clack skips those prompts
          });

          if (uiResult.cancelled) process.exit(0);

          // Show confirmation
          const confirmed = await showPreLaunchSummary({
            useLucidInference: uiResult.useLucidInference,
            channels: uiResult.channels,
            target: options.target || 'docker',
          });
          if (!confirmed) process.exit(0);

          // Merge UI results into catalog env vars
          Object.assign(options._catalogEnv, uiResult.envVars);

          // Store channels for post-deploy output
          options._channels = uiResult.channels;
        } else {
          // --- Fallback: old readline-based prompts (--config, --env, or non-TTY) ---
          const { resolveAgentEnv, checkLucidInference, promptChannels, printChannelLinks } = await import('./cli/agent-setup');

          // Feature 1: Lucid inference auto-inject
          let effectiveRequired = manifest.required_env || [];
          const inferenceOverrides: Record<string, string> = {};
          const isInteractive = !hasConfigFile && Object.keys(envFlags).length === 0;
          if (isInteractive) {
            const inferenceResult = await checkLucidInference(effectiveRequired);
            effectiveRequired = inferenceResult.filteredRequired;
            Object.assign(inferenceOverrides, inferenceResult.envOverrides);
          }

          const setupResult = await resolveAgentEnv({
            required: effectiveRequired,
            optional: manifest.optional_env || [],
            configFile: options.config,
            envFlags,
            nonInteractive: !isInteractive,
          });
          if (setupResult.ok === false) {
            console.error(setupResult.error);
            process.exit(1);
          }

          // Feature 2: Channel setup (Telegram, Discord, Slack)
          let channelChoices: import('./cli/agent-setup').ChannelChoice[] = [];
          if (isInteractive) {
            const channelResult = await promptChannels(manifest.optional_env || []);
            channelChoices = channelResult.channels;
            Object.assign(inferenceOverrides, channelResult.envOverrides);
          }
          options._channelChoices = channelChoices;

          // Agent setup env vars override defaults
          Object.assign(options._catalogEnv, setupResult.env);
          // Inference and channel overrides
          Object.assign(options._catalogEnv, inferenceOverrides);

          // Store printChannelLinks for post-deploy output
          options._printChannelLinks = printChannelLinks;
        }

        // Store catalog metadata for LaunchSpec
        options._catalogMeta = {
          marketplace_slug: manifest.name,
          marketplace_version: manifest.version,
          trust_tier: manifest.trust_tier || 'community',
          publisher: manifest.publisher,
        };
      }

      const { launchImage, launchBaseRuntime } = await import('../packages/engine/src/compute/control-plane/launch');

      let result;

      if (options.image) {
        // Path A: Bring Your Own Image (also used by --agent after catalog resolution)
        const envVars: Record<string, string> = {
          PROVIDER_URL: process.env.PROVIDER_URL || '',
          PROVIDER_API_KEY: process.env.PROVIDER_API_KEY || '',
          ...(options._catalogEnv || {}),
        };
        result = await launchImage({
          image: options.image,
          target: options.target,
          owner: options.owner ?? 'local',
          name: options.name ?? options.image.split('/').pop()?.split(':')[0] ?? 'agent',
          port: parseInt(options.port, 10),
          verification: options.verification as 'full' | 'minimal',
          env_vars: envVars,
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
        console.error('Error: provide --image <image> (Path A), --runtime base (Path B), --path <dir> (Path C), or --agent <slug> (Path D)');
        process.exit(1);
      }

      if (result.success) {
        if (options._channels) {
          // Clack UI post-launch card
          const { showPostLaunchSuccess } = await import('./cli/agent-launch-ui');
          showPostLaunchSuccess({
            passportId: result.passport_id || '',
            url: result.deployment_url,
            channels: options._channels,
          });
        } else {
          // Non-clack output (--config, --env, non-TTY, or non-agent launches)
          console.log('\nAgent launched:');
          console.log(`  Passport: ${result.passport_id}`);
          console.log(`  Deployment: ${result.deployment_id}`);
          console.log(`  URL: ${result.deployment_url || 'pending'}`);
          console.log(`  Verification: ${result.verification_mode ?? options.verification}`);
          console.log(`  Reputation eligible: ${result.reputation_eligible}`);

          // Print managed channel links (old readline fallback)
          if (options._printChannelLinks && options._channelChoices?.length > 0) {
            options._printChannelLinks(options._channelChoices, result.passport_id);
          }
        }
      } else {
        console.error(`\nLaunch failed: ${result.error}`);
        process.exit(1);
      }
    } catch (err: any) {
      console.error('Launch error:', err.message || err);
      process.exit(1);
    }
  });

// Registry Commands
const registryCmd = program.command('registry').description('Manage Docker image registry');

registryCmd.command('set <url>')
  .description('Set registry for image push (e.g., ghcr.io/myorg)')
  .option('--username <username>', 'Registry username')
  .option('--token <token>', 'Registry token')
  .action(async (url: string, opts: { username?: string; token?: string }) => {
    const { setRegistry } = await import('./cli/credentials');
    setRegistry({ url, username: opts.username, token: opts.token });
    console.log(`Registry set to ${url}`);
  });

registryCmd.command('get')
  .description('Show configured registry')
  .action(async () => {
    const { getRegistry } = await import('./cli/credentials');
    const reg = getRegistry();
    if (reg) {
      console.log(`Registry: ${reg.url}`);
      if (reg.username) console.log(`Username: ${reg.username}`);
    } else {
      console.log('No registry configured. Run: lucid registry set ghcr.io/myorg');
    }
  });

// Marketplace Commands
const marketplaceCmd = program.command('marketplace').description('Browse agent catalog');

marketplaceCmd.command('list')
  .description('List available agents')
  .option('--category <cat>', 'Filter by category')
  .action(async (opts) => {
    try {
      const catalogUrl = process.env.LUCID_CATALOG_URL || 'https://raw.githubusercontent.com/lucid-fdn/lucid-agents/main/catalog.json';
      const res = await fetch(catalogUrl);
      if (!res.ok) { console.error('Failed to fetch catalog'); process.exit(1); }
      const catalog = await res.json() as any;
      console.log('Available agents:\n');
      for (const agent of catalog.agents || []) {
        if (opts.category && !agent.categories?.includes(opts.category)) continue;
        const tier = agent.trust_tier === 'official' ? ' [official]' : agent.trust_tier === 'verified' ? ' [verified]' : '';
        console.log(`  ${agent.name.padEnd(25)} ${agent.display_name} (${agent.version})${tier}`);
      }
    } catch (err: any) {
      console.error('Error fetching catalog:', err.message);
    }
  });

marketplaceCmd.command('search <query>')
  .description('Search agents by name or description')
  .action(async (query) => {
    try {
      const catalogUrl = process.env.LUCID_CATALOG_URL || 'https://raw.githubusercontent.com/lucid-fdn/lucid-agents/main/catalog.json';
      const res = await fetch(catalogUrl);
      const catalog = await res.json() as any;
      const q = query.toLowerCase();
      const matches = (catalog.agents || []).filter((a: any) =>
        a.name?.includes(q) || a.display_name?.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q)
      );
      if (matches.length === 0) { console.log('No agents found'); return; }
      for (const a of matches) {
        const tier = a.trust_tier === 'official' ? ' [official]' : '';
        console.log(`  ${a.name.padEnd(25)} ${a.display_name}${tier} — ${(a.description || '').substring(0, 60)}`);
      }
    } catch (err: any) {
      console.error('Error:', err.message);
    }
  });

// Agent skill management (register as tool passports)
const agentCmd = program.command('agent').description('Manage deployed agents');
const skillsCmd = agentCmd.command('skills').description('Manage agent skills');

skillsCmd.command('register <agent-slug>')
  .description('Register all skills as Lucid tool passports')
  .option('-o, --owner <owner>', 'Owner wallet address')
  .option('--dry-run', 'Show what would be registered without creating passports')
  .action(async (agentSlug, opts) => {
    try {
      const { registerAgentSkills } = await import('./cli/register-skills');
      const { getLucidAuth } = await import('./cli/credentials');
      const auth = getLucidAuth();
      const result = await registerAgentSkills({
        agentSlug,
        owner: opts.owner || '3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3',
        apiKey: auth?.token,
        dryRun: opts.dryRun,
      });
      console.log(`\nDone: ${result.registered} registered, ${result.skipped} skipped, ${result.errors} errors`);
    } catch (err: any) {
      console.error('Error:', err.message);
    }
  });

skillsCmd.command('list <agent-slug>')
  .description('List registered tool passports for an agent')
  .action(async (agentSlug) => {
    try {
      const { listAgentSkillPassports } = await import('./cli/register-skills');
      const { getLucidAuth } = await import('./cli/credentials');
      const auth = getLucidAuth();
      await listAgentSkillPassports({ agentSlug, apiKey: auth?.token });
    } catch (err: any) {
      console.error('Error:', err.message);
    }
  });

// Bridge Commands — moved to @lucid/bridge-cli (separate package)
program.command('bridge')
  .description('[moved] Use: npx lucid-bridge')
  .allowUnknownOption(true)
  .argument('[command]', 'subcommand')
  .action((command) => {
    console.error('\u2717 `lucid bridge` has moved to a standalone CLI.');
    console.error('');
    console.error('  Install:  npm install -D @lucid/bridge-cli');
    console.error('  Usage:    npx lucid-bridge init --name "my-agent"');
    console.error('');
    console.error('  Commands: init, status, list, env');
    process.exit(1);
  });

program.parse(process.argv);
