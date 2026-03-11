// services/deprecationDetector.ts
// Detects deleted/deprecated HuggingFace assets and revokes on-chain passports

import axios from 'axios';
import { SyncState, SyncStateManager, getSyncStateManager, AssetIndexEntry } from './syncStateManager';
import { HFBridgeService, getHFBridgeService } from './hfBridgeService';
import { blockchainAdapterFactory } from '../../../engine/src/chains/factory';
import type { IPassportAdapter } from '../../../engine/src/chains/domain-interfaces';

export class DeprecationDetector {
    private stateManager: SyncStateManager;
    private hfBridge: HFBridgeService;
    private passportAdapter: IPassportAdapter | null = null;
    constructor(hfToken: string = process.env.HF_TOKEN || '') {
        this.stateManager = getSyncStateManager();
        this.hfBridge = getHFBridgeService(hfToken);
    }

    /** Lazily resolve the passport adapter (avoids startup ordering issues) */
    private async getPassportAdapter(): Promise<IPassportAdapter> {
        if (!this.passportAdapter) {
            const chainId = (process.env.ANCHORING_CHAINS || 'solana-devnet').split(',')[0].trim();
            const adapter = await blockchainAdapterFactory.getAdapter(chainId);
            this.passportAdapter = adapter.passports();
        }
        return this.passportAdapter;
    }

    /**
     * Detect deleted/deprecated HF assets and revoke their on-chain passports
     * Returns the number of passports revoked
     */
    async detectAndRevoke(): Promise<{
        checked: number;
        revoked: number;
        errors: number;
        details: Array<{ hfId: string; pda: string; reason: string }>;
    }> {
        console.log('\nRunning deprecation detection...');

        await this.stateManager.load();
        const assetIndex = this.stateManager.getAssetIndex();
        const entries = Object.entries(assetIndex);

        if (entries.length === 0) {
            console.log('No assets in index to check');
            return { checked: 0, revoked: 0, errors: 0, details: [] };
        }

        console.log(`Checking ${entries.length} indexed assets for deprecation...`);

        let checked = 0;
        let revoked = 0;
        let errors = 0;
        const details: Array<{ hfId: string; pda: string; reason: string }> = [];

        for (const [hfId, entry] of entries) {
            checked++;

            try {
                const exists = await this.checkAssetExists(hfId);

                if (!exists) {
                    console.log(`  Asset deleted from HF: ${hfId} — revoking on-chain passport ${entry.onChainPDA}`);

                    const passportAdapter = await this.getPassportAdapter();
                    const receipt = await passportAdapter.updatePassportStatus(
                        entry.onChainPDA,
                        'revoked'
                    );

                    if (receipt.success) {
                        revoked++;
                        details.push({
                            hfId,
                            pda: entry.onChainPDA,
                            reason: 'Asset deleted from HuggingFace',
                        });

                        // Remove from index
                        this.stateManager.removeAssetIndexEntry(hfId);
                    } else {
                        errors++;
                    }
                }

                // Rate-limit HF API calls
                if (checked % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                // Log progress periodically
                if (checked % 100 === 0) {
                    console.log(`  Progress: ${checked}/${entries.length} checked, ${revoked} revoked`);
                }
            } catch (error) {
                errors++;
                console.warn(`  Error checking ${hfId}:`, error instanceof Error ? error.message : error);
            }
        }

        // Save updated state
        await this.stateManager.save();

        console.log(`\nDeprecation detection complete:`);
        console.log(`  Checked: ${checked}`);
        console.log(`  Revoked: ${revoked}`);
        console.log(`  Errors:  ${errors}`);

        return { checked, revoked, errors, details };
    }

    /**
     * Check if a HuggingFace asset still exists
     * Uses HEAD request to the HF API for efficiency
     */
    private async checkAssetExists(hfId: string): Promise<boolean> {
        // Determine the type from the ID prefix
        let apiUrl: string;

        if (hfId.startsWith('hf-space-')) {
            const spaceId = hfId.replace('hf-space-', '');
            apiUrl = `https://huggingface.co/api/spaces/${spaceId}`;
        } else if (hfId.startsWith('hf-dataset-')) {
            const datasetId = hfId.replace('hf-dataset-', '');
            apiUrl = `https://huggingface.co/api/datasets/${datasetId}`;
        } else if (hfId.startsWith('hf-')) {
            const modelId = hfId.replace('hf-', '');
            apiUrl = `https://huggingface.co/api/models/${modelId}`;
        } else {
            // Try as model by default
            apiUrl = `https://huggingface.co/api/models/${hfId}`;
        }

        try {
            const response = await axios.head(apiUrl, {
                timeout: 10000,
                validateStatus: (status) => status < 500,
            });

            return response.status === 200;
        } catch (error) {
            // Network errors — assume asset still exists (don't revoke on transient failures)
            return true;
        }
    }
}

// Singleton
let detectorInstance: DeprecationDetector | null = null;

export function getDeprecationDetector(hfToken?: string): DeprecationDetector {
    if (!detectorInstance) {
        detectorInstance = new DeprecationDetector(hfToken);
    }
    return detectorInstance;
}
