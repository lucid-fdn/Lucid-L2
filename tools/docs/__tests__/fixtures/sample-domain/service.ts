import { IStore } from './store';
import { StoreEntry } from './types';

// Simulates a cross-domain import
import { sha256 } from '../fake-shared/crypto';

/**
 * Create a new entry with a computed hash.
 * @param store - The storage backend
 * @param data - Raw data to store
 * @returns The stored entry with generated ID
 */
export async function createEntry(
  store: IStore,
  data: unknown
): Promise<StoreEntry> {
  const id = sha256(JSON.stringify(data));
  const entry: StoreEntry = { id, data, createdAt: new Date() };
  await store.put(entry);
  return entry;
}

/** Verify an entry exists in the store */
export async function verifyEntry(
  store: IStore,
  id: string
): Promise<boolean> {
  const entry = await store.get(id);
  return entry !== null;
}
