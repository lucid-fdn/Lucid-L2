/**
 * Runtime Utilities for BYO Runtime Worker
 * 
 * Provides hardware and runtime identification functions required for
 * verifiable compute attestation in byo_runtime mode.
 * 
 * @module runtimeUtils
 */

import { execSync, exec } from 'child_process';
import * as fs from 'fs';
import * as crypto from 'crypto';

/**
 * GPU Information structure
 */
export interface GpuInfo {
  vendor: string;
  model: string;
  vram_mb: number;
  driver_version: string;
  cuda_version?: string;
  gpu_count: number;
  gpu_uuid?: string;
}

/**
 * Runtime Information structure
 */
export interface RuntimeInfo {
  image_id?: string;
  image_digest?: string;
  container_id?: string;
  runtime_type: 'vllm' | 'tgi';
  runtime_version?: string;
}

/**
 * Get the Docker image digest (sha256 hash) of the running container.
 * 
 * This provides a deterministic identifier for the exact runtime environment.
 * The same image will always produce the same hash.
 * 
 * Format: sha256:<64-char-hex-digest>
 * 
 * Priority order:
 * 1. RUNTIME_HASH env var (explicit, recommended for Runpod)
 * 2. DOCKER_IMAGE_ID env var (legacy)
 * 3. Docker socket inspection
 * 4. /proc/self/cgroup parsing
 * 5. Binary hash fallback
 * 
 * @returns Runtime hash in format "sha256:<digest>" or null if not in container
 */
export function getRuntimeHash(): string | null {
  try {
    // Method 0 (PREFERRED): Explicit RUNTIME_HASH env var
    // On Runpod and similar platforms, auto-detecting Docker digest is unreliable.
    // Setting RUNTIME_HASH explicitly guarantees deterministic receipts.
    const explicitHash = process.env.RUNTIME_HASH;
    if (explicitHash) {
      // Normalize format to sha256:xxx
      if (explicitHash.startsWith('sha256:')) {
        return explicitHash;
      }
      // Handle case where user provides just the hex digest
      if (/^[a-f0-9]{64}$/i.test(explicitHash)) {
        return `sha256:${explicitHash}`;
      }
      // Return as-is if it looks like a valid hash format
      console.warn(`[RuntimeUtils] RUNTIME_HASH format unexpected: ${explicitHash}`);
      return explicitHash;
    }

    // Method 1: Check Docker image ID from environment (legacy)
    const imageId = process.env.DOCKER_IMAGE_ID;
    if (imageId && imageId.startsWith('sha256:')) {
      return imageId;
    }

    // Method 2: Try to get container info via Docker socket
    const containerId = getContainerId();
    if (containerId) {
      try {
        const inspectOutput = execSync(
          `docker inspect --format='{{.Image}}' ${containerId}`,
          { encoding: 'utf-8', timeout: 5000 }
        ).trim();
        
        if (inspectOutput.startsWith('sha256:')) {
          return inspectOutput;
        }
      } catch {
        // Docker inspect failed, try next method
      }
    }

    // Method 3: Read from /proc/self/cgroup to identify container
    try {
      const cgroupContent = fs.readFileSync('/proc/self/cgroup', 'utf-8');
      const dockerMatch = cgroupContent.match(/docker[/-]([a-f0-9]{64})/);
      if (dockerMatch) {
        // We have container ID, try to get image digest
        const cid = dockerMatch[1].substring(0, 12);
        try {
          const imageDigest = execSync(
            `docker inspect --format='{{index .RepoDigests 0}}' $(docker inspect --format='{{.Image}}' ${cid})`,
            { encoding: 'utf-8', timeout: 5000 }
          ).trim();
          
          // Extract sha256 from "repo@sha256:..."
          const sha256Match = imageDigest.match(/@(sha256:[a-f0-9]{64})/);
          if (sha256Match) {
            return sha256Match[1];
          }
        } catch {
          // Fallback: use container-based hash
        }
      }
    } catch {
      // Not in container or can't read cgroup
    }

    // Method 4: Compute hash from runtime binaries (deterministic fallback)
    const runtimeHash = computeRuntimeBinaryHash();
    if (runtimeHash) {
      return `sha256:${runtimeHash}`;
    }

    return null;
  } catch (error) {
    console.error('[RuntimeUtils] Error getting runtime hash:', error);
    return null;
  }
}

