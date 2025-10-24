// Storage Manager for Lucid L2 Browser Extension
// Provides versioned storage with automatic migration support

export interface StorageSchema {
  version: number;
  wallet: {
    address: string;
    publicKey?: string;
  } | null;
  balance: {
    mGas: number;
    lucid: number;
    sol: number;
  };
  dailyProgress: {
    completed: number;
    total: number;
  };
  streak: number;
  tasks: Array<{
    id: string;
    title: string;
    reward: number;
    completed: boolean;
  }>;
  history: Array<{
    text: string;
    response?: string;
    earned: number;
    timestamp: number;
    hash?: string;
    signature?: string;
    explorerUrl?: string;
    gasUsed?: any;
    qualityScore?: number;
    qualityTier?: string;
  }>;
  settings: {
    notifications: boolean;
    autoProcess: boolean;
  };
  conversionHistory: Array<{
    timestamp: number;
    mGasConverted: number;
    lucidReceived: number;
    txSignature: string;
  }>;
  unlockedAchievements: string[];
  totalShares: number;
  referralData: any;
  lastDailyReset: string | null;
}

class StorageManager {
  private currentVersion = 1;
  private storageKey = 'lucid_extension_data';

  /**
   * Initialize storage with default values
   */
  private getDefaultStorage(): StorageSchema {
    return {
      version: this.currentVersion,
      wallet: null,
      balance: {
        mGas: 0,
        lucid: 0,
        sol: 0
      },
      dailyProgress: {
        completed: 0,
        total: 10
      },
      streak: 0,
      tasks: [],
      history: [],
      settings: {
        notifications: true,
        autoProcess: false
      },
      conversionHistory: [],
      unlockedAchievements: [],
      totalShares: 0,
      referralData: null,
      lastDailyReset: null
    };
  }

  /**
   * Get raw storage data from chrome.storage.local
   */
  private async getRawStorage(): Promise<any> {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(null, (data) => {
          resolve(data || {});
        });
      } else {
        resolve({});
      }
    });
  }

  /**
   * Save raw storage data to chrome.storage.local
   */
  private async saveRawStorage(data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set(data, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } else {
        reject(new Error('Chrome storage API not available'));
      }
    });
  }

  /**
   * Migrate storage from one version to another
   */
  private async migrate(data: any, fromVersion: number): Promise<StorageSchema> {
    console.log(`🔄 Migrating storage from v${fromVersion} to v${this.currentVersion}`);

    // Apply migrations sequentially
    let migratedData = { ...data };

    // Migration from v0 (no version) to v1
    if (fromVersion < 1) {
      migratedData = await this.migrateV0toV1(migratedData);
    }

    // Add more migrations here as needed
    // if (fromVersion < 2) {
    //   migratedData = await this.migrateV1toV2(migratedData);
    // }

    migratedData.version = this.currentVersion;
    console.log('✅ Migration complete');
    return migratedData as StorageSchema;
  }

  /**
   * Migration: v0 to v1
   * Adds version tracking and ensures all required fields exist
   */
  private async migrateV0toV1(data: any): Promise<any> {
    const defaults = this.getDefaultStorage();
    
    return {
      ...defaults,
      ...data,
      version: 1,
      // Ensure balance has all required fields
      balance: {
        mGas: data.balance?.mGas ?? 0,
        lucid: data.balance?.lucid ?? 0,
        sol: data.balance?.sol ?? 0
      },
      // Ensure settings has all required fields
      settings: {
        notifications: data.settings?.notifications ?? true,
        autoProcess: data.settings?.autoProcess ?? false
      }
    };
  }

  /**
   * Get storage data with automatic migration
   */
  async getAll(): Promise<StorageSchema> {
    const rawData = await this.getRawStorage();
    const currentVersion = rawData.version || 0;

    // If version matches, return data as-is
    if (currentVersion === this.currentVersion) {
      return rawData as StorageSchema;
    }

    // Otherwise, migrate
    const migratedData = await this.migrate(rawData, currentVersion);
    await this.saveRawStorage(migratedData);
    return migratedData;
  }

  /**
   * Get a specific key from storage
   */
  async get<K extends keyof StorageSchema>(key: K): Promise<StorageSchema[K]> {
    const data = await this.getAll();
    return data[key];
  }

  /**
   * Set a specific key in storage
   */
  async set<K extends keyof StorageSchema>(
    key: K,
    value: StorageSchema[K]
  ): Promise<void> {
    const data = await this.getAll();
    data[key] = value;
    await this.saveRawStorage(data);
  }

  /**
   * Update multiple keys at once
   */
  async update(updates: Partial<StorageSchema>): Promise<void> {
    const data = await this.getAll();
    const updatedData = { ...data, ...updates };
    await this.saveRawStorage(updatedData);
  }

  /**
   * Clear all storage data
   */
  async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.clear(() => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            console.log('🧹 Storage cleared');
            resolve();
          }
        });
      } else {
        reject(new Error('Chrome storage API not available'));
      }
    });
  }

  /**
   * Reset storage to default values
   */
  async reset(): Promise<void> {
    const defaults = this.getDefaultStorage();
    await this.saveRawStorage(defaults);
    console.log('🔄 Storage reset to defaults');
  }

  /**
   * Export storage data as JSON
   */
  async export(): Promise<string> {
    const data = await this.getAll();
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import storage data from JSON
   */
  async import(jsonData: string): Promise<void> {
    try {
      const data = JSON.parse(jsonData);
      // Validate and migrate if needed
      const currentVersion = data.version || 0;
      const migratedData = await this.migrate(data, currentVersion);
      await this.saveRawStorage(migratedData);
      console.log('✅ Storage imported successfully');
    } catch (error) {
      throw new Error(`Failed to import storage: ${error}`);
    }
  }

  /**
   * Get storage usage statistics
   */
  async getStats(): Promise<{
    bytesInUse: number;
    itemCount: number;
    version: number;
  }> {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.getBytesInUse(null, (bytes) => {
          chrome.storage.local.get(null, (data) => {
            resolve({
              bytesInUse: bytes,
              itemCount: Object.keys(data).length,
              version: data.version || 0
            });
          });
        });
      } else {
        resolve({ bytesInUse: 0, itemCount: 0, version: 0 });
      }
    });
  }
}

// Export singleton instance
export const storage = new StorageManager();

// Export class for testing
export { StorageManager };
