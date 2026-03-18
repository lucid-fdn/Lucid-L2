import * as fs from 'fs';
import * as path from 'path';
import { readCache, writeCache } from '../../src/cache/cacheManager';
import type { CacheData } from '../../src/extract/types';

const TEST_CACHE_PATH = path.join(__dirname, 'test-hashes.json');

afterEach(() => {
  if (fs.existsSync(TEST_CACHE_PATH)) {
    fs.unlinkSync(TEST_CACHE_PATH);
  }
});

describe('readCache', () => {
  it('returns empty object when cache file does not exist', () => {
    const result = readCache(TEST_CACHE_PATH);
    expect(result).toEqual({});
  });

  it('returns empty object for corrupted (invalid JSON) cache file', () => {
    fs.writeFileSync(TEST_CACHE_PATH, '{ this is not valid json !!!', 'utf-8');
    const result = readCache(TEST_CACHE_PATH);
    expect(result).toEqual({});
  });

  it('returns empty object when file contains a non-object JSON value', () => {
    fs.writeFileSync(TEST_CACHE_PATH, '"just a string"', 'utf-8');
    expect(readCache(TEST_CACHE_PATH)).toEqual({});

    fs.writeFileSync(TEST_CACHE_PATH, '[1, 2, 3]', 'utf-8');
    expect(readCache(TEST_CACHE_PATH)).toEqual({});
  });
});

describe('writeCache + readCache (round-trip)', () => {
  it('writes and reads back cache data correctly', () => {
    const data: CacheData = {
      auth: { apiHash: 'aabbcc', contentHash: 'ddeeff' },
      memory: { apiHash: '112233', contentHash: '445566' },
    };

    writeCache(TEST_CACHE_PATH, data);
    const result = readCache(TEST_CACHE_PATH);

    expect(result).toEqual(data);
  });

  it('writes JSON with 2-space indent and trailing newline', () => {
    const data: CacheData = {
      epoch: { apiHash: 'abc', contentHash: 'def' },
    };

    writeCache(TEST_CACHE_PATH, data);
    const raw = fs.readFileSync(TEST_CACHE_PATH, 'utf-8');

    expect(raw).toBe(JSON.stringify(data, null, 2) + '\n');
  });

  it('creates parent directories that do not exist', () => {
    const nestedPath = path.join(__dirname, 'nested', 'deep', 'test-hashes.json');

    try {
      const data: CacheData = { domain: { apiHash: 'x', contentHash: 'y' } };
      writeCache(nestedPath, data);

      expect(fs.existsSync(nestedPath)).toBe(true);
      expect(readCache(nestedPath)).toEqual(data);
    } finally {
      // Clean up nested dirs
      fs.rmSync(path.join(__dirname, 'nested'), { recursive: true, force: true });
    }
  });

  it('overwrites existing cache with new data', () => {
    const initial: CacheData = { old: { apiHash: '000', contentHash: '111' } };
    const updated: CacheData = { new: { apiHash: 'aaa', contentHash: 'bbb' } };

    writeCache(TEST_CACHE_PATH, initial);
    writeCache(TEST_CACHE_PATH, updated);

    expect(readCache(TEST_CACHE_PATH)).toEqual(updated);
  });

  it('round-trips an empty cache object', () => {
    writeCache(TEST_CACHE_PATH, {});
    expect(readCache(TEST_CACHE_PATH)).toEqual({});
  });
});
