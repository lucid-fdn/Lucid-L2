import { IStore } from './store';
import { StoreEntry } from './types';

/** Orchestrates entry lifecycle operations */
export class EntryService {
  constructor(private readonly store: IStore) {}

  async create(data: unknown): Promise<StoreEntry> {
    const entry: StoreEntry = { id: String(Date.now()), data, createdAt: new Date() };
    await this.store.put(entry);
    return entry;
  }

  async remove(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
