import type { IMemoryStore } from './interface';
import { InMemoryMemoryStore } from './in-memory';

export type { IMemoryStore, MemoryQuery, MemoryWriteResult, MemoryStats } from './interface';
export { InMemoryMemoryStore } from './in-memory';
export { PostgresMemoryStore } from './postgres';

// ─── Singleton for Postgres / InMemory (unchanged pattern) ────────────

let singletonStore: IMemoryStore | null = null;

export function getMemoryStore(): IMemoryStore {
  if (singletonStore) return singletonStore;
  const provider = process.env.MEMORY_STORE || 'memory';
  if (provider === 'sqlite') {
    throw new Error('SQLite mode requires per-agent store. Use getStoreForAgent(agentPassportId) instead.');
  }
  if (provider === 'postgres') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PostgresMemoryStore } = require('./postgres');
    singletonStore = new PostgresMemoryStore();
  } else {
    singletonStore = new InMemoryMemoryStore();
  }
  return singletonStore;
}

// ─── Per-agent SQLite store registry ──────────────────────────────────

const sqliteRegistry = new Map<string, IMemoryStore>();

export function getSQLiteStoreForAgent(agentPassportId: string): IMemoryStore {
  const existing = sqliteRegistry.get(agentPassportId);
  if (existing) return existing;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SQLiteMemoryStore } = require('./sqlite/store');
    const basePath = process.env.MEMORY_DB_PATH || './data/agents';
    const dbPath = `${basePath}/${agentPassportId}/memory.db`;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { mkdirSync } = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { dirname } = require('path');
    mkdirSync(dirname(dbPath), { recursive: true });
    const store = new SQLiteMemoryStore(dbPath);
    sqliteRegistry.set(agentPassportId, store);
    return store;
  } catch (err: any) {
    if (err.code === 'MODULE_NOT_FOUND') {
      throw new Error('SQLite store requires better-sqlite3 and sqlite-vec. Install: npm install better-sqlite3 sqlite-vec');
    }
    throw err;
  }
}

// ─── Unified resolver — works across all modes ───────────────────────

export function getStoreForAgent(agentPassportId: string): IMemoryStore {
  const provider = process.env.MEMORY_STORE || 'memory';
  if (provider === 'sqlite') return getSQLiteStoreForAgent(agentPassportId);
  return getMemoryStore(); // singleton for postgres/memory
}

// ─── Reset ────────────────────────────────────────────────────────────

export function resetMemoryStore(): void {
  singletonStore = null;
  for (const [, store] of sqliteRegistry) {
    if (typeof (store as any).close === 'function') (store as any).close();
  }
  sqliteRegistry.clear();
}
