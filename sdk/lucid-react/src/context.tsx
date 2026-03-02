import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createLucidSDK, type LucidSDK } from '@lucid/sdk/lucid';

interface LucidContextValue {
  sdk: LucidSDK;
  chain?: string;
}

const LucidContext = createContext<LucidContextValue | null>(null);

export interface LucidProviderProps {
  /** Lucid API key */
  apiKey: string;
  /** Default chain for v2 endpoints */
  chain?: string;
  /** Override server URL */
  serverURL?: string;
  children: ReactNode;
}

export function LucidProvider({ apiKey, chain, serverURL, children }: LucidProviderProps) {
  const value = useMemo<LucidContextValue>(() => {
    const sdk = createLucidSDK({ apiKey, chain, serverURL });
    return { sdk, chain };
  }, [apiKey, chain, serverURL]);

  return <LucidContext value={value}>{children}</LucidContext>;
}

export function useLucid() {
  const ctx = useContext(LucidContext);
  if (!ctx) {
    throw new Error('useLucid must be used within a <LucidProvider>');
  }
  return ctx;
}
