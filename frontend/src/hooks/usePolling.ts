'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook for polling data at regular intervals.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number = 10_000,
  enabled: boolean = true,
): { data: T | null; error: Error | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const result = await fetcher();
      if (mountedRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error('Fetch failed'));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;

    fetchData();
    const interval = setInterval(fetchData, intervalMs);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchData, intervalMs, enabled]);

  return { data, error, loading, refresh: fetchData };
}
