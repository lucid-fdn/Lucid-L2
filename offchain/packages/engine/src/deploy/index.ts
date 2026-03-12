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
import { logger } from '../lib/logger';

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
