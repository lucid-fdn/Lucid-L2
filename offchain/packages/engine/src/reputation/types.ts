export interface FeedbackParams {
  passportId: string;
  score: number;        // 1-100
  category: string;
  receiptHash: string;  // hex-encoded SHA-256
  assetType: AssetType;
  metadata?: string;
}

export interface ValidationParams {
  passportId: string;
  receiptHash: string;
  valid: boolean;
  assetType: AssetType;
  metadata?: string;
}

export interface ReputationData {
  passportId: string;
  from: string;
  score: number;
  category: string;
  receiptHash: string;
  assetType: AssetType;
  timestamp: number;
  revoked: boolean;
  index: number;
}

export interface ValidationResult {
  passportId: string;
  validator: string;
  valid: boolean;
  receiptHash: string;
  assetType: AssetType;
  timestamp: number;
}

export interface ReputationSummary {
  passportId: string;
  feedbackCount: number;
  validationCount: number;
  avgScore: number;       // 0-100 (float)
  totalScore: number;
  lastUpdated: number;
}

export interface TxReceipt {
  success: boolean;
  txHash?: string;
  id?: string;
}

export interface ReadOptions {
  limit?: number;
  offset?: number;
  category?: string;
  assetType?: AssetType;
}

export type AssetType = 'model' | 'compute' | 'tool' | 'agent' | 'dataset';

export const ASSET_TYPE_MAP: Record<AssetType, number> = {
  model: 0,
  compute: 1,
  tool: 2,
  agent: 3,
  dataset: 4,
};

export const ASSET_TYPE_REVERSE: Record<number, AssetType> = {
  0: 'model',
  1: 'compute',
  2: 'tool',
  3: 'agent',
  4: 'dataset',
};
