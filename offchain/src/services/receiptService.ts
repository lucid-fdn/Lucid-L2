/**
 * Receipt Service - Creates, stores, and verifies run receipts.
 * 
 * Key improvements over MVP stub:
 * 1. Real ed25519 signing (orchestrator-signed for MVP)
 * 2. Well-defined receipt hash preimage (JCS of receipt_body)
 * 3. Real Merkle tree for inclusion proofs
 * 4. Signature verification
 */
import { v4 as uuid } from 'uuid';
import { canonicalSha256Hex } from '../utils/hash';
import { validateWithSchema } from '../utils/schemaValidator';
import { signMessage, verifySignature, getOrchestratorPublicKey } from '../utils/signing';
import { getReceiptTree, MerkleTree, MerkleProof } from '../utils/merkleTree';

/**
 * Receipt body - the data that gets hashed for receipt_hash.
 * This is the canonical preimage definition.
 */
export interface ReceiptBody {
  schema_version: '1.0';
  run_id: string;
  timestamp: number;
  trace_id?: string;
  policy_hash: string;
  model_passport_id: string;
  compute_passport_id: string;
  runtime: string;
  image_hash?: string;
  model_hash?: string;
  attestation?: object;
  metrics: {
    ttft_ms: number;
    p95_ms?: number;
    tokens_in: number;
    tokens_out: number;
  };
}

export interface RunReceiptInput {
  model_passport_id: string;
  compute_passport_id: string;
  policy_hash: string;
  runtime: string;
  tokens_in: number;
  tokens_out: number;
  ttft_ms: number;
  p95_ms?: number;
  trace_id?: string;
  image_hash?: string;
  model_hash?: string;
  attestation?: object;
  // Optional: caller can provide run_id for idempotency
  run_id?: string;
}

export interface SignedReceipt {
  // Receipt body (hashable content)
  schema_version: '1.0';
  run_id: string;
  timestamp: number;
  trace_id?: string;
  policy_hash: string;
  model_passport_id: string;
  compute_passport_id: string;
  runtime: string;
  image_hash?: string;
  model_hash?: string;
  attestation?: object;
  metrics: {
    ttft_ms: number;
    p95_ms?: number;
    tokens_in: number;
    tokens_out: number;
  };
  // Signature envelope
  receipt_hash: string;
  receipt_signature: string;
  signer_pubkey: string;
  signer_type: 'orchestrator' | 'compute';
  // Optional anchoring info
  anchor?: {
    chain?: 'solana';
    tx?: string;
    root?: string;
    epoch_id?: string;
  };
  // Internal tracking (not in schema)
  _mmr_leaf_index?: number;
}

export interface ReceiptVerifyResult {
  hash_valid: boolean;
  signature_valid: boolean;
  inclusion_valid?: boolean;
  expected_hash?: string;
  computed_hash?: string;
  merkle_root?: string;
}

// In-memory store (MVP)
const receiptStore = new Map<string, SignedReceipt>();

// Idempotency store: maps idempotency key -> run_id
const idempotencyStore = new Map<string, string>();

/**
 * Extract the receipt body (the canonical preimage for hashing).
 * 
 * IMPORTANT: This defines the exact data that gets hashed.
 * Any change here will break existing receipts.
 */
function extractReceiptBody(receipt: SignedReceipt | ReceiptBody): ReceiptBody {
  const body: ReceiptBody = {
    schema_version: '1.0',
    run_id: receipt.run_id,
    timestamp: receipt.timestamp,
    policy_hash: receipt.policy_hash,
    model_passport_id: receipt.model_passport_id,
    compute_passport_id: receipt.compute_passport_id,
    runtime: receipt.runtime,
    metrics: {
      ttft_ms: receipt.metrics.ttft_ms,
      tokens_in: receipt.metrics.tokens_in,
      tokens_out: receipt.metrics.tokens_out,
    },
  };

  // Only include optional fields if present (for deterministic hashing)
  if (receipt.trace_id !== undefined) body.trace_id = receipt.trace_id;
  if (receipt.image_hash !== undefined) body.image_hash = receipt.image_hash;
  if (receipt.model_hash !== undefined) body.model_hash = receipt.model_hash;
  if (receipt.attestation !== undefined) body.attestation = receipt.attestation;
  if (receipt.metrics.p95_ms !== undefined) body.metrics.p95_ms = receipt.metrics.p95_ms;

  return body;
}

/**
 * Compute the canonical receipt hash.
 * 
 * Hash = sha256(JCS(receipt_body))
 */
function computeReceiptHash(body: ReceiptBody): string {
  return canonicalSha256Hex(body);
}

/**
 * Create a new run receipt with real signing.
 */
