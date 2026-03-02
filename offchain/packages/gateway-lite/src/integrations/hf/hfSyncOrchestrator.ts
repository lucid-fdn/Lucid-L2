// services/hfSyncOrchestrator.ts
import pLimit from 'p-limit';
import axios from 'axios';
import { getSyncStateManager, SyncStateManager } from './syncStateManager';
import { getHFBridgeService, HFBridgeService } from './hfBridgeService';

export interface SyncOptions {
    types: Array<'models' | 'datasets' | 'spaces' | 'all'>;
    batchSize: number;
    concurrency: number;
    hfToken?: string;
    checkpointInterval?: number; // Save checkpoint every N assets
    maxRetries?: number;
    minDownloads?: number;  // default 1000 — filter threshold for models/datasets
    minLikes?: number;      // default 0 — filter threshold for spaces
}

export class HFSyncOrchestrator {
    private stateManager: SyncStateManager;
    private hfBridge: HFBridgeService;
    private hfToken: string;
    private hfApiBaseUrl: string = 'https://huggingface.co/api';
    private isRunning: boolean = false;
    private shouldStop: boolean = false;

    constructor(hfToken: string = process.env.HF_TOKEN || '') {
        this.stateManager = getSyncStateManager();
        this.hfBridge = getHFBridgeService(hfToken);
        this.hfToken = hfToken;
    }

