'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDeploymentStatus, useDeploymentLogs } from '@/hooks/useLucidApi';
import { terminateDeployment } from '@/lib/api';

const statusColors: Record<string, string> = {
  running: 'bg-green-400/10 text-green-400',
  deploying: 'bg-blue-400/10 text-blue-400',
  pending: 'bg-blue-400/10 text-blue-400',
  stopped: 'bg-gray-700/50 text-gray-400',
  failed: 'bg-red-400/10 text-red-400',
  terminated: 'bg-gray-700/50 text-gray-500',
};

export default function DeploymentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const passportId = params.passportId as string;

  const [tail, setTail] = useState(100);
  const [terminating, setTerminating] = useState(false);
  const [confirmTerminate, setConfirmTerminate] = useState(false);

  const { data: statusData, error: statusError, loading: statusLoading } = useDeploymentStatus(passportId);
  const { data: logsData, refresh: refreshLogs } = useDeploymentLogs(passportId, tail, 15_000);

  const handleTerminate = async () => {
    if (!confirmTerminate) {
      setConfirmTerminate(true);
      return;
    }
    setTerminating(true);
    try {
      await terminateDeployment(passportId);
      router.push('/dashboard/deployments');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Termination failed');
      setTerminating(false);
      setConfirmTerminate(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Link href="/dashboard/deployments" className="text-gray-500 hover:text-gray-300 text-sm">
              Deployments
            </Link>
            <span className="text-gray-600">/</span>
          </div>
          <h1 className="font-mono text-xl font-bold">{passportId}</h1>
        </div>
        <div className="flex gap-2">
          {confirmTerminate ? (
            <>
              <button
                onClick={() => setConfirmTerminate(false)}
                className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleTerminate}
                disabled={terminating}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {terminating ? 'Terminating...' : 'Confirm Terminate'}
              </button>
            </>
          ) : (
            <button
              onClick={handleTerminate}
              className="rounded-md border border-red-800 px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/30"
            >
              Terminate
            </button>
          )}
        </div>
      </div>

      {statusLoading && !statusData ? (
        <p className="text-gray-500">Loading...</p>
      ) : statusError ? (
        <p className="text-red-400">{statusError.message}</p>
      ) : (
        <>
          {/* Status cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
              <p className="text-xs text-gray-500">Status</p>
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-sm ${statusColors[statusData?.status ?? ''] ?? 'bg-gray-700/50 text-gray-400'}`}
              >
                {statusData?.status ?? 'unknown'}
              </span>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
              <p className="text-xs text-gray-500">Health</p>
              <p
                className={`mt-1 text-sm font-medium ${
                  statusData?.health === 'healthy'
                    ? 'text-green-400'
                    : statusData?.health === 'degraded'
                      ? 'text-yellow-400'
                      : 'text-gray-400'
                }`}
              >
                {statusData?.health ?? 'unknown'}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
              <p className="text-xs text-gray-500">Deployment ID</p>
              <p className="mt-1 font-mono text-xs text-gray-300 truncate">
                {statusData?.deployment_id ?? '-'}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
              <p className="text-xs text-gray-500">URL</p>
              {statusData?.url ? (
                <a
                  href={statusData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate text-sm text-blue-400 hover:text-blue-300"
                >
                  {statusData.url}
                </a>
              ) : (
                <p className="mt-1 text-sm text-gray-500">Pending</p>
              )}
            </div>
          </div>

          {/* Logs */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/50">
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
              <h2 className="text-sm font-semibold">Logs</h2>
              <div className="flex items-center gap-3">
                <select
                  value={tail}
                  onChange={(e) => setTail(Number(e.target.value))}
                  className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 focus:outline-none"
                >
                  <option value={50}>Last 50</option>
                  <option value={100}>Last 100</option>
                  <option value={500}>Last 500</option>
                  <option value={1000}>Last 1000</option>
                </select>
                <button
                  onClick={refreshLogs}
                  className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-400 hover:text-gray-200"
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="max-h-[500px] overflow-auto p-4">
              <pre className="font-mono text-xs leading-5 text-gray-400 whitespace-pre-wrap">
                {logsData?.logs || 'No logs available.'}
              </pre>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
