// offchain/packages/engine/src/deploy/index.ts
// Factory for deployers — singleton pattern matching codebase conventions

import { IDeployer } from './IDeployer';

export {
  IDeployer,
  DeploymentResult,
  DeploymentStatus,
  DeploymentStatusType,
  DeploymentConfig,
  RuntimeArtifact,
  LogOptions,
} from './IDeployer';
export type { ImageDeployInput } from './types';
export { isImageDeploy } from './types';
import { logger } from '../../shared/lib/logger';

type DeployerTarget = 'docker' | 'railway' | 'akash' | 'phala' | 'ionet' | 'nosana';

let deployers: Map<string, IDeployer> | null = null;

function loadDeployers(): Map<string, IDeployer> {
  if (deployers) return deployers;
  deployers = new Map();

  // Lazy-load all deployer implementations via require()
  const { DockerDeployer } = require('./DockerDeployer');
  const { RailwayDeployer } = require('./RailwayDeployer');
  const { AkashDeployer } = require('./AkashDeployer');
  const { PhalaDeployer } = require('./PhalaDeployer');
  const { IoNetDeployer } = require('./IoNetDeployer');
  const { NosanaDeployer } = require('./NosanaDeployer');

  const instances: IDeployer[] = [
    new DockerDeployer(),
    new RailwayDeployer(),
    new AkashDeployer(),
    new PhalaDeployer(),
    new IoNetDeployer(),
    new NosanaDeployer(),
  ];

  for (const d of instances) {
    deployers.set(d.target, d);
  }

  logger.info(`[Deploy] Loaded ${deployers.size} deployers: ${Array.from(deployers.keys()).join(', ')}`);
  return deployers;
}

/**
 * Get a deployer by target name.
 * env: DEPLOY_TARGET = 'docker' | 'railway' | 'akash' | 'phala' | 'ionet' | 'nosana'
 * Falls back to 'docker' if no target specified.
 */
export function getDeployer(target?: string): IDeployer {
  const resolvedTarget = target || (process.env.DEPLOY_TARGET as DeployerTarget) || 'docker';
  const all = loadDeployers();
  const deployer = all.get(resolvedTarget);
  if (!deployer) {
    throw new Error(`Unknown deployment target: ${resolvedTarget}. Available: ${Array.from(all.keys()).join(', ')}`);
  }
  return deployer;
}

/** Get all registered deployers */
export function getAllDeployers(): IDeployer[] {
  return Array.from(loadDeployers().values());
}

/** List available deployer target names */
export function listDeployerTargets(): string[] {
  return Array.from(loadDeployers().keys());
}

/** Reset singletons (for tests) */
export function resetDeployers(): void {
  deployers = null;
}

// =============================================================================
// Runtime Adapters (merged from compute/runtime/)
// =============================================================================

import { IRuntimeAdapter } from './IRuntimeAdapter';

export { IRuntimeAdapter } from './IRuntimeAdapter';
export type { RuntimeArtifact as RuntimeAdapterArtifact } from './IRuntimeAdapter';

let adapterRegistry: Map<string, IRuntimeAdapter> | null = null;

/**
 * Load and cache all runtime adapters.
 * Uses lazy require() to avoid pulling in unused adapters.
 */
function loadAdapters(): Map<string, IRuntimeAdapter> {
  if (adapterRegistry) return adapterRegistry;
  adapterRegistry = new Map();

  const adapterModules: Array<{ module: string; exportName: string }> = [
    { module: './VercelAIAdapter', exportName: 'VercelAIAdapter' },
    { module: './OpenClawAdapter', exportName: 'OpenClawAdapter' },
    { module: './OpenAIAgentsAdapter', exportName: 'OpenAIAgentsAdapter' },
    { module: './LangGraphAdapter', exportName: 'LangGraphAdapter' },
    { module: './CrewAIAdapter', exportName: 'CrewAIAdapter' },
    { module: './GoogleADKAdapter', exportName: 'GoogleADKAdapter' },
    { module: './DockerAdapter', exportName: 'DockerAdapter' },
  ];

  for (const { module, exportName } of adapterModules) {
    try {
      const mod = require(module);
      const AdapterClass = mod[exportName];
      const instance: IRuntimeAdapter = new AdapterClass();
      adapterRegistry.set(instance.name, instance);
    } catch {
      // Adapter not available (deprecated, moved to examples/)
      logger.debug(`[Runtime] Adapter ${exportName} not available — skipping`);
    }
  }

  if (adapterRegistry.size === 0) {
    logger.warn('[Runtime] No code-gen adapters loaded — adapters moved to examples/. Use lucid launch --image or --runtime base instead.');
  } else {
    logger.info(`[Runtime] Loaded ${adapterRegistry.size} adapters: ${Array.from(adapterRegistry.keys()).join(', ')}`);
  }
  return adapterRegistry;
}

/**
 * Get a specific runtime adapter by name.
 * Throws if the adapter name is unknown.
 */
export function getRuntimeAdapter(name: string): IRuntimeAdapter {
  const all = loadAdapters();
  const adapter = all.get(name);
  if (!adapter) {
    throw new Error(`Unknown runtime adapter: ${name}. Available: ${Array.from(all.keys()).join(', ')}`);
  }
  return adapter;
}

/**
 * Get all registered runtime adapters.
 */
export function getAllRuntimeAdapters(): IRuntimeAdapter[] {
  return Array.from(loadAdapters().values());
}

/**
 * Find the best adapter for a given descriptor.
 * Returns null if no code-gen adapters are loaded (expected after Phase B migration).
 * Priority: vercel-ai > openclaw > openai-agents > langgraph > crewai > google-adk > docker
 */
export function selectBestAdapter(descriptor: any, preferred?: string): IRuntimeAdapter | null {
  const all = loadAdapters();

  if (all.size === 0) {
    logger.warn('[Runtime] No runtime adapters available. Use lucid launch --image or --runtime base instead.');
    return null;
  }

  // If preferred adapter specified and it can handle, use it
  if (preferred) {
    const adapter = all.get(preferred);
    if (adapter && adapter.canHandle(descriptor)) return adapter;
  }

  // Priority order
  const priority = ['vercel-ai', 'openclaw', 'openai-agents', 'langgraph', 'crewai', 'google-adk', 'docker'];
  for (const name of priority) {
    const adapter = all.get(name);
    if (adapter && adapter.canHandle(descriptor)) return adapter;
  }

  // No adapter matched
  return all.get('docker') ?? null;
}

/**
 * List available adapter names.
 */
export function listAdapterNames(): string[] {
  return Array.from(loadAdapters().keys());
}

/** Reset registry (for tests) */
export function resetRuntimeAdapters(): void {
  adapterRegistry = null;
}
