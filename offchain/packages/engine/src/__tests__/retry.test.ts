import { withRetry, withTimeout, withRetryAndTimeout } from '../utils/retry';
import { NetworkError, TimeoutError, RateLimitError } from '../errors';

describe('withRetry', () => {
  it('should return on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient NetworkError', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new NetworkError('fail', 'http://rpc', 503))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxRetries: 2, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on TimeoutError', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new TimeoutError('slow', 5000, 3000))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxRetries: 1, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on RateLimitError and respect retryAfterMs', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new RateLimitError('throttled', 10))
      .mockResolvedValue('ok');

    const start = Date.now();
    const result = await withRetry(fn, { maxRetries: 1, baseDelayMs: 1 });
    expect(result).toBe('ok');
    // Should have waited at least ~10ms for the rate limit hint
    expect(Date.now() - start).toBeGreaterThanOrEqual(8);
  });

  it('should NOT retry non-transient errors', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('logic error'));

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 }))
      .rejects.toThrow('logic error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw after exhausting retries', async () => {
    const fn = jest.fn().mockRejectedValue(new NetworkError('fail', 'http://rpc', 503));

    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1 }))
      .rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('should support custom isRetryable predicate', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('custom-retryable'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, {
      maxRetries: 1,
      baseDelayMs: 1,
      isRetryable: (err) => err instanceof Error && err.message.includes('custom-retryable'),
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on ECONNRESET', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('read ECONNRESET'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxRetries: 1, baseDelayMs: 1 });
    expect(result).toBe('ok');
  });
});

describe('withTimeout', () => {
  it('should resolve if within limit', async () => {
    const fn = () => Promise.resolve('fast');
    const result = await withTimeout(fn, 1000);
    expect(result).toBe('fast');
  });

  it('should throw TimeoutError if limit exceeded', async () => {
    const fn = () => new Promise((resolve) => setTimeout(resolve, 500));

    await expect(withTimeout(fn, 10))
      .rejects.toThrow(TimeoutError);
  });

  it('should include timing info in TimeoutError', async () => {
    const fn = () => new Promise((resolve) => setTimeout(resolve, 500));

    try {
      await withTimeout(fn, 10);
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TimeoutError);
      expect((err as TimeoutError).limitMs).toBe(10);
    }
  });

  it('should propagate original errors (not timeout)', async () => {
    const fn = () => Promise.reject(new Error('real error'));
    await expect(withTimeout(fn, 1000)).rejects.toThrow('real error');
  });
});

describe('withRetryAndTimeout', () => {
  it('should combine retry and timeout', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls === 1) {
        // First call: simulate slow response (will timeout)
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return 'ok';
    };

    const result = await withRetryAndTimeout(
      fn,
      { maxRetries: 2, baseDelayMs: 1 },
      20, // 20ms timeout — first call times out, second succeeds
    );

    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  it('should work without timeout', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetryAndTimeout(fn, { maxRetries: 1 });
    expect(result).toBe('ok');
  });
});
