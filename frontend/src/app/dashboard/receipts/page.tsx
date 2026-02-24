'use client';

import { useState } from 'react';
import { useReceipts } from '@/hooks/useLucidApi';
import * as api from '@/lib/api';

export default function ReceiptsPage() {
  const { data, loading, error } = useReceipts();
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, any>>({});

  const receipts = data?.receipts ?? [];

  const handleVerify = async (runId: string) => {
    setVerifying(runId);
    try {
      const result = await api.verifyReceipt(runId);
      setVerifyResult((prev) => ({ ...prev, [runId]: result.verification }));
    } catch (err) {
      setVerifyResult((prev) => ({
        ...prev,
        [runId]: { error: err instanceof Error ? err.message : 'Verification failed' },
      }));
    }
    setVerifying(null);
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Receipts</h1>

      {loading && <p className="text-gray-500">Loading receipts...</p>}
      {error && <p className="text-red-400">Error: {error.message}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-800 text-gray-500">
            <tr>
              <th className="pb-3 font-medium">Run ID</th>
              <th className="pb-3 font-medium">Compute</th>
              <th className="pb-3 font-medium">Model</th>
              <th className="pb-3 font-medium">Tokens</th>
              <th className="pb-3 font-medium">TTFT</th>
              <th className="pb-3 font-medium">Verify</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {receipts.map((r: any) => (
              <tr key={r.run_id} className="hover:bg-gray-900/30">
                <td className="py-3 font-mono text-xs">{r.run_id?.slice(0, 16)}...</td>
                <td className="py-3 font-mono text-xs text-gray-400">
                  {r.compute_passport_id?.slice(0, 12)}...
                </td>
                <td className="py-3 font-mono text-xs text-gray-400">
                  {r.model_passport_id?.slice(0, 12)}...
                </td>
                <td className="py-3 text-gray-400">
                  {r.metrics?.tokens_in ?? 0} / {r.metrics?.tokens_out ?? 0}
                </td>
                <td className="py-3 text-gray-400">{r.metrics?.ttft_ms ?? '-'}ms</td>
                <td className="py-3">
                  {verifyResult[r.run_id] ? (
                    <span
                      className={`text-xs ${
                        verifyResult[r.run_id].hash_valid
                          ? 'text-green-400'
                          : 'text-red-400'
                      }`}
                    >
                      {verifyResult[r.run_id].hash_valid ? 'Valid' : 'Invalid'}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleVerify(r.run_id)}
                      disabled={verifying === r.run_id}
                      className="rounded bg-blue-600/20 px-2 py-0.5 text-xs text-blue-400 hover:bg-blue-600/30 disabled:opacity-50"
                    >
                      {verifying === r.run_id ? '...' : 'Verify'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {receipts.length === 0 && !loading && (
        <p className="mt-4 text-gray-500">No receipts found.</p>
      )}
    </div>
  );
}