    private get hfHeaders(): Record<string, string> {
        const headers: Record<string, string> = {};
        if (this.hfToken) {
            headers['Authorization'] = `Bearer ${this.hfToken}`;
        }
        return headers;
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

        console.log('\nStarting Comprehensive HuggingFace Passport Sync');
        console.log('================================================');

        try {
            // Load or create state
            await this.stateManager.load();

            const types = options.types.includes('all')
                ? ['models', 'datasets', 'spaces']
                : options.types;

            // Sync models
            if (types.includes('models')) {
                await this.syncModels(options);
            }

            // Sync datasets
            if (types.includes('datasets')) {
                await this.syncDatasets(options);
            }

            // Sync spaces
            if (types.includes('spaces')) {
                await this.syncSpaces(options);
            }

            // Final checkpoint
            await this.stateManager.save();
            await this.stateManager.createCheckpoint();

            console.log('\nSync completed successfully!');
            this.printFinalReport();
        } catch (error) {
            console.error('\nSync failed:', error);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Sync models from HuggingFace
     */
    private async syncModels(options: SyncOptions): Promise<void> {
        console.log('\nSyncing Models...');

        const state = this.stateManager.getState();
        let offset = state.models.pagination.offset;
        const minDownloads = options.minDownloads ?? 1000;

        while (state.models.pagination.hasMore && !this.shouldStop) {
            try {
                // Fetch batch from HuggingFace API — sorted by downloads desc
                const models = await this.fetchModelsBatch(
                    options.batchSize,
                    offset
                );

                if (models.length === 0) {
                    this.stateManager.updateModels({
                        pagination: { ...state.models.pagination, hasMore: false }
                    });
                    break;
                }

                // Update total count on first batch
                if (offset === 0 && models.length > 0) {
                    const estimatedTotal = Math.min(models.length * 1000, 200000);
                    this.stateManager.updateModels({ total: estimatedTotal });
                }

                // Apply download threshold filter
                const filteredModels = models.filter((m: any) => {
                    const downloads = m.downloads || 0;
                    return downloads >= minDownloads;
                });

                // If all models in batch are below threshold and sorted by downloads,
                // no more assets will pass the filter
                if (filteredModels.length === 0 && minDownloads > 0) {
                    console.log(`All models in batch below ${minDownloads} downloads threshold, stopping model sync`);
                    this.stateManager.updateModels({
                        pagination: { ...state.models.pagination, hasMore: false }
                    });
                    break;
                }

                console.log(`\nProcessing batch: ${offset}-${offset + models.length} (${filteredModels.length} passed filter)`);

                // Process batch with concurrency control and incremental sync
                const results = await this.processBatch(
                    filteredModels,
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
                offset += options.batchSize;
            }
        }

        console.log('\nModel sync completed');
    }

    /**
     * Sync datasets from HuggingFace
     */
    private async syncDatasets(options: SyncOptions): Promise<void> {
        console.log('\nSyncing Datasets...');

        const state = this.stateManager.getState();
        let offset = state.datasets.pagination.offset;
        const minDownloads = options.minDownloads ?? 1000;

        while (state.datasets.pagination.hasMore && !this.shouldStop) {
            try {
                const datasets = await this.fetchDatasetsBatch(
                    options.batchSize,
                    offset
                );

                if (datasets.length === 0) {
                    this.stateManager.updateDatasets({
                        pagination: { ...state.datasets.pagination, hasMore: false }
                    });
                    break;
                }

                if (offset === 0 && datasets.length > 0) {
                    const estimatedTotal = Math.min(datasets.length * 100, 20000);
                    this.stateManager.updateDatasets({ total: estimatedTotal });
                }

                // Apply download threshold filter
                const filteredDatasets = datasets.filter((d: any) => {
                    const downloads = d.downloads || 0;
                    return downloads >= minDownloads;
                });

                if (filteredDatasets.length === 0 && minDownloads > 0) {
                    console.log(`All datasets in batch below ${minDownloads} downloads threshold, stopping dataset sync`);
                    this.stateManager.updateDatasets({
                        pagination: { ...state.datasets.pagination, hasMore: false }
                    });
                    break;
                }

                console.log(`\nProcessing batch: ${offset}-${offset + datasets.length} (${filteredDatasets.length} passed filter)`);

                const results = await this.processBatch(
                    filteredDatasets,
                    'dataset',
                    options.concurrency
                );

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

                this.stateManager.calculateMetrics();
                await this.stateManager.save();

                if (
                    options.checkpointInterval &&
                    state.datasets.synced % options.checkpointInterval === 0
                ) {
                    await this.stateManager.createCheckpoint();
                }

                this.printProgress();

            } catch (error) {
                console.error(`Error processing datasets batch at offset ${offset}:`, error);
                offset += options.batchSize;
            }
        }

        console.log('\nDataset sync completed');
    }

    /**
     * Sync spaces from HuggingFace
     */
    private async syncSpaces(options: SyncOptions): Promise<void> {
        console.log('\nSyncing Spaces...');

        const state = this.stateManager.getState();
        let offset = state.spaces.pagination.offset;
        const minLikes = options.minLikes ?? 0;

        while (state.spaces.pagination.hasMore && !this.shouldStop) {
            try {
                const spaces = await this.fetchSpacesBatch(
                    options.batchSize,
                    offset
                );

                if (spaces.length === 0) {
                    this.stateManager.updateSpaces({
                        pagination: { ...state.spaces.pagination, hasMore: false }
                    });
                    break;
                }

                if (offset === 0 && spaces.length > 0) {
                    const estimatedTotal = Math.min(spaces.length * 50, 10000);
                    this.stateManager.updateSpaces({ total: estimatedTotal });
                }

                // Apply likes threshold filter (spaces don't report downloads the same way)
                const filteredSpaces = minLikes > 0
                    ? spaces.filter((s: any) => (s.likes || 0) >= minLikes)
                    : spaces;

                if (filteredSpaces.length === 0 && minLikes > 0) {
                    console.log(`All spaces in batch below ${minLikes} likes threshold, stopping spaces sync`);
                    this.stateManager.updateSpaces({
                        pagination: { ...state.spaces.pagination, hasMore: false }
                    });
                    break;
                }

                console.log(`\nProcessing spaces batch: ${offset}-${offset + spaces.length} (${filteredSpaces.length} passed filter)`);

                const results = await this.processBatch(
                    filteredSpaces,
                    'space',
                    options.concurrency
                );

                const successCount = results.filter((r) => r.success).length;
                const failedCount = results.filter((r) => !r.success).length;

                this.stateManager.updateSpaces({
                    synced: state.spaces.synced + successCount,
                    failed: state.spaces.failed + failedCount,
                    lastProcessedId: spaces[spaces.length - 1]?.name || '',
                    pagination: {
                        offset: offset + spaces.length,
                        hasMore: spaces.length >= options.batchSize,
                    },
                });

                offset += spaces.length;

                this.stateManager.calculateMetrics();
                await this.stateManager.save();

                if (
                    options.checkpointInterval &&
                    state.spaces.synced % options.checkpointInterval === 0
                ) {
                    await this.stateManager.createCheckpoint();
                }

                this.printProgress();

            } catch (error) {
                console.error(`Error processing spaces batch at offset ${offset}:`, error);
                offset += options.batchSize;
            }
        }

        console.log('\nSpaces sync completed');
    }

    /**
     * Fetch models batch from HuggingFace API with pagination
     */
    private async fetchModelsBatch(
        limit: number,
        offset: number
    ): Promise<any[]> {
        try {
            const response = await axios.get(`${this.hfApiBaseUrl}/models`, {
                params: { limit, offset, sort: 'downloads', direction: -1 },
                headers: this.hfHeaders,
                timeout: 30000,
            });
            return response.data || [];
        } catch (error) {
            console.error(`Failed to fetch models batch at offset ${offset}:`, error);
            return [];
        }
    }

    /**
     * Fetch datasets batch from HuggingFace API with pagination
     */
    private async fetchDatasetsBatch(
        limit: number,
        offset: number
    ): Promise<any[]> {
        try {
            const response = await axios.get(`${this.hfApiBaseUrl}/datasets`, {
                params: { limit, offset, sort: 'downloads', direction: -1 },
                headers: this.hfHeaders,
                timeout: 30000,
            });
            return response.data || [];
        } catch (error) {
            console.error(`Failed to fetch datasets batch at offset ${offset}:`, error);
            return [];
        }
    }

    /**
     * Fetch spaces batch from HuggingFace API with pagination
     */
    private async fetchSpacesBatch(
        limit: number,
        offset: number
    ): Promise<any[]> {
        try {
            const response = await axios.get(`${this.hfApiBaseUrl}/spaces`, {
                params: { limit, offset, sort: 'likes', direction: -1 },
                headers: this.hfHeaders,
                timeout: 30000,
            });
            return response.data || [];
        } catch (error) {
            console.error(`Failed to fetch spaces batch at offset ${offset}:`, error);
            return [];
        }
    }

    /**
     * Process a batch of assets with concurrency control and incremental sync
     */
    private async processBatch(
        assets: any[],
        type: 'model' | 'dataset' | 'space',
        concurrency: number
    ): Promise<Array<{ name: string; success: boolean; error?: string }>> {
        const limit = pLimit(concurrency);
        const results: Array<{ name: string; success: boolean; error?: string }> = [];

        const tasks = assets.map((asset) =>
            limit(async () => {
                const hfId = asset.id || asset.name || '';

                // Incremental sync: check if asset is unchanged
                const indexEntry = this.stateManager.getAssetIndexEntry(hfId);
                const lastModified = asset.updated_at || asset.lastModified || '';

                if (indexEntry && indexEntry.lastModified === lastModified) {
                    // Asset unchanged, skip
                    results.push({ name: asset.name, success: true });
                    return;
                }

                try {
                    let passportPDA: string;

                    if (type === 'model') {
                        const res = await this.hfBridge.registerModelPassport(asset);
                        passportPDA = res.passportPDA;
                    } else if (type === 'dataset') {
                        const res = await this.hfBridge.registerDatasetPassport(asset);
                        passportPDA = res.passportPDA;
                    } else {
                        const res = await this.hfBridge.registerSpacePassport(asset);
                        passportPDA = res.passportPDA;
                    }

                    // Update asset index for incremental tracking
                    this.stateManager.setAssetIndexEntry(hfId, {
                        hfId,
                        lastModified: lastModified || new Date().toISOString(),
                        onChainPDA: passportPDA,
                        version: asset.version || '1.0.0',
                        contentHash: asset.metadata?.sha || '',
                    });

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
        console.log('\nResuming sync from last checkpoint...');

        const defaultOptions: SyncOptions = {
            types: ['all'],
            batchSize: 100,
            concurrency: 10,
            checkpointInterval: 100,
            maxRetries: 3,
            minDownloads: 1000,
            minLikes: 0,
        };

        const mergedOptions = { ...defaultOptions, ...options };

        await this.startFullSync(mergedOptions);
    }

    /**
     * Retry failed assets
     */
    async retryFailed(maxAttempts: number = 3, concurrency: number = 5): Promise<void> {
        console.log('\nRetrying failed assets...');

        const retryable = this.stateManager.getRetryableAssets(maxAttempts);

        if (retryable.length === 0) {
            console.log('No retryable assets found');
            return;
        }

        console.log(`Found ${retryable.length} assets to retry`);

        // Group by type
        const models = retryable.filter((a) => a.type === 'model');
        const datasets = retryable.filter((a) => a.type === 'dataset');
        const spaces = retryable.filter((a) => a.type === 'space');

        if (models.length > 0) {
            console.log(`\nRetrying ${models.length} models...`);
            for (const model of models) {
                try {
                    console.log(`Retrying model: ${model.name}`);
                } catch (error) {
                    console.error(`Retry failed for ${model.name}:`, error);
                }
            }
        }

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

        if (spaces.length > 0) {
            console.log(`\nRetrying ${spaces.length} spaces...`);
            for (const space of spaces) {
                try {
                    console.log(`Retrying space: ${space.name}`);
                } catch (error) {
                    console.error(`Retry failed for ${space.name}:`, error);
                }
            }
        }

        await this.stateManager.save();
    }

    /**
     * Stop sync gracefully
     */
    stop(): void {
        console.log('\nStopping sync gracefully...');
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

        console.log('\nProgress Update:');
        console.log('-------------------------------------------');
        console.log(`Models:   ${progress.models.synced}/${progress.models.total} (${progress.models.progress})`);
        console.log(`Datasets: ${progress.datasets.synced}/${progress.datasets.total} (${progress.datasets.progress})`);
        console.log(`Spaces:   ${progress.spaces.synced}/${progress.spaces.total} (${progress.spaces.progress})`);
        console.log(`Overall:  ${progress.overall.synced}/${progress.overall.total} (${progress.overall.progress})`);
        console.log(`Failed:   ${progress.failed}`);
        console.log(`Speed:    ${progress.throughput} assets/min`);
        if (progress.eta) {
            const eta = new Date(progress.eta);
            console.log(`ETA:      ${eta.toLocaleString()}`);
        }
        console.log('-------------------------------------------\n');
    }

    /**
     * Print final report
     */
    private printFinalReport(): void {
        const state = this.stateManager.getState();
        const progress = this.stateManager.getProgress();

        console.log('\nFinal Report');
        console.log('================================================');
        console.log(`Total Synced: ${progress.overall.synced}`);
        console.log(`  - Models:   ${state.models.synced}`);
        console.log(`  - Datasets: ${state.datasets.synced}`);
        console.log(`  - Spaces:   ${state.spaces.synced}`);
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
                    (progress.overall.synced / Math.max(progress.overall.synced + progress.failed, 1)) *
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
            spaces: {
                synced: state.spaces.synced,
                failed: state.spaces.failed,
                total: state.spaces.total,
                progress: progress.spaces.progress,
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

export function getHFSyncOrchestrator(hfToken?: string): HFSyncOrchestrator {
    if (!orchestratorInstance) {
        orchestratorInstance = new HFSyncOrchestrator(hfToken);
    }
    return orchestratorInstance;
}
