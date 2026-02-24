'use client';

import { use } from 'react';
import Link from 'next/link';
import { useAgent, useReputation } from '@/hooks/useLucidApi';

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: agentData, loading, error } = useAgent(id);
  const { data: repData } = useReputation(id, 30_000);

  const agent = agentData?.passport;
  const reputation = repData?.score;

  if (loading) return <p className="text-gray-500">Loading agent...</p>;
  if (error) return <p className="text-red-400">Error: {error.message}</p>;
  if (!agent) return <p className="text-gray-500">Agent not found</p>;

  return (
    <div>
      <Link href="/dashboard/agents" className="mb-4 inline-block text-sm text-gray-500 hover:text-gray-300">
        &larr; Back to Agents
      </Link>

      <h1 className="mb-6 text-2xl font-bold">{agent.name || agent.passport_id}</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Passport Info */}
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="mb-4 text-lg font-semibold">Passport</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-gray-500">ID</dt>
              <dd className="font-mono text-xs">{agent.passport_id}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Type</dt>
              <dd>{agent.type}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Owner</dt>
              <dd className="font-mono text-xs">{agent.owner}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Status</dt>
              <dd>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    agent.status === 'active'
                      ? 'bg-green-400/10 text-green-400'
                      : 'bg-gray-700/50 text-gray-400'
                  }`}
                >
                  {agent.status}
                </span>
              </dd>
            </div>
            {agent.version && (
              <div>
                <dt className="text-gray-500">Version</dt>
                <dd>{agent.version}</dd>
              </div>
            )}
            {agent.tags?.length > 0 && (
              <div>
                <dt className="text-gray-500">Tags</dt>
                <dd className="flex flex-wrap gap-1">
                  {agent.tags.map((tag: string) => (
                    <span key={tag} className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                      {tag}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Reputation */}
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="mb-4 text-lg font-semibold">Reputation</h2>
          {reputation ? (
            <div>
              <div className="mb-4 text-center">
                <p className="text-4xl font-bold text-blue-400">{reputation.overall}</p>
                <p className="text-sm text-gray-500">Overall Score</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {reputation.components &&
                  Object.entries(reputation.components).map(([key, value]: [string, any]) => (
                    <div key={key} className="rounded bg-gray-800/50 p-2">
                      <p className="text-gray-500 capitalize">{key}</p>
                      <p className="font-bold">{typeof value === 'number' ? value.toFixed(1) : value}</p>
                    </div>
                  ))}
              </div>
              <div className="mt-4 space-y-1 text-xs text-gray-500">
                <p>Receipts: {reputation.receiptCount}</p>
                <p>Validated: {reputation.validatedCount}</p>
                <p>Avg TTFT: {reputation.avgTtftMs}ms</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">No reputation data</p>
          )}
        </div>
      </div>

      {/* Metadata */}
      {agent.metadata && (
        <div className="mt-6 rounded-lg border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="mb-4 text-lg font-semibold">Metadata</h2>
          <pre className="overflow-auto rounded bg-gray-800 p-4 text-xs text-gray-300">
            {JSON.stringify(agent.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
