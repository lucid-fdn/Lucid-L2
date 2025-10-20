// services/syncStateManager.ts
import fs from 'fs/promises';
import path from 'path';

export interface SyncState {
    models: {
        total: number;
        synced: number;
        failed: number;
        lastProcessedId: string;
        checkpoint: string;
        pagination: {
            offset: number;
            hasMore: boolean;
        };
    };
    datasets: {
        total: number;
        synced: number;
        failed: number;
        lastProcessedId: string;
        checkpoint: string;
        pagination: {
            offset: number;
            hasMore: boolean;
        };
    };
    failedAssets: Array<{
        name: string;
        type: 'model' | 'dataset';
        error: string;
        attempts: number;
        lastAttempt: string;
    }>;
    statistics: {
        startTime: string;
        lastUpdateTime: string;
        estimatedCompletion: string | null;
        avgProcessingTime: number;
        throughput: number;
        totalTransactions: number;
        totalGasCost: number;
    };
}

const DEFAULT_STATE: SyncState = {
    models: {
        total: 0,
        synced: 0,
        failed: 0,
        lastProcessedId: '',
        checkpoint: new Date().toISOString(),
        pagination: {
            offset: 0,
            hasMore: true,
        },
    },
    datasets: {
        total: 0,
        synced: 0,
        failed: 0,
        lastProcessedId: '',
        checkpoint: new Date().toISOString(),
        pagination: {
            offset: 0,
            hasMore: true,
        },
    },
    failedAssets: [],
    statistics: {
        startTime: new Date().toISOString(),
        lastUpdateTime: new Date().toISOString(),
        estimatedCompletion: null,
        avgProcessingTime: 0,
        throughput: 0,
        totalTransactions: 0,
        totalGasCost: 0,
    },
};

export class SyncStateManager {
    private stateFilePath: string;
    private state: SyncState;

    constructor(stateFilePath: string = 'sync-state.json') {
        this.stateFilePath = path.join(process.cwd(), stateFilePath);
        this.state = { ...DEFAULT_STATE };
    }

    /**
     * Load state from file or create new state
     */
    async load(): Promise<SyncState> {
        try {
            const data = await fs.readFile(this.stateFilePath, 'utf-8');
            this.state = JSON.parse(data);
            console.log('📂 Loaded sync state from file');
            return this.state;
        } catch (error) {
            console.log('📝 No existing state found, starting fresh');
            this.state = { ...DEFAULT_STATE };
            await this.save();
            return this.state;
        }
    }

    /**
     * Save current state to file
     */
    async save(): Promise<void> {
        try {
            this.state.statistics.lastUpdateTime = new Date().toISOString();
            await fs.writeFile(
                this.stateFilePath,
                JSON.stringify(this.state, null, 2),
                'utf-8'
            );
        } catch (error) {
            console.error('❌ Failed to save sync state:', error);
            throw error;
        }
    }

    /**
     * Get current state
     */
    getState(): SyncState {
        return { ...this.state };
    }

    /**
     * Update models stats
     */
    updateModels(updates: Partial<SyncState['models']>): void {
        this.state.models = { ...this.state.models, ...updates };
    }

    /**
     * Update datasets stats
     */
    updateDatasets(updates: Partial<SyncState['datasets']>): void {
        this.state.datasets = { ...this.state.datasets, ...updates };
    }

    /**
     * Add failed asset
     */
    addFailedAsset(
        name: string,
        type: 'model' | 'dataset',
        error: string
    ): void {
        const existing = this.state.failedAssets.find(
            (a) => a.name === name && a.type === type
        );

        if (existing) {
            existing.attempts += 1;
            existing.lastAttempt = new Date().toISOString();
            existing.error = error;
        } else {
            this.state.failedAssets.push({
                name,
                type,
                error,
                attempts: 1,
                lastAttempt: new Date().toISOString(),
            });
        }
    }

