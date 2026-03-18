import { StoreEntry, StoreOptions } from './types';

/**
 * Storage backend contract.
 * Implementations must handle concurrent writes safely.
 */
export interface IStore {
  /** Persist an entry to the store */
  put(entry: StoreEntry, opts?: StoreOptions): Promise<void>;
  /** Retrieve an entry by ID */
  get(id: string): Promise<StoreEntry | null>;
  /** Delete an entry */
  delete(id: string): Promise<boolean>;
}

export class InMemoryStore implements IStore {
  private data = new Map<string, StoreEntry>();

  async put(entry: StoreEntry): Promise<void> {
    this.data.set(entry.id, entry);
  }

  async get(id: string): Promise<StoreEntry | null> {
    return this.data.get(id) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    return this.data.delete(id);
  }
}
