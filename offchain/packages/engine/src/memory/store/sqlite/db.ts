import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

export interface SQLiteDBOptions {
  walMode?: boolean;     // default true
  dimensions?: number;   // default 1536
}

/**
 * Open (or create) a SQLite database with WAL mode, foreign keys,
 * and the sqlite-vec extension loaded.
 */
export function openMemoryDB(dbPath: string, options?: SQLiteDBOptions): Database.Database {
  const db = new Database(dbPath);

  if (options?.walMode !== false) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }

  db.pragma('foreign_keys = ON');

  // Load sqlite-vec for vector search support
  sqliteVec.load(db);

  return db;
}
