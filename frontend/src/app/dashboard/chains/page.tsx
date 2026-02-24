'use client';

import { useChainStatus } from '@/hooks/useLucidApi';

export default function ChainsPage() {
  const { data, loading, error } = useChainStatus();

  const chains = data?.chains ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Chains</h1>

      {loading && <p className="text-gray-500">Loading chain status...</p>}
      {error && <p className="text-red-400">Error: {error.message}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {chains.map((chain: any) => (
          <div
            key={chain.chainId}
            className={`rounded-lg border p-4 ${
              chain.connected
                ? chain.status === 'healthy'
                  ? 'border-green-400/20 bg-green-400/5'
                  : 'border-yellow-400/20 bg-yellow-400/5'
                : 'border-gray-700 bg-gray-900/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{chain.name}</h3>
              <span
                className={`h-2 w-2 rounded-full ${
                  chain.connected
                    ? chain.status === 'healthy'
                      ? 'bg-green-400'
                      : 'bg-yellow-400'
                    : 'bg-gray-600'
                }`}
              />
            </div>
            <div className="mt-2 space-y-1 text-xs text-gray-500">
              <p>Type: <span className="text-gray-400">{chain.chainType}</span></p>
              <p>ID: <span className="text-gray-400">{chain.chainId}</span></p>
              <p>Testnet: <span className="text-gray-400">{chain.isTestnet ? 'Yes' : 'No'}</span></p>
              {chain.blockNumber && (
                <p>Block: <span className="text-gray-400">{chain.blockNumber.toLocaleString()}</span></p>
              )}
              {chain.latencyMs !== undefined && (
                <p>Latency: <span className="text-gray-400">{chain.latencyMs}ms</span></p>
              )}
            </div>
          </div>
        ))}
      </div>

      {chains.length === 0 && !loading && (
        <p className="text-gray-500">No chains configured.</p>
      )}
    </div>
  );
}
