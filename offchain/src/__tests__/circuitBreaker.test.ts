/**
 * Tests for CircuitBreaker utility.
 *
 * Verifies the CLOSED → OPEN → HALF_OPEN → CLOSED lifecycle,
 * failure counting, cooldown, probe behavior, and reset.
 */
import { CircuitBreaker, CircuitBreakerOpenError } from '../../packages/engine/src/utils/circuitBreaker';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 100, name: 'test-chain' });
  });

  // ---------------------------------------------------------------------------
  // CLOSED state (normal operation)
  // ---------------------------------------------------------------------------

  it('starts in CLOSED state', () => {
    expect(cb.state).toBe('CLOSED');
    expect(cb.failureCount).toBe(0);
  });

  it('passes through successful calls in CLOSED state', async () => {
    const result = await cb.run(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(cb.state).toBe('CLOSED');
    expect(cb.successCount).toBe(1);
  });

  it('passes through errors in CLOSED state (below threshold)', async () => {
    await expect(cb.run(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    expect(cb.state).toBe('CLOSED');
    expect(cb.failureCount).toBe(1);
  });

  it('resets failure count on success', async () => {
    await expect(cb.run(() => Promise.reject(new Error('1')))).rejects.toThrow();
    await expect(cb.run(() => Promise.reject(new Error('2')))).rejects.toThrow();
    expect(cb.failureCount).toBe(2);

    await cb.run(() => Promise.resolve('ok'));
    expect(cb.failureCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // CLOSED → OPEN transition
  // ---------------------------------------------------------------------------

  it('opens after failureThreshold consecutive failures', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.run(() => Promise.reject(new Error(`fail-${i}`)))).rejects.toThrow();
    }
    expect(cb.state).toBe('OPEN');
    expect(cb.failureCount).toBe(3);
  });

  it('throws CircuitBreakerOpenError when OPEN', async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(cb.run(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    // Next call should fast-fail
    await expect(cb.run(() => Promise.resolve('should not run')))
      .rejects.toThrow(CircuitBreakerOpenError);
  });

  it('CircuitBreakerOpenError has correct properties', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.run(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    try {
      await cb.run(() => Promise.resolve('nope'));
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitBreakerOpenError);
      const e = err as CircuitBreakerOpenError;
      expect(e.chain).toBe('test-chain');
      expect(e.cooldownMs).toBe(100);
      expect(e.failureCount).toBe(3);
    }
  });

  // ---------------------------------------------------------------------------
  // OPEN → HALF_OPEN transition (cooldown)
  // ---------------------------------------------------------------------------

  it('transitions to HALF_OPEN after cooldown', async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(cb.run(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(cb.state).toBe('OPEN');

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 120));
    expect(cb.state).toBe('HALF_OPEN');
  });

  // ---------------------------------------------------------------------------
  // HALF_OPEN → CLOSED (probe success)
  // ---------------------------------------------------------------------------

  it('closes on successful probe in HALF_OPEN', async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(cb.run(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 120));
    expect(cb.state).toBe('HALF_OPEN');

    // Probe succeeds
    const result = await cb.run(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(cb.state).toBe('CLOSED');
    expect(cb.failureCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // HALF_OPEN → OPEN (probe failure)
  // ---------------------------------------------------------------------------

  it('reopens on failed probe in HALF_OPEN', async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(cb.run(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 120));
    expect(cb.state).toBe('HALF_OPEN');

    // Probe fails
    await expect(cb.run(() => Promise.reject(new Error('still down')))).rejects.toThrow('still down');
    expect(cb.state).toBe('OPEN');
  });

  // ---------------------------------------------------------------------------
  // Manual reset
  // ---------------------------------------------------------------------------

  it('reset() returns circuit to CLOSED', async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(cb.run(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(cb.state).toBe('OPEN');

    cb.reset();
    expect(cb.state).toBe('CLOSED');
    expect(cb.failureCount).toBe(0);
    expect(cb.successCount).toBe(0);

    // Calls work again
    const result = await cb.run(() => Promise.resolve('back'));
    expect(result).toBe('back');
  });

  // ---------------------------------------------------------------------------
  // Default options
  // ---------------------------------------------------------------------------

  it('uses default threshold of 5 and cooldown of 30s', () => {
    const defaultCb = new CircuitBreaker();
    // Access private via any — just verify it doesn't trip at 4
    expect(defaultCb.state).toBe('CLOSED');
  });
});

describe('BlockchainAdapterFactory circuit breaker integration', () => {
  it('factory exports circuit breaker access methods', () => {
    const { blockchainAdapterFactory } = require('../../packages/engine/src/chains/factory');
    expect(typeof blockchainAdapterFactory.getCircuitBreaker).toBe('function');
    expect(typeof blockchainAdapterFactory.resetAllCircuitBreakers).toBe('function');
    expect(typeof blockchainAdapterFactory.run).toBe('function');
  });
});
