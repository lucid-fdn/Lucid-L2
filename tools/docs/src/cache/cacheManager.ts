import * as fs from 'fs';
import * as path from 'path';
import type { CacheData } from '../extract/types';

export function readCache(cachePath: string): CacheData {
  try {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as CacheData;
  } catch {
    return {};
  }
}

export function writeCache(cachePath: string, data: CacheData): void {
  const dir = path.dirname(cachePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}
