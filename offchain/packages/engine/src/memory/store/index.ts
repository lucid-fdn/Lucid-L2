import type { IMemoryStore } from './interface';
import { InMemoryMemoryStore } from './in-memory';

export type { IMemoryStore, MemoryQuery, MemoryWriteResult, MemoryStats } from './interface';
export { InMemoryMemoryStore } from './in-memory';
export { PostgresMemoryStore } from './postgres';

let storeInstance: IMemoryStore | null = null;

export function getMemoryStore(): IMemoryStore {
  if (storeInstance) return storeInstance;
  const provider = process.env.MEMORY_STORE || 'memory';
  if (provider === 'postgres') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PostgresMemoryStore } = require('./postgres');
    storeInstance = new PostgresMemoryStore();
  } else {
    storeInstance = new InMemoryMemoryStore();
  }
  return storeInstance;
}

export function resetMemoryStore(): void {
  storeInstance = null;
}
