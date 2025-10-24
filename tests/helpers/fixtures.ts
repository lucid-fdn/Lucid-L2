/**
 * Test Fixtures and Utilities
 * Production-ready helpers for Solana program testing
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

// LUCID token mint on devnet
export const LUCID_MINT = new PublicKey("7cBsSHBB4nSVQy6ceUvmrA8Z2ks8Me8AjxSUqvJ2q1S9");

/**
 * Airdrop SOL to an account for testing
 */
export async function airdropSol(
  connection: Connection,
  publicKey: PublicKey,
  amount: number = 2
): Promise<void> {
  const signature = await connection.requestAirdrop(
    publicKey,
    amount * LAMPORTS_PER_SOL
  );
  
  await connection.confirmTransaction(signature, "confirmed");
}

/**
 * Generate a funded test wallet
 */
export async function createFundedWallet(
  connection: Connection,
  solAmount: number = 2
): Promise<Keypair> {
  const wallet = Keypair.generate();
  await airdropSol(connection, wallet.publicKey, solAmount);
  return wallet;
}

/**
 * Create test token mint and account
 */
export async function createTestToken(
  connection: Connection,
  payer: Keypair,
  decimals: number = 9
): Promise<{ mint: PublicKey; tokenAccount: PublicKey }> {
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    decimals
  );

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey
  );

  return {
    mint,
    tokenAccount: tokenAccount.address
  };
}

/**
 * Mint tokens to an account
 */
export async function mintTokensTo(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  destination: PublicKey,
  amount: number
): Promise<string> {
  const signature = await mintTo(
    connection,
    payer,
    mint,
    destination,
    payer,
    amount
  );

  return signature;
}

/**
 * Generate valid 32-byte Merkle root for testing
 */
export function generateMerkleRoot(seed: number = 7): Uint8Array {
  return new Uint8Array(32).fill(seed);
}

/**
 * Generate multiple unique Merkle roots
 */
export function generateMerkleRoots(count: number): Array<number[]> {
  const roots: Array<number[]> = [];
  
  for (let i = 0; i < count; i++) {
    const root = Array.from(generateMerkleRoot(i + 1));
    roots.push(root);
  }
  
  return roots;
}

/**
 * Generate mock IPFS CID (valid format)
 */
export function generateMockCID(prefix: string = "Qm"): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let cid = prefix;
  
  // Generate 44 random characters (typical IPFS CID length)
  for (let i = 0; i < 44; i++) {
    cid += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return cid;
}

/**
 * Generate SHA256 hash (32 bytes)
 */
export function generateContentHash(seed: string = "test"): number[] {
  const crypto = require("crypto");
  const hash = crypto.createHash("sha256").update(seed).digest();
  return Array.from(hash);
}

/**
 * Create recipient shares for gas distribution
 */
export interface RecipientShare {
  recipient: PublicKey;
  percentage: number;
}

export function createRecipientShares(
  recipients: PublicKey[],
  percentages: number[]
): RecipientShare[] {
  if (recipients.length !== percentages.length) {
    throw new Error("Recipients and percentages length mismatch");
  }

  const total = percentages.reduce((sum, p) => sum + p, 0);
  if (total !== 100) {
    throw new Error(`Percentages must sum to 100, got ${total}`);
  }

  return recipients.map((recipient, i) => ({
    recipient,
    percentage: percentages[i]
  }));
}

/**
 * Generate equal recipient shares
 */
export function createEqualShares(recipients: PublicKey[]): RecipientShare[] {
  const percentage = Math.floor(100 / recipients.length);
  const remainder = 100 - (percentage * recipients.length);
  
  return recipients.map((recipient, i) => ({
    recipient,
    percentage: i === 0 ? percentage + remainder : percentage
  }));
}

/**
 * Create version struct for passport testing
 */
export interface Version {
  major: number;
  minor: number;
  patch: number;
}

export function createVersion(major: number = 1, minor: number = 0, patch: number = 0): Version {
  return { major, minor, patch };
}

/**
 * Generate test asset slugs
 */
export function generateAssetSlug(name: string = "test"): string {
  return `${name}-${Date.now()}`.toLowerCase().substring(0, 64);
}

/**
 * Wait for transaction confirmation with retry
 */
export async function confirmTransaction(
  connection: Connection,
  signature: string,
  maxRetries: number = 3
): Promise<void> {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const result = await connection.confirmTransaction(signature, "confirmed");
      
      if (result.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
      }
      
      return;
    } catch (error) {
      retries++;
      if (retries >= maxRetries) {
        throw error;
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Get program error from transaction
 */
export function extractProgramError(error: any): string | null {
  if (!error) return null;
  
  const errorString = error.toString();
  const matches = errorString.match(/custom program error: (0x[0-9a-fA-F]+)/);
  
  if (matches && matches[1]) {
    return matches[1];
  }
  
  return errorString;
}

/**
 * Sleep utility for tests
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate test keypairs with labels
 */
export interface LabeledKeypair {
  keypair: Keypair;
  label: string;
}

export function generateTestKeypairs(count: number, prefix: string = "test"): LabeledKeypair[] {
  const keypairs: LabeledKeypair[] = [];
  
  for (let i = 0; i < count; i++) {
    keypairs.push({
      keypair: Keypair.generate(),
      label: `${prefix}_${i + 1}`
    });
  }
  
  return keypairs;
}

/**
 * Constants for testing
 */
export const TEST_CONSTANTS = {
  DEFAULT_SOL_AMOUNT: 2,
  DEFAULT_TOKEN_AMOUNT: 1_000_000 * Math.pow(10, 9), // 1M tokens
  MAX_BATCH_SIZE: 16,
  MAX_RECIPIENTS: 10,
  DEFAULT_GAS_AMOUNT: 1000,
  MIN_CONVERSION_AMOUNT: 100
};
