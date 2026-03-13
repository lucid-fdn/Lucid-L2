import type { MemoryEntry } from '../types';

const DECAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function rankByRecency(entries: MemoryEntry[], now: number): (MemoryEntry & { score: number })[] {
  return entries.map(e => ({
    ...e,
    score: Math.max(0, 1 - (now - e.created_at) / DECAY_WINDOW_MS),
  }));
}

export function combinedScore(recency: number, relevance: number, weights = { recency: 0.4, relevance: 0.6 }): number {
  return Math.min(1, weights.recency * recency + weights.relevance * relevance);
}
