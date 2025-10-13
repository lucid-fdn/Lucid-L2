// services/contentService.ts
import { createHash } from 'crypto';
import { create, IPFSHTTPClient } from 'ipfs-http-client';

/**
 * Content addressing and IPFS service for Lucid Passports
 */
export class ContentService {
    private ipfsClient: IPFSHTTPClient | null = null;
    private ipfsEnabled: boolean = false;

    constructor() {
        this.initializeIPFS();
    }

    /**
     * Initialize IPFS client
     */
    private initializeIPFS() {
        try {
            // Default to local IPFS node
            const ipfsUrl = process.env.IPFS_URL || 'http://127.0.0.1:5001';
            this.ipfsClient = create({ url: ipfsUrl });
            this.ipfsEnabled = true;
            console.log(`📦 IPFS client initialized: ${ipfsUrl}`);
        } catch (error) {
            console.warn('⚠️  IPFS not available, content will not be uploaded');
            this.ipfsEnabled = false;
        }
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
        hash.update(content);
        return hash.digest();
    }

    /**
     * Compute SHA256 hash and return as hex string
     */
    computeContentHashHex(content: string | Buffer): string {
        return this.computeContentHash(content).toString('hex');
    }

    /**
     * Upload content to IPFS and return CID
     */
    async uploadToIPFS(content: string | Buffer): Promise<string> {
        if (!this.ipfsEnabled || !this.ipfsClient) {
            throw new Error('IPFS is not available');
        }

        try {
            const result = await this.ipfsClient.add(content);
            console.log(`📤 Uploaded to IPFS: ${result.path}`);
            return result.path; // CIDv0 by default
        } catch (error) {
            console.error('Error uploading to IPFS:', error);
            throw new Error(`Failed to upload to IPFS: ${error}`);
        }
    }

    /**
     * Upload JSON object to IPFS
     */
    async uploadJSONToIPFS(data: any): Promise<string> {
        const jsonString = JSON.stringify(data, null, 2);
        return this.uploadToIPFS(jsonString);
    }

    /**
     * Retrieve content from IPFS
     */
    async retrieveFromIPFS(cid: string): Promise<Buffer> {
        if (!this.ipfsEnabled || !this.ipfsClient) {
            throw new Error('IPFS is not available');
        }

        try {
            const chunks: Uint8Array[] = [];
            for await (const chunk of this.ipfsClient.cat(cid)) {
                chunks.push(chunk);
            }
            const content = Buffer.concat(chunks);
            console.log(`📥 Retrieved from IPFS: ${cid} (${content.length} bytes)`);
            return content;
        } catch (error) {
            console.error('Error retrieving from IPFS:', error);
            throw new Error(`Failed to retrieve from IPFS: ${error}`);
        }
    }

    /**
     * Retrieve JSON object from IPFS
     */
    async retrieveJSONFromIPFS(cid: string): Promise<any> {
        const content = await this.retrieveFromIPFS(cid);
        return JSON.parse(content.toString('utf-8'));
    }

    /**
     * Pin content to IPFS (keep it available)
     */
    async pinToIPFS(cid: string): Promise<void> {
        if (!this.ipfsEnabled || !this.ipfsClient) {
            throw new Error('IPFS is not available');
        }

        try {
            await this.ipfsClient.pin.add(cid);
            console.log(`📌 Pinned to IPFS: ${cid}`);
        } catch (error) {
            console.error('Error pinning to IPFS:', error);
            throw new Error(`Failed to pin to IPFS: ${error}`);
        }
    }

    /**
     * Unpin content from IPFS
     */
    async unpinFromIPFS(cid: string): Promise<void> {
        if (!this.ipfsEnabled || !this.ipfsClient) {
            throw new Error('IPFS is not available');
        }

        try {
            await this.ipfsClient.pin.rm(cid);
            console.log(`📍 Unpinned from IPFS: ${cid}`);
        } catch (error) {
            console.error('Error unpinning from IPFS:', error);
            throw new Error(`Failed to unpin from IPFS: ${error}`);
        }
    }

    /**
     * Create a merkle tree hash from file list
     * This is a simplified implementation - for production use a proper merkle tree library
     */
    createMerkleTreeHash(files: Array<{ path: string; hash: string }>): string {
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
        if (!this.isIPFSAvailable()) {
            // Generate mock CIDs for development without IPFS
            const mockManifestCid = 'Qm' + this.computeContentHashHex(JSON.stringify(manifest)).substring(0, 44);
            const mockMetadataCid = 'Qm' + this.computeContentHashHex(JSON.stringify(metadata)).substring(0, 44);
            
            console.log('⚠️  IPFS not available, using mock CIDs');
            return {
                manifestCid: mockManifestCid,
                metadataCid: mockMetadataCid,
                treeHash: manifest.tree_sha256,
            };
        }

        // Upload manifest
        const manifestCid = await this.uploadJSONToIPFS(manifest);
        await this.pinToIPFS(manifestCid);

        // Upload metadata
        const metadataCid = await this.uploadJSONToIPFS(metadata);
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
