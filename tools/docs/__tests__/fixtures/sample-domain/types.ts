/** Storage tier for DePIN uploads */
export type StorageTier = 'permanent' | 'evolving';

/** Compaction mode for memory cleanup */
export enum CompactionMode {
  /** Archive episodics past hot boundary */
  warm = 'warm',
  /** Hard-prune archived past retention */
  cold = 'cold',
  /** Both warm + cold */
  full = 'full',
}

export interface StoreEntry {
  id: string;
  data: unknown;
  /** When the entry was created */
  createdAt: Date;
}

export interface StoreOptions {
  maxRetries?: number;
  timeout?: number;
}
