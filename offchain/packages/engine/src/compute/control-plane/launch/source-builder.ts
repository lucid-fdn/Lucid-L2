// packages/engine/src/compute/control-plane/launch/source-builder.ts
// Detects Dockerfile/Nixpacks, builds Docker image, optionally pushes to registry.

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../../../shared/lib/logger';

export interface BuildResult {
  success: boolean;
  image?: string;
  digest?: string;
  source_hash?: string;
  error?: string;
}

/**
 * Detect what kind of source project lives at `sourcePath`.
 *   - 'dockerfile' — Dockerfile present (build with docker build)
 *   - 'nixpacks'   — recognizable language project (package.json, requirements.txt, go.mod)
 *   - 'unknown'    — nothing we can detect
 */
export function detectSourceType(sourcePath: string): 'dockerfile' | 'nixpacks' | 'unknown' {
  if (fs.existsSync(path.join(sourcePath, 'Dockerfile'))) return 'dockerfile';
  if (fs.existsSync(path.join(sourcePath, 'package.json'))) return 'nixpacks';
  if (fs.existsSync(path.join(sourcePath, 'requirements.txt'))) return 'nixpacks';
  if (fs.existsSync(path.join(sourcePath, 'go.mod'))) return 'nixpacks';
  return 'unknown';
}

/** Directories/patterns excluded from the deterministic source hash. */
const HASH_IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', '__pycache__', '.next', '.venv',
]);

/**
 * Compute a deterministic SHA-256 hash of the source tree.
 * Ignores common transient directories, sorts paths for stability,
 * and includes relative path in the hash so renames are detected.
 */
function hashDirectory(dir: string): string {
  const hash = crypto.createHash('sha256');
  const entries = fs.readdirSync(dir, { recursive: true }) as string[];
  const filtered = entries
    .filter(f => {
      const parts = f.split(path.sep);
      return !parts.some(p => HASH_IGNORE.has(p));
    })
    .sort();

  for (const file of filtered) {
    const fullPath = path.join(dir, file);
    try {
      if (fs.statSync(fullPath).isFile()) {
        hash.update(file); // include relative path for determinism
        hash.update(fs.readFileSync(fullPath));
      }
    } catch {
      /* skip unreadable files */
    }
  }

  return hash.digest('hex').slice(0, 16);
}

/** Check whether the `docker` CLI is reachable. */
export function isDockerAvailable(): boolean {
  try {
    execFileSync('docker', ['version'], { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a Docker image from source.
 *
 * - When `registryUrl` is omitted, builds a local-only image (for --target docker).
 * - When `registryUrl` is provided, builds and pushes with namespaced path:
 *   `${registryUrl}/agents/${passportId}:${tag}`
 */
export async function buildFromSource(opts: {
  sourcePath: string;
  passportId: string;
  registryUrl?: string;
  tag?: string;
}): Promise<BuildResult> {
  const absPath = path.resolve(opts.sourcePath);
  if (!fs.existsSync(absPath)) {
    return { success: false, error: `Source path not found: ${absPath}` };
  }

  const sourceType = detectSourceType(absPath);
  if (sourceType === 'unknown') {
    return { success: false, error: 'No Dockerfile, package.json, requirements.txt, or go.mod found' };
  }

  if (sourceType === 'dockerfile' && !isDockerAvailable()) {
    return { success: false, error: 'Docker is required for Dockerfile builds but is not available' };
  }

  const sourceHash = hashDirectory(absPath);
  const tag = opts.tag || 'latest';

  // Local-only build (no registry — for --target docker)
  if (!opts.registryUrl) {
    const localImage = `lucid-agent-${opts.passportId}:${tag}`;
    try {
      logger.info(`[Build] Building ${localImage} from ${absPath}`);
      execFileSync('docker', ['build', '-t', localImage, '.'], {
        cwd: absPath,
        stdio: 'pipe',
        timeout: 300_000,
      });
      return { success: true, image: localImage, source_hash: sourceHash };
    } catch (err: any) {
      return { success: false, error: `Docker build failed: ${err.message?.split('\n')[0]}` };
    }
  }

  // Build and push to registry
  const imageRef = `${opts.registryUrl}/agents/${opts.passportId}:${tag}`;
  try {
    logger.info(`[Build] Building ${imageRef} from ${absPath}`);
    execFileSync('docker', ['build', '-t', imageRef, '.'], {
      cwd: absPath,
      stdio: 'pipe',
      timeout: 300_000,
    });

    logger.info(`[Build] Pushing ${imageRef}`);
    const pushOutput = execFileSync('docker', ['push', imageRef], {
      stdio: 'pipe',
      timeout: 120_000,
    }).toString();

    const digestMatch = pushOutput.match(/digest: (sha256:[a-f0-9]+)/);
    return {
      success: true,
      image: imageRef,
      digest: digestMatch?.[1],
      source_hash: sourceHash,
    };
  } catch (err: any) {
    return { success: false, error: `Build/push failed: ${err.message?.split('\n')[0]}` };
  }
}
