// offchain/src/storage/depin/IDepinStorage.ts
// Swappable decentralized storage interface — no hard dependency on any provider

/**
 * Result of a DePIN upload operation
 */
export interface UploadResult {
  /** Content identifier (Arweave tx ID, IPFS CID, or mock hash) */
  cid: string;
  /** Full retrieval URL (e.g., https://arweave.net/{txId}) */
  url: string;
  /** Storage provider name */
  provider: string;
  /** Size in bytes of uploaded content */
  sizeBytes: number;
}

/**
 * Options for upload operations
 */
export interface UploadOptions {
  /** Content-type MIME (default: application/json) */
  contentType?: string;
  /** Tags for content discovery / indexing */
  tags?: Record<string, string>;
}

/**
 * DePIN storage interface — all providers implement this.
 * Swappable at runtime via factory + env var.
 */
export interface IDepinStorage {
  /** Provider name for logging */
  readonly providerName: string;

  /** Upload JSON data to decentralized storage */
  uploadJSON(data: unknown, options?: UploadOptions): Promise<UploadResult>;

  /** Upload raw bytes (e.g., binary attestation proofs) */
  uploadBytes(data: Buffer, options?: UploadOptions): Promise<UploadResult>;

  /** Retrieve data by CID. Returns null if not found or unreachable. */
  retrieve(cid: string): Promise<Buffer | null>;

  /** Check if a CID exists / is retrievable */
  exists(cid: string): Promise<boolean>;

  /** Health check — returns true if the storage provider is reachable */
  isHealthy(): Promise<boolean>;

  /** Get the full retrieval URL for a CID */
  getUrl(cid: string): string;
}
