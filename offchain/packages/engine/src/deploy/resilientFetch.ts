/**
 * Resilient fetch wrapper for deployer HTTP calls.
 *
 * Adds retry with exponential backoff + per-request timeout to bare fetch().
 * Used by all cloud deployers (Railway, Akash, Phala, io.net, Nosana).
 */

import { withRetryAndTimeout, type RetryOptions } from '../utils/retry';

/** Default timeout per HTTP request (30s) */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Default retry options for deployer API calls */
const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
};

/**
 * Drop-in replacement for fetch() with retry + timeout.
 *
 * Retries on transient errors (network failures, 429, 503).
 * Each attempt has an individual timeout.
 */
export function resilientFetch(
  url: string | URL,
  init?: RequestInit,
  opts?: { retry?: RetryOptions; timeoutMs?: number },
): Promise<Response> {
  return withRetryAndTimeout(
    () => fetch(url, init),
    { ...DEFAULT_RETRY, ...opts?.retry },
    opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
}