export function createReceipt(input: RunReceiptInput, idempotencyKey?: string): SignedReceipt {
  // Check idempotency
  if (idempotencyKey) {
    const existingRunId = idempotencyStore.get(idempotencyKey);
    if (existingRunId) {
      const existing = receiptStore.get(existingRunId);
      if (existing) {
        return existing;
      }
    }
  }

  // Generate run_id (use provided or generate new)
  const run_id = input.run_id || `run_${uuid().replace(/-/g, '')}`;
  
  // Check if run_id already exists
  if (receiptStore.has(run_id)) {
    const existing = receiptStore.get(run_id)!;
    return existing;
  }

  const timestamp = Math.floor(Date.now() / 1000);

  // Build receipt body
  const body: ReceiptBody = {
    schema_version: '1.0',
    run_id,
    timestamp,
    policy_hash: input.policy_hash,
    model_passport_id: input.model_passport_id,
    compute_passport_id: input.compute_passport_id,
    runtime: input.runtime,
    metrics: {
      ttft_ms: input.ttft_ms,
      tokens_in: input.tokens_in,
      tokens_out: input.tokens_out,
    },
  };

  // Add optional fields
  if (input.trace_id) body.trace_id = input.trace_id;
  if (input.image_hash) body.image_hash = input.image_hash;
  if (input.model_hash) body.model_hash = input.model_hash;
  if (input.attestation) body.attestation = input.attestation;
  if (input.p95_ms !== undefined) body.metrics.p95_ms = input.p95_ms;

  // Compute canonical hash
  const receipt_hash = computeReceiptHash(body);

  // Sign the hash with ed25519
  const { signature, publicKey } = signMessage(receipt_hash);

  // Build signed receipt
  const signed: SignedReceipt = {
    ...body,
    receipt_hash,
    receipt_signature: signature,
    signer_pubkey: publicKey,
    signer_type: 'orchestrator',
  };

  // Validate against schema
  const v = validateWithSchema('RunReceipt', signed);
  if (!v.ok) {
    throw new Error('Invalid receipt schema: ' + JSON.stringify(v.errors));
  }

  // Add to Merkle tree
  const tree = getReceiptTree();
  const leafIndex = tree.addLeaf(receipt_hash);
  signed._mmr_leaf_index = leafIndex;

  // Store receipt
  receiptStore.set(run_id, signed);

  // Store idempotency mapping
  if (idempotencyKey) {
    idempotencyStore.set(idempotencyKey, run_id);
  }

  return signed;
}

/**
 * Get a receipt by run_id.
 */
export function getReceipt(run_id: string): SignedReceipt | null {
  return receiptStore.get(run_id) || null;
}

/**
 * Verify a receipt's hash integrity.
 */
export function verifyReceiptHash(run_id: string): ReceiptVerifyResult {
  const receipt = receiptStore.get(run_id);
  if (!receipt) {
    return { hash_valid: false, signature_valid: false };
  }

  // Recompute hash from body
  const body = extractReceiptBody(receipt);
  const computed = computeReceiptHash(body);
  const hash_valid = computed === receipt.receipt_hash;

  // Verify signature
  const signature_valid = verifySignature(
    receipt.receipt_hash,
    receipt.receipt_signature,
    receipt.signer_pubkey
  );

  return {
    hash_valid,
    signature_valid,
    expected_hash: receipt.receipt_hash,
    computed_hash: computed,
  };
}

/**
 * Full receipt verification: hash + signature + inclusion.
 */
export function verifyReceipt(run_id: string): ReceiptVerifyResult {
  const receipt = receiptStore.get(run_id);
  if (!receipt) {
    return { hash_valid: false, signature_valid: false };
  }

  // Verify hash
  const body = extractReceiptBody(receipt);
  const computed = computeReceiptHash(body);
  const hash_valid = computed === receipt.receipt_hash;

  // Verify signature
  const signature_valid = verifySignature(
    receipt.receipt_hash,
    receipt.receipt_signature,
    receipt.signer_pubkey
  );

  // Verify Merkle inclusion
  let inclusion_valid: boolean | undefined;
  let merkle_root: string | undefined;
  
  if (receipt._mmr_leaf_index !== undefined) {
    const tree = getReceiptTree();
    const proof = tree.getProof(receipt._mmr_leaf_index);
    if (proof) {
      const result = MerkleTree.verifyProof(proof);
      inclusion_valid = result.valid;
      merkle_root = result.expectedRoot;
    }
  }

  return {
    hash_valid,
    signature_valid,
    inclusion_valid,
    expected_hash: receipt.receipt_hash,
    computed_hash: computed,
    merkle_root,
  };
}

/**
 * Get inclusion proof for a receipt.
 */
export function getReceiptProof(run_id: string): MerkleProof | null {
  const receipt = receiptStore.get(run_id);
  if (!receipt || receipt._mmr_leaf_index === undefined) {
    return null;
  }

  const tree = getReceiptTree();
  return tree.getProof(receipt._mmr_leaf_index);
}

/**
 * Verify an inclusion proof against the current or specific root.
 */
export function verifyReceiptProof(proof: MerkleProof, expectedRoot?: string): boolean {
  if (expectedRoot) {
    const result = MerkleTree.verifyProofAgainstRoot(proof, expectedRoot);
    return result.valid;
  }
  
  const result = MerkleTree.verifyProof(proof);
  return result.valid;
}

/**
 * Get the current Merkle root.
 */
export function getMmrRoot(): string {
  const tree = getReceiptTree();
  return tree.getRoot();
}

/**
 * Get the number of receipts in the tree.
 */
export function getMmrLeafCount(): number {
  const tree = getReceiptTree();
  return tree.getLeafCount();
}

/**
 * Get the orchestrator's public key for external verification.
 */
export function getSignerPublicKey(): string {
  return getOrchestratorPublicKey();
}

/**
 * List all receipts (for admin/debugging).
 */
export function listReceipts(): SignedReceipt[] {
  return Array.from(receiptStore.values());
}

/**
 * Reset all stores (for testing).
 */
export function resetReceiptStore(): void {
  receiptStore.clear();
  idempotencyStore.clear();
}
