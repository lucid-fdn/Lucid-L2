'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAgents } from '@/hooks/useLucidApi';

export default function AgentsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, loading, error } = useAgents(page);

  const agents = data?.items ?? [];
  const pagination = data?.pagination;

  const filtered = search
    ? agents.filter(
        (a: any) =>
          a.name?.toLowerCase().includes(search.toLowerCase()) ||
          a.passport_id?.includes(search),
      )
    : agents;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agents</h1>
        <input
          type="text"
          placeholder="Search agents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {loading && <p className="text-gray-500">Loading agents...</p>}
      {error && <p className="text-red-400">Error: {error.message}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-800 text-gray-500">
            <tr>
              <th className="pb-3 font-medium">Name</th>
              <th className="pb-3 font-medium">Type</th>
              <th className="pb-3 font-medium">Owner</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {filtered.map((agent: any) => (
              <tr key={agent.passport_id} className="hover:bg-gray-900/30">
                <td className="py-3">
                  <Link
                    href={`/dashboard/agents/${agent.passport_id}`}
                    className="text-blue-400 hover:underline"
                  >
                    {agent.name || agent.passport_id.slice(0, 16)}
                  </Link>
                </td>
                <td className="py-3 text-gray-400">{agent.type}</td>
                <td className="py-3 font-mono text-xs text-gray-500">
                  {agent.owner?.slice(0, 8)}...{agent.owner?.slice(-6)}
                </td>
                <td className="py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      agent.status === 'active'
                        ? 'bg-green-400/10 text-green-400'
                        : 'bg-gray-700/50 text-gray-400'
                    }`}
                  >
                    {agent.status}
                  </span>
                </td>
                <td className="py-3 text-gray-500">
                  {new Date(agent.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.total_pages > 1 && (
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={!pagination.has_prev}
            className="rounded bg-gray-800 px-3 py-1 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.total_pages}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={!pagination.has_next}
            className="rounded bg-gray-800 px-3 py-1 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
