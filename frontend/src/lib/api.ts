/**
 * Lucid API Client
 *
 * Typed fetch wrapper for the Lucid backend API.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.json();
}

// Health & System
export const getHealth = () => fetchApi<{ status: string }>('/health');
export const getSystemStatus = () =>
  fetchApi<{ success: boolean; system: any }>('/v1/system/status');

// Agents
export const getAgents = (page = 1, perPage = 20) =>
  fetchApi<{ success: boolean; items: any[]; pagination: any }>(
    `/v1/passports?type=agent&page=${page}&per_page=${perPage}`,
  );

export const getAgent = (id: string) =>
  fetchApi<{ success: boolean; passport: any }>(`/v1/passports/${id}`);

// Receipts
export const getReceipts = () =>
  fetchApi<{ success: boolean; receipts: any[] }>('/v1/receipts');

export const verifyReceipt = (runId: string) =>
  fetchApi<{ success: boolean; verification: any }>(`/v1/receipts/${runId}/verify`);

// Reputation
export const getReputation = (agentId: string) =>
  fetchApi<{ success: boolean; score: any }>(`/v1/reputation/${agentId}`);

export const getReputationAlgorithms = () =>
  fetchApi<{ success: boolean; algorithms: any[] }>('/v2/reputation/algorithms');

export const computeReputation = (agentId: string, algorithmId?: string) =>
  fetchApi<{ success: boolean; score: any }>(`/v2/reputation/${agentId}/compute`, {
    method: 'POST',
    body: JSON.stringify({ algorithmId }),
  });

// Epochs
export const getEpochs = () =>
  fetchApi<{ success: boolean; epochs: any[] }>('/v1/epochs');

export const getEpoch = (id: string) =>
  fetchApi<{ success: boolean; epoch: any }>(`/v1/epochs/${id}`);

// Chains
export const getChainStatus = () =>
  fetchApi<{ success: boolean; chains: any[] }>('/v1/chains/status');

// Identity Bridge
export const resolveIdentity = (caip10: string) =>
  fetchApi<{ success: boolean; linkedIdentities: any[] }>(
    `/v2/identity/resolve?caip10=${encodeURIComponent(caip10)}`,
  );

// Bridge
export const getBridgeQuote = (source: string, dest: string, amount: string) =>
  fetchApi<{ success: boolean; quote: any }>(
    `/v2/bridge/quote?sourceChainId=${source}&destChainId=${dest}&amount=${amount}`,
  );

// Deployments
export const getDeployments = (filters?: { status?: string; target?: string }) => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.target) params.set('target', filters.target);
  const qs = params.toString();
  return fetchApi<{ success: boolean; deployments: any[] }>(
    `/v1/agents/deployments${qs ? `?${qs}` : ''}`,
  );
};

export const getDeploymentStatus = (passportId: string) =>
  fetchApi<{ success: boolean; status: string; health: string; deployment_id: string; url?: string }>(
    `/v1/agents/${passportId}/status`,
  );

export const getDeploymentLogs = (passportId: string, tail = 100) =>
  fetchApi<{ success: boolean; logs: string }>(
    `/v1/agents/${passportId}/logs?tail=${tail}`,
  );

export const terminateDeployment = (passportId: string) =>
  fetchApi<{ success: boolean; message: string }>(
    `/v1/agents/${passportId}/terminate`,
    { method: 'POST' },
  );

export const getAgentCapabilities = () =>
  fetchApi<{ success: boolean; capabilities: { adapters: string[]; targets: string[] } }>(
    '/v1/agents/capabilities',
  );
