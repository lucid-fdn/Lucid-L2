import type { MemoryEntry } from '../types';

export function applyContentFilter(entries: MemoryEntry[], query: string): MemoryEntry[] {
  const lower = query.toLowerCase();
  return entries.filter(e => e.content.toLowerCase().includes(lower));
}
