import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { initSchema, migrateIfNeeded, CURRENT_SCHEMA_VERSION } from '../store/sqlite/schema';

describe('SQLite Schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    sqliteVec.load(db);
  });

  afterEach(() => db.close());

  test('initSchema creates all tables on fresh DB', () => {
    initSchema(db, 1536);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all();
    const names = tables.map((t: any) => t.name);
    expect(names).toContain('memory_entries');
    expect(names).toContain('memory_sessions');
    expect(names).toContain('memory_provenance');
    expect(names).toContain('memory_snapshots');
    expect(names).toContain('memory_outbox');
  });

  test('initSchema sets user_version to 3', () => {
    initSchema(db, 1536);
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(CURRENT_SCHEMA_VERSION);
  });

  test('migrateIfNeeded is idempotent on current version', () => {
    initSchema(db, 1536);
    migrateIfNeeded(db);
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(CURRENT_SCHEMA_VERSION);
  });

  test('WAL mode can be set on file-based DB', () => {
    // In-memory DBs always report journal_mode=memory, so use a temp file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-schema-'));
    const tmpPath = path.join(tmpDir, 'test.db');
    const fileDb = new Database(tmpPath);
    try {
      fileDb.pragma('journal_mode = WAL');
      const mode = fileDb.pragma('journal_mode', { simple: true });
      expect(mode).toBe('wal');
    } finally {
      fileDb.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
