'use client';

import { useEpochs } from '@/hooks/useLucidApi';

export default function EpochsPage() {
  const { data, loading, error } = useEpochs();

  const epochs = data?.epochs ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Epochs</h1>

      {loading && <p className="text-gray-500">Loading epochs...</p>}
      {error && <p className="text-red-400">Error: {error.message}</p>}

      <div className="space-y-3">
        {epochs.map((epoch: any) => (
          <div
            key={epoch.epoch_id}
            className="rounded-lg border border-gray-800 bg-gray-900/50 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Epoch {epoch.epoch_number ?? epoch.epoch_id}</p>
                <p className="text-xs text-gray-500">
                  {epoch.created_at
                    ? new Date(epoch.created_at * 1000).toLocaleString()
                    : 'Unknown date'}
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    epoch.status === 'anchored'
                      ? 'bg-green-400/10 text-green-400'
                      : epoch.status === 'pending'
                        ? 'bg-yellow-400/10 text-yellow-400'
                        : 'bg-gray-700/50 text-gray-400'
                  }`}
                >
                  {epoch.status}
                </span>
              </div>
            </div>
            {epoch.mmr_root && (
              <p className="mt-2 font-mono text-xs text-gray-600">
                Root: {epoch.mmr_root}
              </p>
            )}
            {epoch.tx_hash && (
              <p className="mt-1 font-mono text-xs text-gray-600">
                TX: {epoch.tx_hash}
              </p>
            )}
            {epoch.receipt_count !== undefined && (
              <p className="mt-1 text-xs text-gray-500">
                {epoch.receipt_count} receipt(s) in this epoch
              </p>
            )}
          </div>
        ))}
      </div>

      {epochs.length === 0 && !loading && (
        <p className="text-gray-500">No epochs found.</p>
      )}
    </div>
  );
}
