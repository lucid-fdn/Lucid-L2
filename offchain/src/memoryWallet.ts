import { promises as fs } from 'fs';
import path from 'path';

const FILE = path.resolve(__dirname, '../memory-wallet.json');
export interface MemoryStore { [k: string]: string; }

export async function loadStore(): Promise<MemoryStore> {
  try { return JSON.parse(await fs.readFile(FILE, 'utf8')); }
  catch { return {}; }
}

export async function saveStore(store: MemoryStore): Promise<void> {
  await fs.writeFile(FILE, JSON.stringify(store, null, 2));
}

export async function upsertMemoryMap(data: { authority: string; rootHex: string }): Promise<void> {
  const store = await loadStore();
  store[data.authority] = data.rootHex;
  await saveStore(store);
}