/**
 * Compute a deterministic hash from runtime binary files.
 * Used as fallback when Docker image digest is unavailable.
 */
function computeRuntimeBinaryHash(): string | null {
  try {
    const paths = [
      '/usr/local/bin/python3',
      '/usr/bin/python3',
    ];

    const vllmPaths = [
      // Common vLLM installation paths
      '/usr/local/lib/python3.10/dist-packages/vllm/__init__.py',
      '/usr/local/lib/python3.11/dist-packages/vllm/__init__.py',
    ];

    const hash = crypto.createHash('sha256');
    let foundAny = false;

    // Hash Python binary
    for (const p of paths) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p);
        hash.update(content);
        foundAny = true;
        break;
      }
    }

    // Hash vLLM module
    for (const p of vllmPaths) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p);
        hash.update(content);
        foundAny = true;
        break;
      }
    }

    // Add vLLM version if available
    try {
      const version = execSync('python3 -c "import vllm; print(vllm.__version__)"', {
        encoding: 'utf-8',
        timeout: 5000
      }).trim();
      hash.update(version);
      foundAny = true;
    } catch {
      // vLLM not installed
    }

    if (!foundAny) return null;
    return hash.digest('hex');
  } catch {
    return null;
  }
}

/**
 * Get the container ID if running in Docker.
 */
