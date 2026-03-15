import { logger } from '../shared/lib/logger';

/**
 * Circuit Breaker
 *
 * Prevents cascading failures when a chain RPC goes down.
 * After N consecutive failures, the circuit opens and fast-fails
 * all calls for a cooldown period.
 *
 * States:
 *   CLOSED    → normal operation, requests pass through
 *   OPEN      → chain is down, all requests fast-fail
 *   HALF_OPEN → cooldown expired, one probe request allowed
 *
 * Transitions:
 *   CLOSED  → (failureThreshold consecutive failures) → OPEN
 *   OPEN    → (cooldownMs elapsed)                    → HALF_OPEN
 *   HALF_OPEN → (probe succeeds)                      → CLOSED
 *   HALF_OPEN → (probe fails)                         → OPEN
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Consecutive failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms to wait before allowing a probe request (default: 30000) */
  cooldownMs?: number;
  /** Optional name for logging */
  name?: string;
}

export class CircuitBreaker {
  private _state: CircuitState = 'CLOSED';
  private _failureCount = 0;
  private _lastFailureTime = 0;
  private _successCount = 0;
  private readonly _failureThreshold: number;
  private readonly _cooldownMs: number;
  private readonly _name: string;

  constructor(opts?: CircuitBreakerOptions) {
    this._failureThreshold = opts?.failureThreshold ?? 5;
    this._cooldownMs = opts?.cooldownMs ?? 30_000;
    this._name = opts?.name ?? 'unknown';
  }

  get state(): CircuitState {
    // Auto-transition from OPEN → HALF_OPEN when cooldown expires
    if (this._state === 'OPEN' && Date.now() - this._lastFailureTime >= this._cooldownMs) {
      this._state = 'HALF_OPEN';
    }
    return this._state;
  }

  get failureCount(): number {
    return this._failureCount;
  }

  get successCount(): number {
    return this._successCount;
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitBreakerOpenError if the circuit is open.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.state; // triggers auto-transition

    if (currentState === 'OPEN') {
      throw new CircuitBreakerOpenError(this._name, this._cooldownMs, this._failureCount);
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  /** Reset the circuit to CLOSED (e.g. after manual intervention) */
  reset(): void {
    this._state = 'CLOSED';
    this._failureCount = 0;
    this._successCount = 0;
    this._lastFailureTime = 0;
  }

  private _onSuccess(): void {
    this._successCount++;
    if (this._state === 'HALF_OPEN') {
      // Probe succeeded — close the circuit
      logger.info(`[CircuitBreaker:${this._name}] Probe succeeded, circuit CLOSED`);
      this._state = 'CLOSED';
      this._failureCount = 0;
    } else {
      // Reset consecutive failure count on any success
      this._failureCount = 0;
    }
  }

  private _onFailure(): void {
    this._failureCount++;
    this._lastFailureTime = Date.now();

    if (this._state === 'HALF_OPEN') {
      // Probe failed — reopen
      logger.info(`[CircuitBreaker:${this._name}] Probe failed, circuit OPEN`);
      this._state = 'OPEN';
    } else if (this._failureCount >= this._failureThreshold) {
      logger.warn(
        `[CircuitBreaker:${this._name}] ${this._failureCount} consecutive failures, circuit OPEN (cooldown: ${this._cooldownMs}ms)`,
      );
      this._state = 'OPEN';
    }
  }
}

/**
 * Error thrown when the circuit is open and calls are being fast-failed.
 */
export class CircuitBreakerOpenError extends Error {
  readonly chain: string;
  readonly cooldownMs: number;
  readonly failureCount: number;

  constructor(chain: string, cooldownMs: number, failureCount: number) {
    super(
      `Circuit breaker OPEN for ${chain} — ${failureCount} consecutive failures, cooldown ${cooldownMs}ms`,
    );
    this.name = 'CircuitBreakerOpenError';
    this.chain = chain;
    this.cooldownMs = cooldownMs;
    this.failureCount = failureCount;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
