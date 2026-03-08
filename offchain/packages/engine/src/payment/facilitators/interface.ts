import type {
  ChainConfig,
  TokenConfig,
  PaymentProof,
  PaymentExpectation,
  VerificationResult,
  PaymentParams,
  PaymentInstructions,
} from '../types';

export interface X402Facilitator {
  readonly name: string;
  readonly supportedChains: ChainConfig[];
  readonly supportedTokens: TokenConfig[];

  verify(proof: PaymentProof, expected: PaymentExpectation): Promise<VerificationResult>;
  instructions(params: PaymentParams): PaymentInstructions;
}

export type { ChainConfig, TokenConfig, PaymentProof, PaymentExpectation, VerificationResult, PaymentParams, PaymentInstructions };
