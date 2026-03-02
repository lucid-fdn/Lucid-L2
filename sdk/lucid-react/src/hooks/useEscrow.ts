import { useState, useEffect, useRef } from 'react';
import { useLucid } from '../context.js';

export interface UseEscrowOptions {
  refetchInterval?: number;
  enabled?: boolean;
}

export function useEscrow(
  escrowId: string | undefined,
  options: UseEscrowOptions = {},
) {
  const { sdk, chain } = useLucid();
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const enabled = options.enabled ?? true;
  const chainId = chain ?? 'base';

  useEffect(() => {
    if (!escrowId || !enabled) return;

    const fetchEscrow = async () => {
      try {
        const result = await sdk.escrow.get({ chainId, escrowId });
        setData(result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    };

    setIsLoading(true);
    fetchEscrow().finally(() => setIsLoading(false));

    if (options.refetchInterval) {
      intervalRef.current = setInterval(fetchEscrow, options.refetchInterval);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sdk, escrowId, chainId, enabled, options.refetchInterval]);

  return { data, error, isLoading };
}
