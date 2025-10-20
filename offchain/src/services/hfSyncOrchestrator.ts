// services/hfSyncOrchestrator.ts
import pLimit from 'p-limit';
import axios from 'axios';
import { getSyncStateManager, SyncStateManager } from './syncStateManager';
import { getHFBridgeService, HFBridgeService } from './hfBridgeService';

export interface SyncOptions {
    types: Array<'models' | 'datasets' | 'all'>;
    batchSize: number;
    concurrency: number;
    llmProxyUrl?: string;
    checkpointInterval?: number; // Save checkpoint every N assets
    maxRetries?: number;
}

export class HFSyncOrchestrator {
    private stateManager: SyncStateManager;
    private hfBridge: HFBridgeService;
    private isRunning: boolean = false;
    private shouldStop: boolean = false;

    constructor(llmProxyUrl: string = 'http://localhost:8000') {
        this.stateManager = getSyncStateManager();
        this.hfBridge = getHFBridgeService(llmProxyUrl);
    }

    /**
     * Start comprehensive sync of all HuggingFace assets
     */
    async startFullSync(options: SyncOptions): Promise<void> {
        if (this.isRunning) {
            throw new Error('Sync is already running');
        }

        this.isRunning = true;
        this.shouldStop = false;

        console.log('\n🚀 Starting Comprehensive HuggingFace Passport Sync');
        console.log('================================================');

        try {
            // Load or create state
            await this.stateManager.load();

            const types = options.types.includes('all')
                ? ['models', 'datasets']
                : options.types;

            // Sync models
            if (types.includes('models')) {
                await this.syncModels(options);
            }

            // Sync datasets
            if (types.includes('datasets')) {
                await this.syncDatasets(options);
            }

            // Final checkpoint
            await this.stateManager.save();
            await this.stateManager.createCheckpoint();

            console.log('\n✅ Sync completed successfully!');
            this.printFinalReport();
        } catch (error) {
            console.error('\n❌ Sync failed:', error);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Sync models from HuggingFace
     */
    private async syncModels(options: SyncOptions): Promise<void> {
        console.log('\n📚 Syncing Models...');

        const state = this.stateManager.getState();
        let offset = state.models.pagination.offset;

        while (state.models.pagination.hasMore && !this.shouldStop) {
            try {
                // Fetch batch from llm_proxy
                const models = await this.fetchModelsBatch(
                    options.batchSize,
                    offset,
                    options.llmProxyUrl
                );

                if (models.length === 0) {
                    this.stateManager.updateModels({ 
                        pagination: { ...state.models.pagination, hasMore: false } 
                    });
                    break;
                }

                // Update total count on first batch
                if (offset === 0 && models.length > 0) {
                    // Estimate total based on first batch
                    const estimatedTotal = Math.min(models.length * 1000, 200000);
                    this.stateManager.updateModels({ total: estimatedTotal });
                }

                console.log(`\n📦 Processing batch: ${offset}-${offset + models.length}`);

                // Process batch with concurrency control
                const results = await this.processBatch(
                    models,
                    'model',
                    options.concurrency
                );

                // Update state
                const successCount = results.filter((r) => r.success).length;
                const failedCount = results.filter((r) => !r.success).length;

                this.stateManager.updateModels({
                    synced: state.models.synced + successCount,
                    failed: state.models.failed + failedCount,
                    lastProcessedId: models[models.length - 1]?.name || '',
                    pagination: {
                        offset: offset + models.length,
                        hasMore: models.length >= options.batchSize,
                    },
                });

                offset += models.length;

                // Calculate and save metrics
                this.stateManager.calculateMetrics();
                await this.stateManager.save();

                // Checkpoint if needed
                if (
                    options.checkpointInterval &&
                    state.models.synced % options.checkpointInterval === 0
                ) {
                    await this.stateManager.createCheckpoint();
                }

                // Print progress
                this.printProgress();

            } catch (error) {
                console.error(`Error processing models batch at offset ${offset}:`, error);
                // Continue with next batch
                offset += options.batchSize;
            }
        }

        console.log('\n✅ Model sync completed');
    }

    /**
     * Sync datasets from HuggingFace
     */
    private async syncDatasets(options: SyncOptions): Promise<void> {
        console.log('\n📊 Syncing Datasets...');

        const state = this.stateManager.getState();
        let offset = state.datasets.pagination.offset;

        while (state.datasets.pagination.hasMore && !this.shouldStop) {
            try {
                // Fetch batch from llm_proxy
                const datasets = await this.fetchDatasetsBatch(
                    options.batchSize,
                    offset,
                    options.llmProxyUrl
                );

                if (datasets.length === 0) {
                    this.stateManager.updateDatasets({ 
                        pagination: { ...state.datasets.pagination, hasMore: false } 
                    });
                    break;
                }

                // Update total count on first batch
                if (offset === 0 && datasets.length > 0) {
                    const estimatedTotal = Math.min(datasets.length * 100, 20000);
                    this.stateManager.updateDatasets({ total: estimatedTotal });
                }

                console.log(`\n📦 Processing batch: ${offset}-${offset + datasets.length}`);

                // Process batch with concurrency control
                const results = await this.processBatch(
                    datasets,
                    'dataset',
                    options.concurrency
                );

                // Update state
                const successCount = results.filter((r) => r.success).length;
                const failedCount = results.filter((r) => !r.success).length;

                this.stateManager.updateDatasets({
                    synced: state.datasets.synced + successCount,
                    failed: state.datasets.failed + failedCount,
                    lastProcessedId: datasets[datasets.length - 1]?.name || '',
                    pagination: {
                        offset: offset + datasets.length,
                        hasMore: datasets.length >= options.batchSize,
                    },
                });

                offset += datasets.length;

                // Calculate and save metrics
                this.stateManager.calculateMetrics();
                await this.stateManager.save();

                // Checkpoint if needed
                if (
                    options.checkpointInterval &&
                    state.datasets.synced % options.checkpointInterval === 0
                ) {
                    await this.stateManager.createCheckpoint();
                }

                // Print progress
                this.printProgress();

            } catch (error) {
                console.error(`Error processing datasets batch at offset ${offset}:`, error);
                offset += options.batchSize;
            }
        }

        console.log('\n✅ Dataset sync completed');
    }

    /**
     * Fetch models batch from llm_proxy with pagination
     */
    private async fetchModelsBatch(
        limit: number,
        offset: number,
        llmProxyUrl?: string
    ): Promise<any[]> {
        const url = llmProxyUrl || 'http://localhost:8000';
        try {
            const response = await axios.get(`${url}/models`, {
                params: { limit, offset },
                timeout: 30000,
            });
            return response.data || [];
        } catch (error) {
            console.error(`Failed to fetch models batch at offset ${offset}:`, error);
            return [];
        }
    }

    /**
     * Fetch datasets batch from llm_proxy with pagination
     */
    private async fetchDatasetsBatch(
        limit: number,
        offset: number,
        llmProxyUrl?: string
    ): Promise<any[]> {
        const url = llmProxyUrl || 'http://localhost:8000';
        try {
            const response = await axios.get(`${url}/datasets`, {
                params: { limit, offset },
                timeout: 30000,
            });
            return response.data || [];
        } catch (error) {
            console.error(`Failed to fetch datasets batch at offset ${offset}:`, error);
            return [];
        }
    }

    /**
     * Process a batch of assets with concurrency control
     */
    private async processBatch(
        assets: any[],
        type: 'model' | 'dataset',
        concurrency: number
    ): Promise<Array<{ name: string; success: boolean; error?: string }>> {
        const limit = pLimit(concurrency);
        const results: Array<{ name: string; success: boolean; error?: string }> = [];

        const tasks = assets.map((asset) =>
            limit(async () => {
                try {
                    if (type === 'model') {
                        await this.hfBridge.registerModelPassport(asset);
                    } else {
                        await this.hfBridge.registerDatasetPassport(asset);
                    }

                    results.push({ name: asset.name, success: true });
                    this.stateManager.removeFailedAsset(asset.name, type);
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    results.push({ name: asset.name, success: false, error: errorMsg });
                    this.stateManager.addFailedAsset(asset.name, type, errorMsg);
                }
            })
        );

        await Promise.all(tasks);
        return results;
    }

    /**
     * Resume sync from last checkpoint
     */
    async resume(options?: Partial<SyncOptions>): Promise<void> {
        console.log('\n🔄 Resuming sync from last checkpoint...');

        const defaultOptions: SyncOptions = {
            types: ['all'],
            batchSize: 100,
            concurrency: 10,
            checkpointInterval: 100,
            maxRetries: 3,
        };

        const mergedOptions = { ...defaultOptions, ...options };

        await this.startFullSync(mergedOptions);
    }

    /**
     * Retry failed assets
     */
    async retryFailed(maxAttempts: number = 3, concurrency: number = 5): Promise<void> {
        console.log('\n🔁 Retrying failed assets...');

        const retryable = this.stateManager.getRetryableAssets(maxAttempts);

        if (retryable.length === 0) {
            console.log('No retryable assets found');
            return;
        }

        console.log(`Found ${retryable.length} assets to retry`);

        // Group by type
        const models = retryable.filter((a) => a.type === 'model');
        const datasets = retryable.filter((a) => a.type === 'dataset');

        // Retry models
        if (models.length > 0) {
            console.log(`\nRetrying ${models.length} models...`);
            // Fetch fresh data and retry
            // This is simplified - in production, you'd fetch the actual asset data
            for (const model of models) {
                try {
                    // Would fetch and retry here
                    console.log(`Retrying model: ${model.name}`);
                } catch (error) {
                    console.error(`Retry failed for ${model.name}:`, error);
                }
            }
        }

        // Retry datasets
        if (datasets.length > 0) {
            console.log(`\nRetrying ${datasets.length} datasets...`);
            for (const dataset of datasets) {
                try {
                    console.log(`Retrying dataset: ${dataset.name}`);
                } catch (error) {
                    console.error(`Retry failed for ${dataset.name}:`, error);
                }
            }
        }

        await this.stateManager.save();
    }

    /**
     * Stop sync gracefully
     */
    stop(): void {
        console.log('\n⏸️  Stopping sync gracefully...');
        this.shouldStop = true;
    }

    /**
     * Get current progress
     */
    getProgress() {
        return this.stateManager.getProgress();
    }

    /**
     * Get sync status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            state: this.stateManager.getState(),
            progress: this.stateManager.getProgress(),
        };
    }

    /**
     * Print progress to console
     */
    private printProgress(): void {
        const progress = this.stateManager.getProgress();
        const state = this.stateManager.getState();

        console.log('\n📊 Progress Update:');
        console.log('─────────────────────────────────────────');
        console.log(`Models:   ${progress.models.synced}/${progress.models.total} (${progress.models.progress})`);
        console.log(`Datasets: ${progress.datasets.synced}/${progress.datasets.total} (${progress.datasets.progress})`);
        console.log(`Overall:  ${progress.overall.synced}/${progress.overall.total} (${progress.overall.progress})`);
        console.log(`Failed:   ${progress.failed}`);
        console.log(`Speed:    ${progress.throughput} assets/min`);
        if (progress.eta) {
            const eta = new Date(progress.eta);
            console.log(`ETA:      ${eta.toLocaleString()}`);
        }
        console.log('─────────────────────────────────────────\n');
    }

    /**
     * Print final report
     */
    private printFinalReport(): void {
        const state = this.stateManager.getState();
        const progress = this.stateManager.getProgress();

        console.log('\n📋 Final Report');
        console.log('================================================');
        console.log(`Total Synced: ${progress.overall.synced}`);
        console.log(`  - Models:   ${state.models.synced}`);
        console.log(`  - Datasets: ${state.datasets.synced}`);
        console.log(`Total Failed: ${progress.failed}`);
        console.log(`Average Speed: ${progress.throughput} assets/min`);
        console.log(`Total Transactions: ${state.statistics.totalTransactions}`);
        console.log(`Start Time: ${new Date(state.statistics.startTime).toLocaleString()}`);
        console.log(`End Time: ${new Date().toLocaleString()}`);
        
        const duration = Date.now() - new Date(state.statistics.startTime).getTime();
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
        console.log(`Duration: ${hours}h ${minutes}m`);
        console.log('================================================\n');
    }

    /**
     * Generate detailed report
     */
    generateReport() {
        const state = this.stateManager.getState();
        const progress = this.stateManager.getProgress();

        return {
            summary: {
                totalSynced: progress.overall.synced,
                totalFailed: progress.failed,
                successRate: (
                    (progress.overall.synced / (progress.overall.synced + progress.failed)) *
                    100
                ).toFixed(2),
            },
            models: {
                synced: state.models.synced,
                failed: state.models.failed,
                total: state.models.total,
                progress: progress.models.progress,
            },
            datasets: {
                synced: state.datasets.synced,
                failed: state.datasets.failed,
                total: state.datasets.total,
                progress: progress.datasets.progress,
            },
            performance: {
                throughput: progress.throughput,
                avgProcessingTime: state.statistics.avgProcessingTime,
                totalTransactions: state.statistics.totalTransactions,
            },
            timing: {
                startTime: state.statistics.startTime,
                lastUpdate: state.statistics.lastUpdateTime,
                estimatedCompletion: progress.eta,
            },
            errors: {
                count: state.failedAssets.length,
                topErrors: this.getTopErrors(state.failedAssets),
            },
        };
    }

    /**
     * Get top errors grouped by error message
     */
    private getTopErrors(failedAssets: any[]): Array<{ error: string; count: number }> {
        const errorCounts = new Map<string, number>();

        for (const asset of failedAssets) {
            const count = errorCounts.get(asset.error) || 0;
            errorCounts.set(asset.error, count + 1);
        }

        return Array.from(errorCounts.entries())
            .map(([error, count]) => ({ error, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }
}

// Export singleton instance
let orchestratorInstance: HFSyncOrchestrator | null = null;

export function getHFSyncOrchestrator(llmProxyUrl?: string): HFSyncOrchestrator {
    if (!orchestratorInstance) {
        orchestratorInstance = new HFSyncOrchestrator(llmProxyUrl);
    }
    return orchestratorInstance;
}
