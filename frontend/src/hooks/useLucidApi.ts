'use client';

import { useCallback } from 'react';
import { usePolling } from './usePolling';
import * as api from '../lib/api';

export function useChainStatus(intervalMs = 15_000) {
  const fetcher = useCallback(() => api.getChainStatus(), []);
  return usePolling(fetcher, intervalMs);
}

export function useAgents(page = 1, perPage = 20, intervalMs = 10_000) {
  const fetcher = useCallback(() => api.getAgents(page, perPage), [page, perPage]);
  return usePolling(fetcher, intervalMs);
}

export function useAgent(id: string, intervalMs = 10_000) {
  const fetcher = useCallback(() => api.getAgent(id), [id]);
  return usePolling(fetcher, intervalMs);
}

export function useReceipts(intervalMs = 10_000) {
  const fetcher = useCallback(() => api.getReceipts(), []);
  return usePolling(fetcher, intervalMs);
}

export function useReputation(agentId: string, intervalMs = 30_000) {
  const fetcher = useCallback(() => api.getReputation(agentId), [agentId]);
  return usePolling(fetcher, intervalMs);
}

export function useEpochs(intervalMs = 15_000) {
  const fetcher = useCallback(() => api.getEpochs(), []);
  return usePolling(fetcher, intervalMs);
}

export function useSystemStatus(intervalMs = 15_000) {
  const fetcher = useCallback(() => api.getSystemStatus(), []);
  return usePolling(fetcher, intervalMs);
}

export function useHealth(intervalMs = 30_000) {
  const fetcher = useCallback(() => api.getHealth(), []);
  return usePolling(fetcher, intervalMs);
}
