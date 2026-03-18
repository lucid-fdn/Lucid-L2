// offchain/packages/engine/src/runtime/index.ts
// Factory for runtime adapters — singleton pattern matching codebase conventions

import { IRuntimeAdapter } from './IRuntimeAdapter';
import { logger } from '../../shared/lib/logger';

export { IRuntimeAdapter, RuntimeArtifact } from './IRuntimeAdapter';

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
