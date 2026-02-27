/**
 * CAIP-10 Identity Utilities
 *
 * CAIP-10 format: <namespace>:<reference>:<address>
 * - Solana: solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:<base58_pubkey>
 * - EVM:    eip155:8453:<0x_address>
 *
 * See: https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-10.md
 */

export interface ParsedCaip10 {
  namespace: string;
  reference: string;
  address: string;
}

// Solana chain references (genesis hash prefixes)
const SOLANA_REFERENCES: Record<string, string> = {
  'mainnet': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'devnet': 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  'testnet': '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
};

/**
 * Build a CAIP-10 account ID string.
 */
export function toCaip10(namespace: string, reference: string, address: string): string {
  return `${namespace}:${reference}:${address}`;
}

/**
 * Parse a CAIP-10 account ID into components.
 */
export function fromCaip10(caip10: string): ParsedCaip10 {
  const parts = caip10.split(':');
  if (parts.length < 3) {
    throw new Error(`Invalid CAIP-10 format: ${caip10}`);
  }

  // Address may contain colons (unlikely but spec allows namespace:reference:address)
  const namespace = parts[0];
  const reference = parts[1];
  const address = parts.slice(2).join(':');

  return { namespace, reference, address };
}

/**
 * Validate a CAIP-10 string format.
 */
export function validateCaip10(caip10: string): boolean {
  try {
    const parsed = fromCaip10(caip10);
    if (!parsed.namespace || !parsed.reference || !parsed.address) return false;

    // Namespace must be alphanumeric
    if (!/^[a-z][a-z0-9-]*$/.test(parsed.namespace)) return false;

    // Reference must be non-empty
    if (parsed.reference.length === 0) return false;

    // Address must be non-empty
    if (parsed.address.length === 0) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Build a CAIP-10 for a Solana address.
 */
export function solanaCaip10(address: string, network: 'mainnet' | 'devnet' | 'testnet' = 'devnet'): string {
  const reference = SOLANA_REFERENCES[network];
  if (!reference) throw new Error(`Unknown Solana network: ${network}`);
  return toCaip10('solana', reference, address);
}

/**
 * Build a CAIP-10 for an EVM address.
 */
export function evmCaip10(address: string, chainId: number): string {
  return toCaip10('eip155', chainId.toString(), address);
}

/**
 * Check if a CAIP-10 string is a Solana address.
 */
export function isSolanaCaip10(caip10: string): boolean {
  try {
    const parsed = fromCaip10(caip10);
    return parsed.namespace === 'solana';
  } catch {
    return false;
  }
}

/**
 * Check if a CAIP-10 string is an EVM address.
 */
export function isEvmCaip10(caip10: string): boolean {
  try {
    const parsed = fromCaip10(caip10);
    return parsed.namespace === 'eip155';
  } catch {
    return false;
  }
}