    /**
     * Remove failed asset (after successful retry)
     */
    removeFailedAsset(name: string, type: 'model' | 'dataset'): void {
        this.state.failedAssets = this.state.failedAssets.filter(
            (a) => !(a.name === name && a.type === type)
        );
    }

    /**
     * Get failed assets that can be retried
     */
    getRetryableAssets(maxAttempts: number = 3): SyncState['failedAssets'] {
        return this.state.failedAssets.filter((a) => a.attempts < maxAttempts);
    }

    /**
     * Update statistics
     */
    updateStatistics(updates: Partial<SyncState['statistics']>): void {
        this.state.statistics = { ...this.state.statistics, ...updates };
    }

    /**
     * Calculate and update throughput metrics
     */
    calculateMetrics(): void {
        const totalSynced = this.state.models.synced + this.state.datasets.synced;
        const startTime = new Date(this.state.statistics.startTime).getTime();
        const now = Date.now();
        const elapsedMinutes = (now - startTime) / 1000 / 60;

        if (elapsedMinutes > 0) {
            const throughput = Math.round(totalSynced / elapsedMinutes);
            this.state.statistics.throughput = throughput;

            // Estimate completion
            const totalRemaining =
                (this.state.models.total - this.state.models.synced) +
                (this.state.datasets.total - this.state.datasets.synced);

            if (throughput > 0 && totalRemaining > 0) {
                const remainingMinutes = totalRemaining / throughput;
                const completionTime = new Date(now + remainingMinutes * 60 * 1000);
                this.state.statistics.estimatedCompletion = completionTime.toISOString();
            }
        }
    }

    /**
     * Get progress report
     */
    getProgress(): {
        models: { synced: number; total: number; progress: string };
        datasets: { synced: number; total: number; progress: string };
        overall: { synced: number; total: number; progress: string };
        failed: number;
        throughput: number;
        eta: string | null;
    } {
        const modelProgress =
            this.state.models.total > 0
                ? ((this.state.models.synced / this.state.models.total) * 100).toFixed(1)
                : '0.0';

        const datasetProgress =
            this.state.datasets.total > 0
                ? ((this.state.datasets.synced / this.state.datasets.total) * 100).toFixed(1)
                : '0.0';

        const totalSynced = this.state.models.synced + this.state.datasets.synced;
        const totalAssets = this.state.models.total + this.state.datasets.total;
        const overallProgress =
            totalAssets > 0
                ? ((totalSynced / totalAssets) * 100).toFixed(1)
                : '0.0';

        return {
            models: {
                synced: this.state.models.synced,
                total: this.state.models.total,
                progress: `${modelProgress}%`,
            },
            datasets: {
                synced: this.state.datasets.synced,
                total: this.state.datasets.total,
                progress: `${datasetProgress}%`,
            },
            overall: {
                synced: totalSynced,
                total: totalAssets,
                progress: `${overallProgress}%`,
            },
            failed: this.state.failedAssets.length,
            throughput: this.state.statistics.throughput,
            eta: this.state.statistics.estimatedCompletion,
        };
    }

    /**
     * Reset state
     */
    reset(): void {
        this.state = { ...DEFAULT_STATE };
        this.state.statistics.startTime = new Date().toISOString();
    }

    /**
     * Create checkpoint snapshot
     */
    async createCheckpoint(): Promise<void> {
        const checkpointPath = this.stateFilePath.replace('.json', `-checkpoint-${Date.now()}.json`);
        await fs.writeFile(
            checkpointPath,
            JSON.stringify(this.state, null, 2),
            'utf-8'
        );
        console.log(`💾 Checkpoint created: ${checkpointPath}`);
    }
}

// Export singleton instance
let stateManagerInstance: SyncStateManager | null = null;

export function getSyncStateManager(stateFilePath?: string): SyncStateManager {
    if (!stateManagerInstance) {
        stateManagerInstance = new SyncStateManager(stateFilePath);
    }
    return stateManagerInstance;
}
