// offchain/packages/engine/src/deployment/secrets/interface.ts
// ISecretsResolver — abstract secret resolution at deploy time

/**
 * Resolves secret references to their actual values.
 * Secret refs are strings like `secret:OPENAI_API_KEY` or `vault:path/to/secret#key`.
 * Values are NEVER stored in deployment records — only resolved at deploy time.
 */
export interface ISecretsResolver {
  /** Resolve an array of secret refs to key-value pairs. */
  resolve(refs: string[]): Promise<Record<string, string>>;

  /** The provider name (e.g. 'env', 'mock', 'vault'). */
  readonly provider: string;
}
