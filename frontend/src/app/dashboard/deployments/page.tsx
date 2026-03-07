'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useDeployments, useAgentCapabilities } from '@/hooks/useLucidApi';
import { ProviderWizard } from '@/components/ProviderWizard';

const statusColors: Record<string, string> = {
  running: 'bg-green-400/10 text-green-400',
  deploying: 'bg-blue-400/10 text-blue-400',
  pending: 'bg-blue-400/10 text-blue-400',
  stopped: 'bg-gray-700/50 text-gray-400',
  failed: 'bg-red-400/10 text-red-400',
  terminated: 'bg-gray-700/50 text-gray-500',
};

const healthColors: Record<string, string> = {
  healthy: 'text-green-400',
  degraded: 'text-yellow-400',
  unhealthy: 'text-red-400',
  unknown: 'text-gray-500',
};

const targetLabels: Record<string, string> = {
  railway: 'Railway',
  akash: 'Akash',
  phala: 'Phala',
  ionet: 'io.net',
  nosana: 'Nosana',
  docker: 'Docker',
};

export default function DeploymentsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [targetFilter, setTargetFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showWizard, setShowWizard] = useState(false);

  const filters = useMemo(
    () => ({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(targetFilter ? { target: targetFilter } : {}),
    }),
    [statusFilter, targetFilter],
  );

  const { data, loading, error } = useDeployments(filters);
  const { data: caps } = useAgentCapabilities();

  const deployments = useMemo(() => {
    const items = data?.deployments ?? [];
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (d: any) =>
        d.agent_passport_id?.toLowerCase().includes(q) ||
        d.deployment_target?.toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Deployments</h1>
        <button
          onClick={() => setShowWizard(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition"
        >
          Deploy Agent
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by passport ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="running">Running</option>
          <option value="deploying">Deploying</option>
          <option value="stopped">Stopped</option>
          <option value="failed">Failed</option>
          <option value="terminated">Terminated</option>
        </select>
        <select
          value={targetFilter}
          onChange={(e) => setTargetFilter(e.target.value)}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
        >
          <option value="">All targets</option>
          {(caps?.capabilities?.targets ?? ['railway', 'akash', 'phala', 'ionet', 'nosana', 'docker']).map(
            (t: string) => (
              <option key={t} value={t}>
                {targetLabels[t] ?? t}
              </option>
            ),
          )}
        </select>
      </div>

      {/* Table */}
      {loading && !data ? (
        <p className="text-gray-500">Loading deployments...</p>
      ) : error ? (
        <p className="text-red-400">{error.message}</p>
      ) : deployments.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-8 text-center">
          <p className="text-gray-400">No deployments found.</p>
          <button
            onClick={() => setShowWizard(true)}
            className="mt-3 text-sm text-blue-400 hover:text-blue-300"
          >
            Deploy your first agent
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-800 text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Health</th>
                <th className="px-4 py-3 font-medium">Adapter</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {deployments.map((d: any) => (
                <tr key={d.id} className="hover:bg-gray-900/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/deployments/${d.agent_passport_id}`}
                      className="font-mono text-xs text-blue-400 hover:text-blue-300"
                    >
                      {d.agent_passport_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-gray-800 px-2 py-0.5 text-xs">
                      {targetLabels[d.deployment_target] ?? d.deployment_target}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${statusColors[d.status] ?? 'bg-gray-700/50 text-gray-400'}`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={healthColors[d.health_status] ?? 'text-gray-500'}>
                      {d.health_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{d.runtime_adapter ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {d.created_at ? new Date(d.created_at * 1000).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/deployments/${d.agent_passport_id}`}
                      className="rounded bg-blue-600/20 px-2 py-0.5 text-xs text-blue-400 hover:bg-blue-600/30"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showWizard && <ProviderWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}
