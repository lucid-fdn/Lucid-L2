// offchain/packages/engine/src/compute/deploy/types.ts
// Types for image-based deployment (BYOI / base runtime).
// Alternative to RuntimeArtifact (code-gen path).

/**
 * Input for deploying a pre-built Docker image (BYOI or base runtime).
 * Alternative to RuntimeArtifact (code-gen path).
 */
export interface ImageDeployInput {
  /** Docker image reference, e.g. "ghcr.io/myorg/my-agent:latest" */
  image: string;
  /** Environment variables to inject into the container */
  env_vars: Record<string, string>;
  /** Container port (default 3100) */
  port?: number;
  /** Override image's CMD/ENTRYPOINT — only if user explicitly specifies */
  entrypoint?: string[];
  /** Credentials for private registries */
  registry_auth?: {
    username: string;
    password: string;
  };
  /** Verification mode */
  verification: 'full' | 'minimal';
}

/** Type guard: is this an image deploy or a code-gen artifact? */
export function isImageDeploy(input: unknown): input is ImageDeployInput {
  return typeof input === 'object' && input !== null && 'image' in input && typeof (input as any).image === 'string';
}
