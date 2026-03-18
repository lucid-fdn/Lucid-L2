// offchain/packages/engine/src/runtime/IRuntimeAdapter.ts
// Runtime adapter interface — translates Universal Agent Descriptors into framework-specific code

/**
 * Result of a runtime adapter code generation.
 * Contains all files, dependencies, and config needed to deploy an agent.
 */
export interface RuntimeArtifact {
  /** Which adapter generated this */
  adapter: string;
  /** Generated files: filename → content */
  files: Map<string, string>;
  /** Main entrypoint file */
  entrypoint: string;
  /** npm/pip dependencies */
  dependencies: Record<string, string>;
  /** Required environment variables */
  env_vars: Record<string, string>;
  /** Optional Dockerfile for containerized deployment */
  dockerfile?: string;
}

/**
 * Runtime Adapter Interface
 *
 * Translates a Universal Agent Descriptor into framework-specific
 * agent definitions. Each adapter targets one runtime (Vercel AI SDK,
 * OpenClaw, OpenAI Agents SDK, LangGraph, CrewAI, Google ADK, Docker).
 *
 * Swappable at runtime via factory + env var, matching existing
 * IDepinStorage / INFTProvider / ITokenLauncher conventions.
 */
export interface IRuntimeAdapter {
  /** Adapter name (e.g., 'vercel-ai', 'openclaw', 'openai-agents') */
  readonly name: string;
  /** Adapter version */
  readonly version: string;
  /** Target language */
  readonly language: 'typescript' | 'python';

  /**
   * Check if this adapter can handle the given descriptor.
   * Some adapters may not support certain features (e.g., multi-agent DAGs).
   */
  canHandle(descriptor: any): boolean;

  /**
   * Generate framework-specific agent code from a Universal Agent Descriptor.
   * Returns files, dependencies, and Dockerfile ready for deployment.
   */
  generate(descriptor: any, passportId: string): Promise<RuntimeArtifact>;
}
