import { useState, useEffect } from 'react';
import { useLucid } from '../context.js';

export interface UsePassportOptions {
  enabled?: boolean;
}

export function usePassport(passportId: string | undefined, options: UsePassportOptions = {}) {
  const { sdk } = useLucid();
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!passportId || !enabled) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    sdk.passports
      .get({ passportId })
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sdk, passportId, enabled]);

  return { data, error, isLoading };
}
