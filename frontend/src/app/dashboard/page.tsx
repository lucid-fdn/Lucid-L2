'use client';

import { StatusCard } from '@/components/StatusCard';
import { useSystemStatus, useHealth } from '@/hooks/useLucidApi';

export default function DashboardOverview() {
  const { data: health } = useHealth();
  const { data: system } = useSystemStatus();

  const systemData = system?.system;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Overview</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="System"
          value={health?.status === 'ok' ? 'Online' : 'Offline'}
          status={health?.status === 'ok' ? 'healthy' : 'down'}
        />
        <StatusCard
          title="Agents"
          value={systemData?.agentCount ?? '...'}
          subtitle="Registered passports"
        />
        <StatusCard
          title="Receipts"
          value={systemData?.receiptCount ?? '...'}
          subtitle="Verified receipts"
        />
        <StatusCard
          title="Chains"
          value={systemData?.chainCount ?? '...'}
          subtitle="Connected chains"
        />
      </div>

      <div className="mt-8 rounded-lg border border-gray-800 bg-gray-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold">Getting Started</h2>
        <div className="space-y-2 text-sm text-gray-400">
          <p>View registered agents and their passport metadata in the <strong>Agents</strong> tab.</p>
          <p>Monitor receipt verification and proof status in <strong>Receipts</strong>.</p>
          <p>Track cross-chain reputation scores in <strong>Reputation</strong>.</p>
          <p>View epoch anchoring status and MMR roots in <strong>Epochs</strong>.</p>
          <p>Monitor multi-chain connectivity in <strong>Chains</strong>.</p>
        </div>
      </div>
    </div>
  );
}
