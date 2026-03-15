// offchain/packages/engine/src/runtime/index.ts
// Factory for runtime adapters — singleton pattern matching codebase conventions

import { IRuntimeAdapter } from './IRuntimeAdapter';
import { logger } from '../../lib/logger';

export { IRuntimeAdapter, RuntimeArtifact } from './IRuntimeAdapter';

let adapterRegistry: Map<string, IRuntimeAdapter> | null = null;

/**
 * Load and cache all runtime adapters.
 * Uses lazy require() to avoid pulling in unused adapters.
 */
function loadAdapters(): Map<string, IRuntimeAdapter> {
  if (adapterRegistry) return adapterRegistry;
  adapterRegistry = new Map();

  const { VercelAIAdapter } = require('./VercelAIAdapter');
  const { OpenClawAdapter } = require('./OpenClawAdapter');
  const { OpenAIAgentsAdapter } = require('./OpenAIAgentsAdapter');
  const { LangGraphAdapter } = require('./LangGraphAdapter');
  const { CrewAIAdapter } = require('./CrewAIAdapter');
  const { GoogleADKAdapter } = require('./GoogleADKAdapter');
  const { DockerAdapter } = require('./DockerAdapter');

  const instances: IRuntimeAdapter[] = [
    new VercelAIAdapter(),
    new OpenClawAdapter(),
    new OpenAIAgentsAdapter(),
    new LangGraphAdapter(),
    new CrewAIAdapter(),
    new GoogleADKAdapter(),
    new DockerAdapter(),
  ];

  for (const adapter of instances) {
    adapterRegistry.set(adapter.name, adapter);
  }

  logger.info(`[Runtime] Loaded ${adapterRegistry.size} adapters: ${Array.from(adapterRegistry.keys()).join(', ')}`);
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
 * Priority: vercel-ai > openclaw > openai-agents > langgraph > crewai > google-adk > docker
 */
export function selectBestAdapter(descriptor: any, preferred?: string): IRuntimeAdapter {
  const all = loadAdapters();

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

  // Docker always works as fallback
  return all.get('docker')!;
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
