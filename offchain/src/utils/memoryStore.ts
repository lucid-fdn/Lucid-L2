// offchain/src/utils/memoryStore.ts
import * as fs from 'fs';
import { MEMORY_WALLET_PATH } from './config';

export interface MemoryStore {
  [authority: string]: string; // authority -> hex root
}

export async function loadStore(): Promise<MemoryStore> {
  try {
    const data = fs.readFileSync(MEMORY_WALLET_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return empty store
    return {};
  }
}

export async function saveStore(store: MemoryStore): Promise<void> {
  fs.writeFileSync(MEMORY_WALLET_PATH, JSON.stringify(store, null, 2));
}
