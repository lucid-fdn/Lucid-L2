// services/hfBridgeService.ts
import axios from 'axios';
import {
    getPassportService,
    AssetType,
    PassportService,
    POLICY_ALLOW_COMMERCIAL,
    POLICY_ALLOW_DERIVATIVES,
    POLICY_REQUIRE_ATTRIBUTION,
} from './passportService';
import { getContentService, ContentService } from './contentService';

/**
 * HuggingFace Bridge Service
 * Fetches model/dataset metadata from llm_proxy and registers them as passports
 */
export class HFBridgeService {
    private passportService: PassportService;
    private contentService: ContentService;
    private llmProxyBaseUrl: string;

    constructor(llmProxyUrl: string = 'http://localhost:8000') {
        this.passportService = getPassportService();
        this.contentService = getContentService();
        this.llmProxyBaseUrl = llmProxyUrl;
        console.log(`🌉 HF Bridge initialized, connecting to: ${this.llmProxyBaseUrl}`);
    }

    /**
     * Fetch model from llm_proxy
     */
    async fetchModel(modelId: string): Promise<any> {
        try {
            const response = await axios.get(`${this.llmProxyBaseUrl}/models`, {
                params: { search: modelId, limit: 1 },
            });

            if (response.data && response.data.length > 0) {
                return response.data[0];
            }

            throw new Error(`Model not found: ${modelId}`);
        } catch (error) {
            console.error(`Error fetching model ${modelId}:`, error);
            throw error;
        }
    }

    /**
     * Fetch dataset from llm_proxy
     */
    async fetchDataset(datasetId: string): Promise<any> {
        try {
            const response = await axios.get(`${this.llmProxyBaseUrl}/datasets`, {
                params: { search: datasetId, limit: 1 },
            });

            if (response.data && response.data.length > 0) {
                return response.data[0];
            }

            throw new Error(`Dataset not found: ${datasetId}`);
        } catch (error) {
            console.error(`Error fetching dataset ${datasetId}:`, error);
            throw error;
        }
    }

    /**
     * Fetch all models from llm_proxy
     */
    async fetchAllModels(limit: number = 100): Promise<any[]> {
        try {
            const response = await axios.get(`${this.llmProxyBaseUrl}/models`, {
                params: { limit },
            });
            return response.data || [];
        } catch (error) {
            console.error('Error fetching models:', error);
            throw error;
        }
    }

    /**
     * Fetch all datasets from llm_proxy
     */
    async fetchAllDatasets(limit: number = 100): Promise<any[]> {
        try {
            const response = await axios.get(`${this.llmProxyBaseUrl}/datasets`, {
                params: { limit },
            });
            return response.data || [];
        } catch (error) {
            console.error('Error fetching datasets:', error);
            throw error;
        }
    }

    /**
     * Parse license string to SPDX code and policy flags
     */
    private parseLicense(license: string): { spdx: string; flags: number } {
        // Common SPDX mappings
        const licenseMap: { [key: string]: { spdx: string; flags: number } } = {
            'apache-2.0': {
                spdx: 'Apache-2.0',
                flags: POLICY_ALLOW_COMMERCIAL | POLICY_ALLOW_DERIVATIVES | POLICY_REQUIRE_ATTRIBUTION,
            },
            'mit': {
                spdx: 'MIT',
                flags: POLICY_ALLOW_COMMERCIAL | POLICY_ALLOW_DERIVATIVES | POLICY_REQUIRE_ATTRIBUTION,
            },
            'gpl-3.0': {
                spdx: 'GPL-3.0',
                flags: POLICY_ALLOW_DERIVATIVES | POLICY_REQUIRE_ATTRIBUTION,
            },
            'cc-by-4.0': {
                spdx: 'CC-BY-4.0',
                flags: POLICY_ALLOW_COMMERCIAL | POLICY_ALLOW_DERIVATIVES | POLICY_REQUIRE_ATTRIBUTION,
            },
            'cc-by-sa-4.0': {
                spdx: 'CC-BY-SA-4.0',
                flags: POLICY_ALLOW_COMMERCIAL | POLICY_ALLOW_DERIVATIVES | POLICY_REQUIRE_ATTRIBUTION,
            },
        };

        const normalized = (license || 'unknown').toLowerCase();
        const mapped = licenseMap[normalized];

        if (mapped) {
            return mapped;
        }

        // Default: require attribution, no commercial use
        return {
            spdx: license || 'Unknown',
            flags: POLICY_REQUIRE_ATTRIBUTION,
        };
    }

    /**
     * Extract version from model/dataset name or default to 1.0.0
     */
    private extractVersion(name: string, metadata: any): { major: number; minor: number; patch: number } {
        // Try to extract version from name (e.g., "model-v1.2.3" or "model-1.2")
        const versionMatch = name.match(/v?(\d+)\.(\d+)(?:\.(\d+))?/i);
        
        if (versionMatch) {
            return {
                major: parseInt(versionMatch[1], 10),
                minor: parseInt(versionMatch[2], 10),
                patch: versionMatch[3] ? parseInt(versionMatch[3], 10) : 0,
            };
        }

        // Check metadata for version info
        if (metadata && metadata.version) {
            const parts = metadata.version.split('.').map(Number);
            return {
                major: parts[0] || 1,
                minor: parts[1] || 0,
                patch: parts[2] || 0,
            };
        }

        // Default version
        return { major: 1, minor: 0, patch: 0 };
    }

