// services/contentService.ts
import { createHash } from 'crypto';

/**
 * Content addressing and IPFS service for Lucid Passports
 * Currently using mock CIDs - IPFS integration can be added later
 */
export class ContentService {
    private ipfsEnabled: boolean = false;

    constructor() {
        console.warn('⚠️  Using mock CIDs (IPFS disabled for now)');
    }

    /**
     * Check if IPFS is available
     */
    isIPFSAvailable(): boolean {
        return this.ipfsEnabled;
    }

    /**
     * Compute SHA256 hash of content
     */
    computeContentHash(content: string | Buffer): Buffer {
        const hash = createHash('sha256');
        if (typeof content === 'string') {
            hash.update(Buffer.from(content));
        } else if (Buffer.isBuffer(content)) {
            hash.update(content);
        } else {
            // Handle other types by converting to string first
            hash.update(Buffer.from(String(content)));
        }
        return hash.digest();
    }

    /**
     * Compute SHA256 hash and return as hex string
     */
    computeContentHashHex(content: string | Buffer): string {
        return this.computeContentHash(content).toString('hex');
    }

    /**
     * Generate a deterministic mock CID from content
     */
    private generateMockCID(content: string): string {
        const hash = this.computeContentHashHex(content);
        // Create CIDv1-like string
        return 'bafybei' + hash.substring(0, 52);
    }

    /**
     * Upload content to IPFS and return CID (mock implementation)
     */
    async uploadToIPFS(content: string | Buffer): Promise<string> {
        const contentString = typeof content === 'string' ? content : content.toString();
        const mockCid = this.generateMockCID(contentString);
        console.log(`📦 Generated mock CID: ${mockCid.substring(0, 20)}...`);
        return mockCid;
    }

    /**
     * Upload JSON object to IPFS (mock implementation)
     */
    async uploadJSONToIPFS(data: any): Promise<string> {
        const jsonString = JSON.stringify(data, null, 2);
        return this.uploadToIPFS(jsonString);
    }

    /**
     * Retrieve content from IPFS (not implemented for mocks)
     */
    async retrieveFromIPFS(cid: string): Promise<Buffer> {
        throw new Error('Retrieve from IPFS not available with mock CIDs');
    }

    /**
     * Retrieve JSON object from IPFS (not implemented for mocks)
     */
    async retrieveJSONFromIPFS(cid: string): Promise<any> {
        throw new Error('Retrieve from IPFS not available with mock CIDs');
    }

    /**
     * Pin content to IPFS (no-op for mocks)
     */
    async pinToIPFS(cid: string): Promise<void> {
        // No-op for mock implementation
    }

    /**
     * Unpin content from IPFS (no-op for mocks)
     */
    async unpinFromIPFS(cid: string): Promise<void> {
        // No-op for mock implementation
    }

    /**
     * Create a merkle tree hash from file list
     * This is a simplified implementation - for production use a proper merkle tree library
     */
    createMerkleTreeHash(files: Array<{ path: string; hash: string }>): string {
        if (files.length === 0) {
            // Return hash of empty string for empty file list
            return this.computeContentHashHex('');
        }
        
        // Sort files by path for determinism
        const sortedFiles = files.sort((a, b) => a.path.localeCompare(b.path));
        
        // Concatenate all hashes
        const concatenated = sortedFiles.map(f => f.hash).join('');
        
        // Hash the concatenation
        return this.computeContentHashHex(concatenated);
    }

    /**
     * Generate manifest for a model/dataset snapshot
     */
    generateManifest(
        assetType: 'model' | 'dataset',
        slug: string,
        version: string,
        files: Array<{ path: string; hash: string; size: number }>,
        sources: Array<{ type: string; url?: string; repo?: string; commit?: string; cid?: string }>
    ): any {
        const treeHash = this.createMerkleTreeHash(files);
        
        return {
            schema: 'lucid/manifest@1',
            asset_type: assetType,
            slug,
            version,
            files,
            tree_sha256: treeHash,
            sources,
            created_at: new Date().toISOString(),
        };
    }

    /**
     * Generate model metadata following the passport spec
     */
    generateModelMeta(params: {
        arch: string;
        params: number;
        dtype: string;
        quantization?: string;
        tokenizer: string;
        training?: any;
        evals?: any;
        safety?: any;
        license: { spdx: string; uri?: string };
        attestations?: Array<{ type: string; cid: string }>;
    }): any {
        return {
            schema: 'lucid/modelmeta@1',
            ...params,
        };
    }

    /**
     * Generate dataset metadata following the passport spec
     */
    generateDatasetMeta(params: {
        name: string;
        description: string;
        sources: string[];
        collection_method: string;
        license: { spdx: string; uri?: string };
        pii_notes?: string;
        splits?: any;
        checksums?: any;
        data_statement?: string;
    }): any {
        return {
            schema: 'lucid/datasetmeta@1',
            ...params,
        };
    }

    /**
     * Upload manifest and metadata to IPFS
     * Returns { manifestCid, metadataCid, treeHash }
     */
    async uploadSnapshotData(
        manifest: any,
        metadata: any
    ): Promise<{ manifestCid: string; metadataCid: string; treeHash: string }> {
        // Generate deterministic mock CIDs
        const manifestCid = await this.uploadJSONToIPFS(manifest);
        const metadataCid = await this.uploadJSONToIPFS(metadata);
        
        await this.pinToIPFS(manifestCid);
        await this.pinToIPFS(metadataCid);

        return {
            manifestCid,
            metadataCid,
            treeHash: manifest.tree_sha256,
        };
    }
}

// Export singleton instance
let contentServiceInstance: ContentService | null = null;

export function getContentService(): ContentService {
    if (!contentServiceInstance) {
        contentServiceInstance = new ContentService();
    }
    return contentServiceInstance;
}
