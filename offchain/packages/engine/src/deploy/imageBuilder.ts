// offchain/packages/engine/src/deploy/imageBuilder.ts
// Image build pipeline — builds Docker images from RuntimeArtifact and pushes to a container registry.
// This is the critical bridge between code generation and deployers (Railway, Akash, Phala, io.net, etc.).

import { RuntimeArtifact } from './IDeployer';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Reference to a built container image in a registry.
 */
export interface ImageRef {
  /** Registry host (e.g. 'ghcr.io') */
  registry: string;
  /** Repository path (e.g. 'raijinlabs/lucid-agents/agnt_abc123') */
  repository: string;
  /** Image tag (e.g. 'v1' or 'latest') */
  tag: string;
  /** Content-addressable digest for immutability (e.g. 'sha256:...') */
  digest?: string;
  /** Fully qualified image reference (e.g. 'ghcr.io/raijinlabs/lucid-agents/agnt_abc123:v1') */
  fullRef: string;
}

/**
 * Builds a Docker image from a RuntimeArtifact and pushes it to a registry.
 */
export interface ImageBuilder {
  build(artifact: RuntimeArtifact, passportId: string, tag?: string): Promise<ImageRef>;
}

// ---------------------------------------------------------------------------
// Dockerfile generation
// ---------------------------------------------------------------------------

/**
 * Generate a production Dockerfile from a RuntimeArtifact.
 *
 * Strategy:
 *   - node:20-slim base (small footprint, glibc for native modules)
 *   - Non-root user for security
 *   - Copy package.json first for layer caching, then npm install --production
 *   - Copy remaining artifact files
 *   - EXPOSE 3100 (standard agent port)
 *   - HEALTHCHECK via curl
 *   - CMD node <entrypoint>
 */
export function generateDockerfile(artifact: RuntimeArtifact): string {
  const deps = artifact.dependencies;
  const hasDeps = Object.keys(deps).length > 0;

  const lines: string[] = [
    'FROM node:20-slim',
    '',
    '# Install curl for healthcheck',
    'RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*',
    '',
    '# Create non-root user',
    'RUN groupadd -r agent && useradd -r -g agent -m agent',
    '',
    'WORKDIR /app',
    '',
  ];

  if (hasDeps) {
    lines.push(
      '# Copy package.json and install dependencies (layer cached)',
      'COPY package.json .',
      'RUN npm install --production --ignore-scripts && npm cache clean --force',
      '',
    );
  }

  lines.push(
    '# Copy application files',
    'COPY . .',
    '',
    '# Switch to non-root user',
    'USER agent',
    '',
    'EXPOSE 3100',
    '',
    'HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\',
    '  CMD curl -f http://localhost:3100/health || exit 1',
    '',
    `CMD ["node", "${artifact.entrypoint}"]`,
    '',
  );

  return lines.join('\n');
}

/**
 * Build a package.json string from artifact dependencies.
 * Exported so the builder can write it into the temp directory.
 */