function getContainerId(): string | null {
  try {
    // Method 1: Environment variable
    if (process.env.HOSTNAME && process.env.HOSTNAME.length === 12) {
      return process.env.HOSTNAME;
    }

    // Method 2: Read from cgroup
    const cgroupContent = fs.readFileSync('/proc/self/cgroup', 'utf-8');
    const match = cgroupContent.match(/docker[/-]([a-f0-9]+)/);
    if (match) {
      return match[1].substring(0, 12);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get GPU fingerprint from nvidia-smi.
 * 
 * Format: <vendor>-<model>-<vram>GB
 * Example: NVIDIA-A100-40GB
 * 
 * @returns GPU fingerprint string or null if no GPU
 */
export function getGpuFingerprint(): string | null {
  try {
    const gpuInfo = getGpuInfo();
    if (!gpuInfo || gpuInfo.gpu_count === 0) {
      return null;
    }

    // Format: VENDOR-MODEL-VRAM
    const vramGb = Math.round(gpuInfo.vram_mb / 1024);
    const modelClean = gpuInfo.model
      .replace(/NVIDIA\s*/gi, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '');
    
    return `NVIDIA-${modelClean}-${vramGb}GB`;
  } catch (error) {
    console.error('[RuntimeUtils] Error getting GPU fingerprint:', error);
    return null;
  }
}

/**
 * Get detailed GPU information using nvidia-smi.
 */
export function getGpuInfo(): GpuInfo | null {
  try {
    // Query nvidia-smi for GPU info
    const query = 'gpu_name,memory.total,driver_version,gpu_uuid,count';
    const output = execSync(
      `nvidia-smi --query-gpu=${query} --format=csv,noheader,nounits`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();

    if (!output) {
      return null;
    }

    // Parse first GPU (multi-GPU support can be added later)
    const lines = output.split('\n');
    const firstGpu = lines[0].split(',').map(s => s.trim());

    const [name, memoryMb, driverVersion, gpuUuid] = firstGpu;

    // Get CUDA version
    let cudaVersion: string | undefined;
    try {
      const cudaOutput = execSync('nvcc --version', { encoding: 'utf-8', timeout: 5000 });
      const cudaMatch = cudaOutput.match(/release (\d+\.\d+)/);
      if (cudaMatch) {
        cudaVersion = cudaMatch[1];
      }
    } catch {
      // CUDA toolkit not installed, try nvidia-smi
      try {
        const smiOutput = execSync('nvidia-smi', { encoding: 'utf-8', timeout: 5000 });
        const cudaMatch = smiOutput.match(/CUDA Version:\s*(\d+\.\d+)/);
        if (cudaMatch) {
          cudaVersion = cudaMatch[1];
        }
      } catch {
        // Ignore
      }
    }

    return {
      vendor: 'NVIDIA',
      model: name,
      vram_mb: parseInt(memoryMb, 10),
      driver_version: driverVersion,
      cuda_version: cudaVersion,
      gpu_count: lines.length,
      gpu_uuid: gpuUuid,
    };
  } catch (error) {
    // nvidia-smi not available or failed
    console.warn('[RuntimeUtils] nvidia-smi not available:', error);
    return null;
  }
}

/**
 * Check if GPU is available and healthy.
 */
export async function checkGpuHealth(): Promise<{
  healthy: boolean;
  gpu_available: boolean;
  gpu_info?: GpuInfo;
  error?: string;
}> {
  try {
    const gpuInfo = getGpuInfo();
    
    if (!gpuInfo) {
      return {
        healthy: false,
        gpu_available: false,
        error: 'No GPU detected or nvidia-smi unavailable',
      };
    }

    // Basic health check - try to query GPU utilization
    try {
      execSync('nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader', {
        timeout: 5000,
      });
    } catch {
      return {
        healthy: false,
        gpu_available: true,
        gpu_info: gpuInfo,
        error: 'GPU detected but health check failed',
      };
    }

    return {
      healthy: true,
      gpu_available: true,
      gpu_info: gpuInfo,
    };
  } catch (error) {
    return {
      healthy: false,
      gpu_available: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get vLLM version if installed.
 */
export function getVllmVersion(): string | null {
  try {
    const version = execSync(
      'python3 -c "import vllm; print(vllm.__version__)"',
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    return version;
  } catch {
    return null;
  }
}

/**
 * Check if vLLM is running and accessible.
 */
export async function checkVllmHealth(baseUrl: string): Promise<{
  healthy: boolean;
  version?: string;
  models_loaded?: string[];
  error?: string;
}> {
  try {
    // Check vLLM health endpoint
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        healthy: false,
        error: `vLLM health check returned ${response.status}`,
      };
    }

    // Try to get loaded models
    let models_loaded: string[] = [];
    try {
      const modelsResponse = await fetch(`${baseUrl}/v1/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      
      if (modelsResponse.ok) {
        const data = await modelsResponse.json();
        models_loaded = data.data?.map((m: { id: string }) => m.id) || [];
      }
    } catch {
      // Models endpoint not critical
    }

    return {
      healthy: true,
      version: getVllmVersion() || undefined,
      models_loaded,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'vLLM unreachable',
    };
  }
}

/**
 * Parse a model ID to extract revision if present.
 * 
 * Supported formats:
 * - "org/model" -> { model: "org/model", revision: null }
 * - "org/model@revision" -> { model: "org/model", revision: "revision" }
 * - "org/model:revision" -> { model: "org/model", revision: "revision" }
 */
export function parseModelId(modelId: string): { model: string; revision: string | null } {
  // Check for @ separator (HuggingFace style)
  if (modelId.includes('@')) {
    const [model, revision] = modelId.split('@');
    return { model, revision: revision || null };
  }
  
  // Check for : separator (alternative)
  const lastColon = modelId.lastIndexOf(':');
  if (lastColon > 0 && !modelId.substring(lastColon + 1).includes('/')) {
    return {
      model: modelId.substring(0, lastColon),
      revision: modelId.substring(lastColon + 1),
    };
  }
  
  return { model: modelId, revision: null };
}

/**
 * Validate that a model ID has a pinned revision (not "latest" or missing).
 */
export function validatePinnedRevision(modelId: string): {
  valid: boolean;
  model: string;
  revision: string | null;
  error?: string;
} {
  const { model, revision } = parseModelId(modelId);
  
  if (!revision) {
    return {
      valid: false,
      model,
      revision: null,
      error: 'Model ID must include a pinned revision (e.g., model@abc123)',
    };
  }
  
  if (revision.toLowerCase() === 'latest' || revision.toLowerCase() === 'main') {
    return {
      valid: false,
      model,
      revision,
      error: 'Revision cannot be "latest" or "main" - must be a specific commit hash',
    };
  }
  
  return { valid: true, model, revision };
}