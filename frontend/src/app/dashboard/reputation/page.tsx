'use client';

import { useState, useCallback } from 'react';
import { usePolling } from '@/hooks/usePolling';
import * as api from '@/lib/api';

export default function ReputationPage() {
  const [selectedAlgo, setSelectedAlgo] = useState<string | null>(null);

  const algoFetcher = useCallback(() => api.getReputationAlgorithms(), []);
  const { data: algoData } = usePolling(algoFetcher, 60_000);

  const agentsFetcher = useCallback(() => api.getAgents(1, 50), []);
  const { data: agentsData, loading } = usePolling(agentsFetcher, 15_000);

  const algorithms = algoData?.algorithms ?? [];
  const agents = agentsData?.items ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Reputation</h1>

      {/* Algorithm selector */}
      {algorithms.length > 0 && (
        <div className="mb-6">
          <label className="mb-2 block text-sm text-gray-500">Scoring Algorithm</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedAlgo(null)}
              className={`rounded-full px-3 py-1 text-sm ${
                !selectedAlgo ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
              }`}
            >
              Default
            </button>
            {algorithms.map((algo: any) => (
              <button
                key={algo.id}
                onClick={() => setSelectedAlgo(algo.id)}
                className={`rounded-full px-3 py-1 text-sm ${
                  selectedAlgo === algo.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400'
                }`}
              >
                {algo.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/50">
        <div className="border-b border-gray-800 p-4">
          <h2 className="font-semibold">Agent Leaderboard</h2>
        </div>

        {loading && <p className="p-4 text-gray-500">Loading...</p>}

        <div className="divide-y divide-gray-800/50">
          {agents.map((agent: any, idx: number) => (
            <div
              key={agent.passport_id}
              className="flex items-center justify-between p-4 hover:bg-gray-900/30"
            >
              <div className="flex items-center gap-4">
                <span className="text-lg font-bold text-gray-600">#{idx + 1}</span>
                <div>
                  <p className="font-medium">{agent.name || agent.passport_id.slice(0, 16)}</p>
                  <p className="text-xs text-gray-500">{agent.type}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-blue-400">
                  {agent.metadata?.reputation?.overall ?? '--'}
                </p>
                <p className="text-xs text-gray-500">Score</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
