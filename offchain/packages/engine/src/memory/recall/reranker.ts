import type { MemoryEntry } from '../types';
import { classifyQueryIntent } from './intentClassifier';

export interface RerankConfig {
  similarity_weight: number;
  recency_weight: number;
  type_weight: number;
  quality_weight: number;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function recencyScore(created_at: number): number {
  const age = Date.now() - created_at;
  return Math.max(0, 1 - age / THIRTY_DAYS_MS);
}

function qualityScore(entry: MemoryEntry): number {
  if ((entry as any).confidence !== undefined) return (entry as any).confidence;
  if ((entry as any).priority !== undefined) return Math.min((entry as any).priority / 10, 1);
  return 0.5;
}

export function rerankCandidates(
  candidates: (MemoryEntry & { similarity: number })[],
  query: string,
  weights: RerankConfig,
): (MemoryEntry & { similarity: number; score: number })[] {
  const intent = classifyQueryIntent(query);

  const scored = candidates.map(entry => {
    const sim = entry.similarity;
    const recency = recencyScore(entry.created_at);

    // Type bonus with overfitting guard
    const rawTypeBonus = intent.type_boosts[entry.type] || 0;
    const effectiveTypeBonus = Math.min(rawTypeBonus, sim);

    // Lane bonus with overfitting guard
    const lane = (entry as any).memory_lane || 'self';
    const rawLaneBonus = intent.lane_boosts[lane] || 0;
    const effectiveLaneBonus = Math.min(rawLaneBonus, sim);

    const quality = qualityScore(entry);

    // Design: lane_bonus and type_bonus share the same weight bucket (type_weight).
    // This is intentional — both are "intent alignment" signals, so they compete
    // for the same 0.15 slice of the score rather than inflating overall weight.
    // Combined max = type_weight * (0.3 + 0.2) = 0.15 * 0.5 = 0.075.
    const score =
      weights.similarity_weight * sim
      + weights.recency_weight * recency
      + weights.type_weight * (effectiveTypeBonus + effectiveLaneBonus)
      + weights.quality_weight * quality;

    return { ...entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
