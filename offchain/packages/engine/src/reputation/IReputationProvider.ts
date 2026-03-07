import {
  FeedbackParams,
  ValidationParams,
  ReputationData,
  ValidationResult,
  ReputationSummary,
  TxReceipt,
  ReadOptions,
} from './types';

export interface IReputationProvider {
  readonly providerName: string;

  submitFeedback(params: FeedbackParams): Promise<TxReceipt>;
  readFeedback(passportId: string, options?: ReadOptions): Promise<ReputationData[]>;
  getSummary(passportId: string): Promise<ReputationSummary>;

  submitValidation(params: ValidationParams): Promise<TxReceipt>;
  getValidation(passportId: string, receiptHash: string): Promise<ValidationResult | null>;

  isHealthy(): Promise<boolean>;
}
