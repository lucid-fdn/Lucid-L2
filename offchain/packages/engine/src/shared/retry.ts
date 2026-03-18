/**
 * Retry and Timeout Utilities
 *
 * Exponential backoff with jitter for transient errors,
 * and a timeout wrapper that throws TimeoutError.
 */

import { TimeoutError, NetworkError, RateLimitError } from '../errors';

// =============================================================================
// Types
// =============================================================================

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms before first retry (default: 200) */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default: 10000) */
  maxDelayMs?: number;
  /** Custom predicate — return true if the error is retryable */
  isRetryable?: (error: unknown) => boolean;
}

// =============================================================================
// Default Retryable Check
// =============================================================================

function isTransientError(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof TimeoutError) return true;
  if (error instanceof RateLimitError) return true;

  // Retry on common transient error messages
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('econnreset') || msg.includes('econnrefused')) return true;
    if (msg.includes('socket hang up') || msg.includes('etimedout')) return true;
    if (msg.includes('503') || msg.includes('429')) return true;
  }

  return false;
}

// =============================================================================
// withRetry
// =============================================================================

/**
 * Execute an async function with exponential backoff on transient failures.
 *
 * Uses jitter to prevent thundering-herd on concurrent retries.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 200;
  const maxDelayMs = opts?.maxDelayMs ?? 10_000;
  const shouldRetry = opts?.isRetryable ?? isTransientError;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Respect RateLimitError's retryAfterMs hint
      let delayMs: number;
      if (error instanceof RateLimitError && error.retryAfterMs) {
        delayMs = error.retryAfterMs;
      } else {
        // Exponential backoff: baseDelay * 2^attempt, capped at maxDelay
        const exponential = baseDelayMs * Math.pow(2, attempt);
        const capped = Math.min(exponential, maxDelayMs);
        // Add jitter: 50%-100% of the computed delay
        delayMs = capped * (0.5 + Math.random() * 0.5);
      }

      await sleep(delayMs);
    }
  }

  // Should not reach here, but TypeScript needs it
  throw lastError;
}

// =============================================================================
// withTimeout
// =============================================================================

/**
 * Execute an async function with a timeout.
 * Throws TimeoutError if the function does not resolve within limitMs.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  limitMs: number,
): Promise<T> {
  const start = Date.now();

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(
        `Operation timed out after ${limitMs}ms`,
        Date.now() - start,
        limitMs,
      ));
    }, limitMs);

    fn().then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// =============================================================================
// Combined: withRetry + withTimeout
// =============================================================================

/**
 * Execute an async function with both timeout and retry.
 * Each attempt is individually timed out.
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  retryOpts?: RetryOptions,
  timeoutMs?: number,
): Promise<T> {
  const wrappedFn = timeoutMs
    ? () => withTimeout(fn, timeoutMs)
    : fn;

  return withRetry(wrappedFn, retryOpts);
}

// =============================================================================
// Helpers
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