export function generatePackageJson(artifact: RuntimeArtifact): string {
  return JSON.stringify(
    {
      name: 'lucid-agent',
      version: '1.0.0',
      private: true,
      dependencies: artifact.dependencies,
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// LocalDockerBuilder
// ---------------------------------------------------------------------------

const DEFAULT_REGISTRY = 'ghcr.io/raijinlabs/lucid-agents';

/**
 * Builds Docker images locally using the `docker` CLI, then pushes to a registry.
 *
 * Requirements:
 *   - `docker` CLI installed and in PATH
 *   - Authenticated to the target registry (`docker login`)
 *
 * Security: Uses execFileSync (not execSync/exec) to avoid shell injection.
 * Passport IDs are additionally sanitized via sanitizeImageName().
 */
export class LocalDockerBuilder implements ImageBuilder {
  private readonly registry: string;

  constructor(registry?: string) {
    this.registry = registry || process.env.IMAGE_REGISTRY || DEFAULT_REGISTRY;
  }

  async build(artifact: RuntimeArtifact, passportId: string, tag?: string): Promise<ImageRef> {
    // Validate docker is available
    this.assertDockerInstalled();

    const resolvedTag = tag || 'latest';
    const sanitizedId = sanitizeImageName(passportId);
    const repository = `${this.registry}/${sanitizedId}`;
    const fullRef = `${repository}:${resolvedTag}`;

    // Create temp build context
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-agent-build-'));

    try {
      // Write artifact files to temp directory
      this.writeArtifactFiles(artifact, tmpDir);

      // Write Dockerfile (use artifact's if provided, otherwise generate)
      const dockerfile = artifact.dockerfile || generateDockerfile(artifact);
      fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), dockerfile, 'utf-8');

      // Write package.json for npm install layer
      if (!artifact.files.has('package.json')) {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          generatePackageJson(artifact),
          'utf-8',
        );
      }

      // Write .dockerignore
      fs.writeFileSync(
        path.join(tmpDir, '.dockerignore'),
        ['node_modules', '.git', '.env', '*.log'].join('\n'),
        'utf-8',
      );

      // Build image
      logger.info(`[ImageBuilder] Building image: ${fullRef}`);
      try {
        execFileSync('docker', ['build', '-t', fullRef, '.'], {
          cwd: tmpDir,
          stdio: 'pipe',
          timeout: 300_000, // 5 min build timeout
        });
      } catch (err) {
        const stderr = (err as any)?.stderr?.toString() || '';
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Docker build failed for ${fullRef}: ${stderr || msg}`);
      }

      // Push image to registry
      logger.info(`[ImageBuilder] Pushing image: ${fullRef}`);
      try {
        execFileSync('docker', ['push', fullRef], {
          stdio: 'pipe',
          timeout: 300_000, // 5 min push timeout
        });
      } catch (err) {
        const stderr = (err as any)?.stderr?.toString() || '';
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Docker push failed for ${fullRef}: ${stderr || msg}`);
      }

      // Try to get the digest for immutability
      let digest: string | undefined;
      try {
        const inspectOutput = execFileSync(
          'docker',
          ['inspect', '--format={{index .RepoDigests 0}}', fullRef],
          { stdio: 'pipe', timeout: 10_000 },
        ).toString().trim();
        // Format: registry/repo@sha256:abc...
        const atIdx = inspectOutput.indexOf('@');
        if (atIdx !== -1) {
          digest = inspectOutput.substring(atIdx + 1);
        }
      } catch {
        // Digest extraction is best-effort; some registries don't populate RepoDigests immediately
      }

      // Extract registry host from the full registry path
      const registryHost = this.registry.split('/')[0];

      const ref: ImageRef = {
        registry: registryHost,
        repository,
        tag: resolvedTag,
        digest,
        fullRef,
      };

      logger.info(`[ImageBuilder] Image built and pushed: ${fullRef}${digest ? ` (${digest})` : ''}`);
      return ref;
    } finally {
      // Clean up temp directory
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        logger.warn(`[ImageBuilder] Warning: failed to clean up temp dir: ${tmpDir}`);
      }
    }
  }

  /**
   * Write all artifact files into the build context directory.
   * Includes path traversal protection.
   */
  private writeArtifactFiles(artifact: RuntimeArtifact, dir: string): void {
    const resolvedDir = path.resolve(dir);

    for (const [filename, content] of artifact.files) {
      const filePath = path.resolve(dir, filename);

      // Path traversal guard
      if (!filePath.startsWith(resolvedDir)) {
        throw new Error(`Path traversal detected in artifact file: ${filename}`);
      }

      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(filePath, content, 'utf-8');
    }
  }

  /**
   * Verify that Docker CLI is installed and accessible.
   */
  private assertDockerInstalled(): void {
    try {
      execFileSync('docker', ['--version'], { stdio: 'pipe', timeout: 5_000 });
    } catch {
      throw new Error(
        'Docker CLI is not installed or not in PATH. Install Docker to use LocalDockerBuilder.',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a passport ID for use as a Docker image name.
 * Docker image names must be lowercase and can contain [a-z0-9._-/].
 */
function sanitizeImageName(passportId: string): string {
  return passportId
    .toLowerCase()
    .replace(/[^a-z0-9._\-/]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Get an ImageBuilder instance based on environment configuration.
 *
 * env: IMAGE_BUILDER = 'local-docker' (default)
 *
 * Future builders: 'github-actions', 'buildkit-remote', etc.
 */
export function getImageBuilder(): ImageBuilder {
  const builderType = process.env.IMAGE_BUILDER || 'local-docker';

  switch (builderType) {
    case 'local-docker':
      return new LocalDockerBuilder();
    default:
      throw new Error(
        `Unknown IMAGE_BUILDER type: ${builderType}. Available: local-docker`,
      );
  }
}
