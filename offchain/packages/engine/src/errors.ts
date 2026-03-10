/**
 * Lucid Error Hierarchy
 *
 * All Lucid errors extend LucidError. Chain-specific errors
 * extend ChainError. Domain errors are flat siblings of LucidError.
 */

// =============================================================================
// Base
// =============================================================================

export class LucidError extends Error {
  readonly code: string;
  override readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.cause && { cause: this.cause.message }),
    };
  }
}

// =============================================================================
// Chain Errors
// =============================================================================

export class ChainError extends LucidError {
  readonly chain: string;

  constructor(message: string, code: string, chain: string, cause?: Error) {
    super(message, code, cause);
    this.chain = chain;
  }

  toJSON() {
    return { ...super.toJSON(), chain: this.chain };
  }
}

export class SolanaError extends ChainError {
  readonly txSignature?: string;

  constructor(message: string, code: string, txSignature?: string, cause?: Error) {
    super(message, code, 'solana', cause);
    this.txSignature = txSignature;
  }

  toJSON() {
    return { ...super.toJSON(), ...(this.txSignature && { txSignature: this.txSignature }) };
  }
}

export class EVMError extends ChainError {
  readonly txHash?: string;

  constructor(message: string, code: string, txHash?: string, cause?: Error) {
    super(message, code, 'evm', cause);
    this.txHash = txHash;
  }

  toJSON() {
    return { ...super.toJSON(), ...(this.txHash && { txHash: this.txHash }) };
  }
}

export class ChainFeatureUnavailable extends ChainError {
  readonly feature: string;

  constructor(feature: string, chain: string) {
    super(
      `${feature} is not yet available on ${chain}`,
      'CHAIN_FEATURE_UNAVAILABLE',
      chain,
    );
    this.feature = feature;
  }

  toJSON() {
    return { ...super.toJSON(), feature: this.feature };
  }
}

// =============================================================================
// Domain Errors
// =============================================================================

export class ValidationError extends LucidError {
  readonly field: string;
  readonly expected: string;

  constructor(message: string, field: string, expected: string) {
    super(message, 'VALIDATION_ERROR');
    this.field = field;
    this.expected = expected;
  }

  toJSON() {
    return { ...super.toJSON(), field: this.field, expected: this.expected };
  }
}

export class AuthError extends LucidError {
  constructor(message: string, cause?: Error) {
    super(message, 'AUTH_ERROR', cause);
  }
}

export class DeployError extends LucidError {
  readonly target: string;
  readonly deploymentId?: string;

  constructor(message: string, target: string, deploymentId?: string, cause?: Error) {
    super(message, 'DEPLOY_ERROR', cause);
    this.target = target;
    this.deploymentId = deploymentId;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      target: this.target,
      ...(this.deploymentId && { deploymentId: this.deploymentId }),
    };
  }
}

// =============================================================================
// Infrastructure Errors
// =============================================================================

export class NetworkError extends LucidError {
  readonly url: string;
  readonly statusCode?: number;

  constructor(message: string, url: string, statusCode?: number, cause?: Error) {
    super(message, 'NETWORK_ERROR', cause);
    this.url = url;
    this.statusCode = statusCode;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      url: this.url,
      ...(this.statusCode && { statusCode: this.statusCode }),
    };
  }
}

export class TimeoutError extends LucidError {
  readonly operationMs: number;
  readonly limitMs: number;

  constructor(message: string, operationMs: number, limitMs: number) {
    super(message, 'TIMEOUT_ERROR');
    this.operationMs = operationMs;
    this.limitMs = limitMs;
  }

  toJSON() {
    return { ...super.toJSON(), operationMs: this.operationMs, limitMs: this.limitMs };
  }
}

export class RateLimitError extends LucidError {
  readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message, 'RATE_LIMIT_ERROR');
    this.retryAfterMs = retryAfterMs;
  }

  toJSON() {
    return { ...super.toJSON(), ...(this.retryAfterMs && { retryAfterMs: this.retryAfterMs }) };
  }
}