    /**
     * Create slug from model/dataset name
     */
    private createSlug(name: string): string {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 64); // Max length
    }

    /**
     * Register a model as a passport
     */
    async registerModelPassport(modelData: any): Promise<{ signature: string; passportPDA: string }> {
        console.log(`\n🤖 Registering model passport: ${modelData.name}`);

        // Extract metadata
        const slug = this.createSlug(modelData.name);
        const version = this.extractVersion(modelData.name, modelData.metadata);
        const license = this.parseLicense(modelData.license);

        // Generate manifest
        const manifest = this.contentService.generateManifest(
            'model',
            slug,
            PassportService.formatVersion(version),
            [], // Files would be populated from actual model files
            [
                {
                    type: 'huggingface',
                    repo: modelData.name,
                    url: `https://huggingface.co/${modelData.name}`,
                },
            ]
        );

        // Generate metadata
        const metadata = this.contentService.generateModelMeta({
            arch: modelData.metadata?.architecture || 'unknown',
            params: modelData.metadata?.parameters || 0,
            dtype: modelData.metadata?.dtype || 'unknown',
            tokenizer: modelData.metadata?.tokenizer || 'unknown',
            license: {
                spdx: license.spdx,
            },
        });

        // Upload to IPFS (or generate mock CIDs)
        const { manifestCid, metadataCid, treeHash } = await this.contentService.uploadSnapshotData(
            manifest,
            metadata
        );

        // Register passport
        const result = await this.passportService.registerPassport({
            assetType: AssetType.Model,
            slug,
            version,
            contentCid: manifestCid,
            contentHash: this.contentService.computeContentHash(treeHash),
            metadataCid,
            licenseCode: license.spdx,
            policyFlags: license.flags,
        });

        console.log(`✅ Model passport registered:`);
        console.log(`   PDA: ${result.passportPDA.toBase58()}`);
        console.log(`   Tx: ${result.signature}`);

        return {
            signature: result.signature,
            passportPDA: result.passportPDA.toBase58(),
        };
    }

    /**
     * Register a dataset as a passport
     */
    async registerDatasetPassport(datasetData: any): Promise<{ signature: string; passportPDA: string }> {
        console.log(`\n📊 Registering dataset passport: ${datasetData.name}`);

        // Extract metadata
        const slug = this.createSlug(datasetData.name);
        const version = this.extractVersion(datasetData.name, datasetData.metadata);
        const license = this.parseLicense(datasetData.license);

        // Generate manifest
        const manifest = this.contentService.generateManifest(
            'dataset',
            slug,
            PassportService.formatVersion(version),
            [], // Files would be populated from actual dataset files
            [
                {
                    type: 'huggingface',
                    repo: datasetData.name,
                    url: `https://huggingface.co/datasets/${datasetData.name}`,
                },
            ]
        );

        // Generate metadata
        const metadata = this.contentService.generateDatasetMeta({
            name: datasetData.name,
            description: datasetData.description || '',
            sources: [`https://huggingface.co/datasets/${datasetData.name}`],
            collection_method: 'huggingface',
            license: {
                spdx: license.spdx,
            },
        });

        // Upload to IPFS (or generate mock CIDs)
        const { manifestCid, metadataCid, treeHash } = await this.contentService.uploadSnapshotData(
            manifest,
            metadata
        );

        // Register passport
        const result = await this.passportService.registerPassport({
            assetType: AssetType.Dataset,
            slug,
            version,
            contentCid: manifestCid,
            contentHash: this.contentService.computeContentHash(treeHash),
            metadataCid,
            licenseCode: license.spdx,
            policyFlags: license.flags,
        });

        console.log(`✅ Dataset passport registered:`);
        console.log(`   PDA: ${result.passportPDA.toBase58()}`);
        console.log(`   Tx: ${result.signature}`);

        return {
            signature: result.signature,
            passportPDA: result.passportPDA.toBase58(),
        };
    }

    /**
     * Sync models from HuggingFace to blockchain
     */
    async syncModels(limit: number = 10): Promise<Array<{ name: string; passport: string; tx: string }>> {
        console.log(`\n🔄 Syncing ${limit} models from HuggingFace...`);

        const models = await this.fetchAllModels(limit);
        const results = [];

        for (const model of models) {
            try {
                const result = await this.registerModelPassport(model);
                results.push({
                    name: model.name,
                    passport: result.passportPDA,
                    tx: result.signature,
                });
            } catch (error) {
                console.error(`Failed to register model ${model.name}:`, error);
            }
        }

        console.log(`\n✅ Synced ${results.length}/${models.length} models`);
        return results;
    }

    /**
     * Sync datasets from HuggingFace to blockchain
     */
    async syncDatasets(limit: number = 10): Promise<Array<{ name: string; passport: string; tx: string }>> {
        console.log(`\n🔄 Syncing ${limit} datasets from HuggingFace...`);

        const datasets = await this.fetchAllDatasets(limit);
        const results = [];

        for (const dataset of datasets) {
            try {
                const result = await this.registerDatasetPassport(dataset);
                results.push({
                    name: dataset.name,
                    passport: result.passportPDA,
                    tx: result.signature,
                });
            } catch (error) {
                console.error(`Failed to register dataset ${dataset.name}:`, error);
            }
        }

        console.log(`\n✅ Synced ${results.length}/${datasets.length} datasets`);
        return results;
    }
}

// Export singleton instance
let hfBridgeServiceInstance: HFBridgeService | null = null;

export function getHFBridgeService(llmProxyUrl?: string): HFBridgeService {
    if (!hfBridgeServiceInstance) {
        hfBridgeServiceInstance = new HFBridgeService(llmProxyUrl);
    }
    return hfBridgeServiceInstance;
}
