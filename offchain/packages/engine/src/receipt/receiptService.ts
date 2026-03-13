/**
 * Receipt Service - Creates, stores, and verifies run receipts.
 * 
 * Key improvements over MVP stub:
 * 1. Real ed25519 signing (orchestrator-signed for MVP)
 * 2. Well-defined receipt hash preimage (JCS of receipt_body)
 * 3. Real Merkle tree for inclusion proofs
 * 4. Signature verification
 * 
 * Fluid Compute v0 Extensions:
 * 5. Extended receipt body with execution_mode, job_hash, quote_hash
 * 6. Quote hash computation for replay protection
 * 7. Job hash computation for binding
 * 8. Support for worker-signed receipts
 */
import { v4 as uuid } from 'uuid';
import { canonicalSha256Hex } from '../crypto/hash';
import { validateWithSchema } from '../crypto/schemaValidator';
import { signMessage, verifySignature, getOrchestratorPublicKey } from '../crypto/signing';
import { getReceiptMMR, ReceiptMMR, SerializedMMRProof } from '../crypto/receiptMMR';
import pool from '../db/pool';
import type {
  ExecutionMode,
  ComputeReceiptInput,
  OfferQuote,
  JobRequest,
  SignerType,
  ReceiptMetrics,
  ReceiptBilling,
} from '../types/fluidCompute';
import { logger } from '../lib/logger';

/**
 * Receipt body - the data that gets hashed for receipt_hash.
 * This is the canonical preimage definition.
 */
export interface InferenceReceiptBody {
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

export interface InferenceReceiptInput {
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

export interface InferenceReceipt {
  // Receipt body (hashable content)
  schema_version: '1.0';
  receipt_type: 'inference';
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
  // Phase 3: zkML proof attachment
  zkml_proof?: {
    proof: string;
    public_inputs: string[];
    model_circuit_hash: string;
    verified_onchain?: boolean;
    verification_tx?: string;
  };
}

export interface ReceiptVerifyResult {
  hash_valid: boolean;
  signature_valid: boolean;
  inclusion_valid?: boolean;
  expected_hash?: string;
  computed_hash?: string;
  merkle_root?: string;
}

// ============================================================================
// FLUID COMPUTE v0 - EXTENDED TYPES
// ============================================================================

/**
 * Extended Receipt Body for Fluid Compute v0.2.
 * Includes job binding, worker identity, output verification, and serverless fields.
 */
export interface ComputeReceiptBody {
  schema_version: '1.0';
  run_id: string;
  timestamp: number;
  trace_id?: string;

  // Model & Compute binding
  policy_hash: string;
  model_passport_id: string;
  compute_passport_id: string;
  /** Model revision (commit SHA or tag) for auditability */
  model_revision?: string;

  // Quote binding (NEW in v0)
  job_hash?: string;
  quote_hash?: string;

  // Worker identity (NEW in v0)
  node_id?: string;
  runtime_hash?: string | null;
  gpu_fingerprint?: string | null;

  // RunPod Serverless fields (NEW in v0.2)
  /** Capacity bucket name (runpod_serverless mode) */
  capacity_bucket?: string;
  /** RunPod endpoint ID (runpod_serverless mode) */
  endpoint_id?: string;
  /** Billing details for cost transparency */
  billing?: ReceiptBilling;

  // Output verification (NEW in v0)
  outputs_hash?: string;
  output_ref?: string;

  // Execution metadata (NEW in v0)
  execution_mode?: ExecutionMode;
  start_ts?: number;
  end_ts?: number;

  // Metrics
  runtime: string;
  metrics: ReceiptMetrics;

  // Audit trail (NEW in v0)
  input_ref?: string;

  // Structured errors (NEW in v0)
  error_code?: string;
  error_message?: string;

  // Legacy optional fields
  image_hash?: string;
  model_hash?: string;
  attestation?: object;
}

/**
 * Extended Signed Receipt for Fluid Compute v0.
 */
export interface ComputeReceipt extends ComputeReceiptBody {
  receipt_type: 'compute';
  receipt_hash: string;
  receipt_signature: string;
  signer_pubkey: string;
  signer_type: SignerType;
  anchor?: {
    chain?: 'solana';
    tx?: string;
    root?: string;
    epoch_id?: string;
  };
  _mmr_leaf_index?: number;
}

// ============================================================================
// RECEIPT TYPE DISCRIMINATOR
// ============================================================================

/** All supported receipt types in the Lucid execution layer */
export type ReceiptType = 'inference' | 'compute' | 'tool' | 'agent' | 'dataset' | 'memory';

// ============================================================================
// TOOL RECEIPT — Tool invocation receipts
// ============================================================================

/**
 * Tool receipt body — the data that gets hashed.
 * Records a single tool invocation by an agent or user.
 */
export interface ToolReceiptBody {
  schema_version: '1.0';
  run_id: string;
  timestamp: number;
  trace_id?: string;
  tool_passport_id: string;
  agent_passport_id?: string;
  input_hash: string;
  output_hash: string;
  latency_ms: number;
  success: boolean;
  error_code?: string;
  error_message?: string;
}

export interface ToolReceiptInput {
  tool_passport_id: string;
  agent_passport_id?: string;
  input_hash: string;
  output_hash: string;
  latency_ms: number;
  success: boolean;
  run_id?: string;
  trace_id?: string;
  error_code?: string;
  error_message?: string;
}

export interface ToolReceipt extends ToolReceiptBody {
  receipt_type: 'tool';
  receipt_hash: string;
  receipt_signature: string;
  signer_pubkey: string;
  signer_type: SignerType;
  anchor?: {
    chain?: string;
    tx?: string;
    root?: string;
    epoch_id?: string;
  };
  _mmr_leaf_index?: number;
}

// ============================================================================
// AGENT RECEIPT — Agent execution receipts (wraps sub-receipts)
// ============================================================================

/**
 * Agent receipt body — the data that gets hashed.
 * Records a complete agent execution, linking to child receipts.
 */
export interface AgentReceiptBody {
  schema_version: '1.0';
  run_id: string;
  timestamp: number;
  trace_id?: string;
  agent_passport_id: string;
  task_hash: string;
  sub_receipt_ids: string[];
  steps_count: number;
  total_tokens: number;
  total_cost_usd?: number;
  duration_ms: number;
  success: boolean;
  error_code?: string;
  error_message?: string;
}

export interface AgentReceiptInput {
  agent_passport_id: string;
  task_hash: string;
  sub_receipt_ids: string[];
  steps_count: number;
  total_tokens: number;
  total_cost_usd?: number;
  duration_ms: number;
  success: boolean;
  run_id?: string;
  trace_id?: string;
  error_code?: string;
  error_message?: string;
}

export interface AgentReceipt extends AgentReceiptBody {
  receipt_type: 'agent';
  receipt_hash: string;
  receipt_signature: string;
  signer_pubkey: string;
  signer_type: SignerType;
  anchor?: {
    chain?: string;
    tx?: string;
    root?: string;
    epoch_id?: string;
  };
  _mmr_leaf_index?: number;
}

// ============================================================================
// DATASET RECEIPT — Data access receipts
// ============================================================================

/**
 * Dataset receipt body — the data that gets hashed.
 * Records a dataset access event (download, query, or stream).
 */
export interface DatasetReceiptBody {
  schema_version: '1.0';
  run_id: string;
  timestamp: number;
  trace_id?: string;
  dataset_passport_id: string;
  consumer_passport_id?: string;
  access_type: 'download' | 'query' | 'stream';
  data_hash: string;
  rows_returned?: number;
  bytes_transferred: number;
  query_hash?: string;
}

export interface DatasetReceiptInput {
  dataset_passport_id: string;
  consumer_passport_id?: string;
  access_type: 'download' | 'query' | 'stream';
  data_hash: string;
  rows_returned?: number;
  bytes_transferred: number;
  query_hash?: string;
  run_id?: string;
  trace_id?: string;
}

export interface DatasetReceipt extends DatasetReceiptBody {
  receipt_type: 'dataset';
  receipt_hash: string;
  receipt_signature: string;
  signer_pubkey: string;
  signer_type: SignerType;
  anchor?: {
    chain?: string;
    tx?: string;
    root?: string;
    epoch_id?: string;
  };
  _mmr_leaf_index?: number;
}

// ============================================================================
// MEMORY RECEIPT — Memory write receipts
// ============================================================================

export interface MemoryReceiptBody {
  schema_version: '1.0';
  run_id: string;
  timestamp: number;
  agent_passport_id: string;
  memory_id: string;
  memory_type: string;
  content_hash: string;
  prev_hash: string | null;
  namespace: string;
}

export interface BatchedEpisodicReceiptBody {
  schema_version: '1.0';
  run_id: string;
  timestamp: number;
  agent_passport_id: string;
  session_id: string;
  entry_hashes: string[];
  entry_count: number;
  namespace: string;
}

export interface MemoryReceipt {
  receipt_type: 'memory';
  run_id: string;
  receipt_hash: string;
  receipt_signature: string;
  signer_pubkey: string;
  signer_type: SignerType;
  body: MemoryReceiptBody | BatchedEpisodicReceiptBody;
  _mmr_leaf_index?: number;
}

// ============================================================================
// UNIFIED RECEIPT MODEL
// ============================================================================

/** Discriminated union of all receipt types */
export type Receipt = InferenceReceipt | ComputeReceipt | ToolReceipt | AgentReceipt | DatasetReceipt | MemoryReceipt;

/** Options for the unified createReceipt function */
export interface ReceiptCreateOptions {
  signerType?: SignerType;
  idempotencyKey?: string;
  skipValidation?: boolean;
}

// ============================================================================
// HASH COMPUTATION FUNCTIONS
// ============================================================================

/**
 * Compute a quote hash for replay protection.
 * 
 * The quote hash binds the quote to specific pricing and terms.
 * 
 * quote_hash = SHA256(JCS({
 *   quote_id,
 *   offer_id,
 *   model_id,
 *   policy_hash,
 *   max_input_tokens,
 *   max_output_tokens,
 *   price,
 *   expires_at,
 *   terms_hash (optional)
 * }))
 * 
 * @param quote - The offer quote (without quote_hash and quote_signature)
 * @returns Hex-encoded SHA256 hash
 */
export function computeQuoteHash(quote: Omit<OfferQuote, 'quote_hash' | 'quote_signature'>): string {
  const hashBody: Record<string, unknown> = {
    quote_id: quote.quote_id,
    offer_id: quote.offer_id,
    model_id: quote.model_id,
    policy_hash: quote.policy_hash,
    max_input_tokens: quote.max_input_tokens,
    max_output_tokens: quote.max_output_tokens,
    price: quote.price,
    expires_at: quote.expires_at,
  };

  // Only include optional fields if present (v0.2 adds capacity_bucket)
  if (quote.capacity_bucket) hashBody.capacity_bucket = quote.capacity_bucket;
  if (quote.terms_hash) hashBody.terms_hash = quote.terms_hash;
  if (quote.worker_pubkey) hashBody.worker_pubkey = quote.worker_pubkey;

  return canonicalSha256Hex(hashBody);
}

/**
 * Compute a job hash for binding job to quote.
 * 
 * The job hash creates an immutable binding between the job request,
 * the model, and the quote that authorizes execution.
 * 
 * job_hash = SHA256(JCS({
 *   job_id,
 *   model_id,
 *   offer_id,
 *   quote_hash,
 *   input_hash
 * }))
 * 
 * @param job_id - Unique job identifier
 * @param model_id - Model passport ID
 * @param offer_id - Compute offer ID
 * @param quote_hash - Hash of the authorizing quote
 * @param input - Job input payload
 * @returns Hex-encoded SHA256 hash
 */
export function computeJobHash(
  job_id: string,
  model_id: string,
  offer_id: string,
  quote_hash: string,
  input: object
): string {
  const input_hash = canonicalSha256Hex(input);
  
  const hashBody = {
    job_id,
    model_id,
    offer_id,
    quote_hash,
    input_hash,
  };
  
  return canonicalSha256Hex(hashBody);
}

/**
 * Compute the input hash for a job.
 * 
 * @param input - Job input payload
 * @returns Hex-encoded SHA256 hash
 */
export function computeInputHash(input: object): string {
  return canonicalSha256Hex(input);
}

/**
 * Compute the outputs hash for verification.
 * 
 * @param output - Job output payload
 * @returns Hex-encoded SHA256 hash
 */
export function computeOutputsHash(output: object): string {
  return canonicalSha256Hex(output);
}

/**
 * Verify a quote hash matches the quote body.
 * 
 * @param quote - The full offer quote
 * @returns True if quote_hash matches computed hash
 */
export function verifyQuoteHash(quote: OfferQuote): boolean {
  const computed = computeQuoteHash(quote);
  return computed === quote.quote_hash;
}

/**
 * Verify a job hash matches the job request.
 * 
 * @param job - The full job request
 * @returns True if job_hash matches computed hash
 */
export function verifyJobHash(job: JobRequest): boolean {
  const computed = computeJobHash(
    job.job_id,
    job.model_id,
    job.offer_id,
    job.quote.quote_hash,
    job.input
  );
  return computed === job.job_hash;
}

// In-memory store (unified — all receipt types)
const receiptStore = new Map<string, Receipt>();

// Idempotency store: maps idempotency key -> run_id
const idempotencyStore = new Map<string, string>();

// ============================================================================
// DATABASE PERSISTENCE (write-through, non-blocking)
// ============================================================================

async function persistReceiptToDb(receipt: InferenceReceipt): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO receipts (receipt_hash, signature, signer_pubkey, signer_type, body, run_id, leaf_index, anchor_chain, anchor_tx, anchor_root, anchor_epoch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (receipt_hash) DO NOTHING`,
      [
        receipt.receipt_hash,
        receipt.receipt_signature,
        receipt.signer_pubkey,
        receipt.signer_type,
        JSON.stringify({
          schema_version: receipt.schema_version,
          run_id: receipt.run_id,
          timestamp: receipt.timestamp,
          trace_id: receipt.trace_id,
          policy_hash: receipt.policy_hash,
          model_passport_id: receipt.model_passport_id,
          compute_passport_id: receipt.compute_passport_id,
          runtime: receipt.runtime,
          metrics: receipt.metrics,
        }),
        receipt.run_id,
        receipt._mmr_leaf_index ?? null,
        receipt.anchor?.chain || null,
        receipt.anchor?.tx || null,
        receipt.anchor?.root || null,
        receipt.anchor?.epoch_id || null,
      ]
    );
  } catch (err) {
    logger.warn('[ReceiptService] DB persist failed (non-blocking):', err instanceof Error ? err.message : err);
  }
}

async function loadReceiptFromDb(run_id: string): Promise<InferenceReceipt | null> {
  try {
    const result = await pool.query(
      `SELECT receipt_hash, signature, signer_pubkey, signer_type, body, run_id,
              leaf_index, anchor_chain, anchor_tx, anchor_root, anchor_epoch_id
       FROM receipts WHERE run_id = $1 LIMIT 1`,
      [run_id]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    const body = row.body;
    return {
      ...body,
      receipt_type: 'inference' as const,
      receipt_hash: row.receipt_hash,
      receipt_signature: row.signature,
      signer_pubkey: row.signer_pubkey,
      signer_type: row.signer_type,
      _mmr_leaf_index: row.leaf_index ?? undefined,
      ...(row.anchor_chain ? {
        anchor: {
          chain: row.anchor_chain,
          tx: row.anchor_tx,
          root: row.anchor_root,
          epoch_id: row.anchor_epoch_id,
        }
      } : {}),
    } as InferenceReceipt;
  } catch (err) {
    return null;
  }
}

/**
 * Get a receipt by run_id with DB fallback (async).
 */
export async function getInferenceReceiptAsync(run_id: string): Promise<InferenceReceipt | null> {
  // Try in-memory first
  const inMemory = receiptStore.get(run_id);
  if (inMemory?.receipt_type === 'inference') return inMemory;

  // Fall back to DB
  return loadReceiptFromDb(run_id);
}

/**
 * Extract the receipt body (the canonical preimage for hashing).
 *
 * IMPORTANT: This defines the exact data that gets hashed.
 * Any change here will break existing receipts.
 */
function extractInferenceReceiptBody(receipt: InferenceReceipt | InferenceReceiptBody): InferenceReceiptBody {
  const body: InferenceReceiptBody = {
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
function computeInferenceReceiptHash(body: InferenceReceiptBody): string {
  return canonicalSha256Hex(body);
}

/**
 * Create a new run receipt with real signing.
 */
export function createInferenceReceipt(input: InferenceReceiptInput, idempotencyKey?: string): InferenceReceipt {
  // Check idempotency
  if (idempotencyKey) {
    const existingRunId = idempotencyStore.get(idempotencyKey);
    if (existingRunId) {
      const existing = receiptStore.get(existingRunId);
      if (existing?.receipt_type === 'inference') {
        return existing;
      }
    }
  }

  // Generate run_id (use provided or generate new)
  const run_id = input.run_id || `run_${uuid().replace(/-/g, '')}`;

  // Check if run_id already exists
  const existingById = receiptStore.get(run_id);
  if (existingById?.receipt_type === 'inference') {
    return existingById;
  }

  const timestamp = Math.floor(Date.now() / 1000);

  // Build receipt body
  const body: InferenceReceiptBody = {
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
  const receipt_hash = computeInferenceReceiptHash(body);

  // Sign the hash with ed25519
  const { signature, publicKey } = signMessage(receipt_hash);

  // Build signed receipt
  const signed: InferenceReceipt = {
    ...body,
    receipt_type: 'inference',
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

  // Add to MMR
  const mmr = getReceiptMMR();
  const leafIndex = mmr.addLeaf(receipt_hash);
  signed._mmr_leaf_index = leafIndex;

  // Phase 3: Optionally attach zkML proof if enabled
  if (process.env.ZKML_ENABLED === 'true') {
    try {
      // zkmlService lives in gateway-lite — use long path back to src
      const { getZkMLService } = require('../../../../src/services/zkml/zkmlService');
      const zkmlService = getZkMLService();
      const proof = zkmlService.generateProof({
        modelId: input.model_passport_id,
        inputHash: receipt_hash,
        outputHash: receipt_hash,
        policyHash: input.policy_hash,
      });
      signed.zkml_proof = {
        proof: JSON.stringify({ a: proof.a, b: proof.b, c: proof.c }),
        public_inputs: proof.publicInputs,
        model_circuit_hash: proof.modelCircuitHash,
        verified_onchain: false,
      };
    } catch {
      // zkML attachment is best-effort; don't fail the receipt
    }
  }

  // Store receipt
  receiptStore.set(run_id, signed);

  // Store idempotency mapping
  if (idempotencyKey) {
    idempotencyStore.set(idempotencyKey, run_id);
  }

  // Persist to DB (non-blocking)
  persistReceiptToDb(signed).catch(() => {});

  return signed;
}

/**
 * Get a receipt by run_id.
 */
export function getInferenceReceipt(run_id: string): InferenceReceipt | null {
  const r = receiptStore.get(run_id);
  return r?.receipt_type === 'inference' ? r : null;
}

/**
 * Verify a receipt's hash integrity.
 */
export function verifyInferenceReceiptHash(run_id: string): ReceiptVerifyResult {
  const receipt = receiptStore.get(run_id);
  if (!receipt || receipt.receipt_type !== 'inference') {
    return { hash_valid: false, signature_valid: false };
  }

  // Recompute hash from body
  const body = extractInferenceReceiptBody(receipt);
  const computed = computeInferenceReceiptHash(body);
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
export function verifyInferenceReceipt(run_id: string): ReceiptVerifyResult {
  const receipt = receiptStore.get(run_id);
  if (!receipt || receipt.receipt_type !== 'inference') {
    return { hash_valid: false, signature_valid: false };
  }

  // Verify hash
  const body = extractInferenceReceiptBody(receipt);
  const computed = computeInferenceReceiptHash(body);
  const hash_valid = computed === receipt.receipt_hash;

  // Verify signature
  const signature_valid = verifySignature(
    receipt.receipt_hash,
    receipt.receipt_signature,
    receipt.signer_pubkey
  );

  // Verify MMR inclusion
  let inclusion_valid: boolean | undefined;
  let merkle_root: string | undefined;

  if (receipt._mmr_leaf_index !== undefined) {
    const mmr = getReceiptMMR();
    const proof = mmr.getProof(receipt._mmr_leaf_index);
    if (proof) {
      inclusion_valid = ReceiptMMR.verifyProof(proof);
      merkle_root = proof.root;
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
 * Get inclusion proof for a receipt (sync, in-memory only).
 */
export function getInferenceReceiptProof(run_id: string): SerializedMMRProof | null {
  const receipt = receiptStore.get(run_id);
  if (!receipt || receipt.receipt_type !== 'inference' || receipt._mmr_leaf_index === undefined) {
    return null;
  }

  const mmr = getReceiptMMR();
  return mmr.getProof(receipt._mmr_leaf_index);
}

/**
 * Get inclusion proof with DB fallback (for post-restart scenarios).
 */
export async function getInferenceReceiptProofAsync(run_id: string): Promise<SerializedMMRProof | null> {
  // Try in-memory first
  const syncResult = getInferenceReceiptProof(run_id);
  if (syncResult) return syncResult;

  // Fall back to DB for the receipt (loads leaf_index)
  const receipt = await getInferenceReceiptAsync(run_id);
  if (!receipt || receipt._mmr_leaf_index === undefined) return null;

  const mmr = getReceiptMMR();
  return mmr.getProof(receipt._mmr_leaf_index);
}

/**
 * Verify an inclusion proof against the current or specific root.
 */
export function verifyReceiptProof(proof: SerializedMMRProof, expectedRoot?: string): boolean {
  return ReceiptMMR.verifyProof(proof, expectedRoot);
}

/**
 * Get the current MMR root.
 */
export function getMmrRoot(): string {
  return getReceiptMMR().getRoot();
}

/**
 * Get the number of receipts in the MMR.
 */
export function getMmrLeafCount(): number {
  return getReceiptMMR().getLeafCount();
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
export function listInferenceReceipts(): InferenceReceipt[] {
  return Array.from(receiptStore.values()).filter((r): r is InferenceReceipt => r.receipt_type === 'inference');
}

/**
 * Reset all stores (for testing).
 */
export function resetReceiptStore(): void {
  receiptStore.clear();
  idempotencyStore.clear();
}

// ============================================================================
// FLUID COMPUTE v0 - RECEIPT VALIDITY GATES
// ============================================================================

/**
 * Validation error for receipt gates.
 */
export class ReceiptValidationError extends Error {
  code: string;
  field?: string;
  
  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = 'ReceiptValidationError';
    this.code = code;
    this.field = field;
  }
}

/**
 * Receipt validation result.
 */
export interface ReceiptValidationResult {
  valid: boolean;
  errors: Array<{
    code: string;
    message: string;
    field?: string;
  }>;
}

/**
 * Validate an extended receipt input against Fluid Compute v0 requirements.
 * 
 * Gates enforced:
 * 1. execution_mode must be present
 * 2. job_hash must be present
 * 3. quote_hash must be present  
 * 4. outputs_hash must be present (unless error_code set)
 * 5. For byo_runtime mode: runtime_hash must NOT be null
 * 6. For byo_runtime mode: gpu_fingerprint must NOT be null
 * 
 * @param input - The extended receipt input to validate
 * @param strict - If true, throws on first error. If false, collects all errors.
 * @returns Validation result with all errors found
 * @throws ReceiptValidationError if strict mode and validation fails
 */
export function validateComputeReceiptInput(
  input: ComputeReceiptInput,
  strict: boolean = false
): ReceiptValidationResult {
  const errors: Array<{ code: string; message: string; field?: string }> = [];
  
  // Gate 1: execution_mode must be present
  if (!input.execution_mode) {
    const err = {
      code: 'MISSING_EXECUTION_MODE',
      message: 'execution_mode is required for Fluid Compute v0 receipts',
      field: 'execution_mode',
    };
    errors.push(err);
    if (strict) throw new ReceiptValidationError(err.code, err.message, err.field);
  }
  
  // Gate 2: job_hash must be present
  if (!input.job_hash) {
    const err = {
      code: 'MISSING_JOB_HASH',
      message: 'job_hash is required for Fluid Compute v0 receipts',
      field: 'job_hash',
    };
    errors.push(err);
    if (strict) throw new ReceiptValidationError(err.code, err.message, err.field);
  }
  
  // Gate 3: quote_hash must be present
  if (!input.quote_hash) {
    const err = {
      code: 'MISSING_QUOTE_HASH',
      message: 'quote_hash is required for Fluid Compute v0 receipts',
      field: 'quote_hash',
    };
    errors.push(err);
    if (strict) throw new ReceiptValidationError(err.code, err.message, err.field);
  }
  
  // Gate 4: outputs_hash must be present (unless error occurred)
  if (!input.outputs_hash && !input.error_code) {
    const err = {
      code: 'MISSING_OUTPUTS_HASH',
      message: 'outputs_hash is required for successful Fluid Compute v0 receipts',
      field: 'outputs_hash',
    };
    errors.push(err);
    if (strict) throw new ReceiptValidationError(err.code, err.message, err.field);
  }
  
  // Gates 5 & 6: BYO runtime specific checks
  if (input.execution_mode === 'byo_runtime') {
    // Gate 5: runtime_hash must NOT be null for byo_runtime
    if (input.runtime_hash === null || input.runtime_hash === undefined) {
      const err = {
        code: 'BYO_RUNTIME_MISSING_RUNTIME_HASH',
        message: 'runtime_hash is required for byo_runtime execution mode (must be Docker image digest)',
        field: 'runtime_hash',
      };
      errors.push(err);
      if (strict) throw new ReceiptValidationError(err.code, err.message, err.field);
    }

    // Gate 6: gpu_fingerprint must NOT be null for byo_runtime
    if (input.gpu_fingerprint === null || input.gpu_fingerprint === undefined) {
      const err = {
        code: 'BYO_RUNTIME_MISSING_GPU_FINGERPRINT',
        message: 'gpu_fingerprint is required for byo_runtime execution mode',
        field: 'gpu_fingerprint',
      };
      errors.push(err);
      if (strict) throw new ReceiptValidationError(err.code, err.message, err.field);
    }
  }

  // Gates 7-9: RunPod Serverless specific checks (v0.2)
  if (input.execution_mode === 'runpod_serverless') {
    // Gate 7: runtime_hash required for runpod_serverless (container you control)
    if (input.runtime_hash === null || input.runtime_hash === undefined) {
      const err = {
        code: 'RUNPOD_SERVERLESS_MISSING_RUNTIME_HASH',
        message: 'runtime_hash is required for runpod_serverless execution mode (your container image digest)',
        field: 'runtime_hash',
      };
      errors.push(err);
      if (strict) throw new ReceiptValidationError(err.code, err.message, err.field);
    }

    // Gate 8: gpu_fingerprint required (GPU type, not serial)
    if (input.gpu_fingerprint === null || input.gpu_fingerprint === undefined) {
      const err = {
        code: 'RUNPOD_SERVERLESS_MISSING_GPU_FINGERPRINT',
        message: 'gpu_fingerprint is required for runpod_serverless execution mode (GPU type)',
        field: 'gpu_fingerprint',
      };
      errors.push(err);
      if (strict) throw new ReceiptValidationError(err.code, err.message, err.field);
    }

    // Gate 9: endpoint_id recommended (warn only, not required)
    // Note: endpoint_id is the trust boundary for runpod_serverless
    // We don't fail validation, but logging a warning would be appropriate
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate an extended receipt input and throw if invalid.
 * Convenience wrapper for strict validation.
 * 
 * @param input - The extended receipt input to validate
 * @throws ReceiptValidationError if validation fails
 */
export function assertValidComputeReceiptInput(input: ComputeReceiptInput): void {
  validateComputeReceiptInput(input, true);
}

// ============================================================================
// FLUID COMPUTE v0 - EXTENDED RECEIPT FUNCTIONS
// ============================================================================

// Extended receipts now stored in unified receiptStore

/**
 * Extract the extended receipt body (the canonical preimage for hashing).
 * 
 * This is used for Fluid Compute v0 receipts with additional fields.
 * The order and inclusion of fields is critical for deterministic hashing.
 * 
 * @param receipt - The extended receipt
 * @returns The canonical body for hashing
 */
function extractComputeReceiptBody(receipt: ComputeReceipt | ComputeReceiptBody): ComputeReceiptBody {
  // Start with required fields in deterministic order
  const body: ComputeReceiptBody = {
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

  // Add optional fields only if present (deterministic hashing)
  // Order matters for JCS - these are added in alphabetical order
  
  if (receipt.attestation !== undefined) body.attestation = receipt.attestation;
  if (receipt.end_ts !== undefined) body.end_ts = receipt.end_ts;
  if (receipt.error_code !== undefined) body.error_code = receipt.error_code;
  if (receipt.error_message !== undefined) body.error_message = receipt.error_message;
  if (receipt.execution_mode !== undefined) body.execution_mode = receipt.execution_mode;
  if (receipt.gpu_fingerprint !== undefined) body.gpu_fingerprint = receipt.gpu_fingerprint;
  if (receipt.image_hash !== undefined) body.image_hash = receipt.image_hash;
  if (receipt.input_ref !== undefined) body.input_ref = receipt.input_ref;
  if (receipt.job_hash !== undefined) body.job_hash = receipt.job_hash;
  if (receipt.model_hash !== undefined) body.model_hash = receipt.model_hash;
  if (receipt.node_id !== undefined) body.node_id = receipt.node_id;
  if (receipt.output_ref !== undefined) body.output_ref = receipt.output_ref;
  if (receipt.outputs_hash !== undefined) body.outputs_hash = receipt.outputs_hash;
  if (receipt.quote_hash !== undefined) body.quote_hash = receipt.quote_hash;
  if (receipt.runtime_hash !== undefined) body.runtime_hash = receipt.runtime_hash;
  if (receipt.start_ts !== undefined) body.start_ts = receipt.start_ts;
  if (receipt.trace_id !== undefined) body.trace_id = receipt.trace_id;
  
  // Extended metrics
  if (receipt.metrics.p95_ms !== undefined) body.metrics.p95_ms = receipt.metrics.p95_ms;
  if (receipt.metrics.total_latency_ms !== undefined) body.metrics.total_latency_ms = receipt.metrics.total_latency_ms;
  if (receipt.metrics.queue_wait_ms !== undefined) body.metrics.queue_wait_ms = receipt.metrics.queue_wait_ms;
  if (receipt.metrics.model_load_ms !== undefined) body.metrics.model_load_ms = receipt.metrics.model_load_ms;
  if (receipt.metrics.cache_hit !== undefined) body.metrics.cache_hit = receipt.metrics.cache_hit;

  return body;
}

/**
 * Compute the canonical extended receipt hash.
 * 
 * Hash = sha256(JCS(extended_receipt_body))
 */
function computeComputeReceiptHash(body: ComputeReceiptBody): string {
  return canonicalSha256Hex(body);
}

/**
 * Create an extended receipt for Fluid Compute v0.2.
 *
 * This includes all new fields: execution_mode, job_hash, quote_hash,
 * node_id, runtime_hash, gpu_fingerprint, outputs_hash, etc.
 *
 * Receipt validity gates are enforced:
 * - execution_mode must be present
 * - job_hash must be present
 * - quote_hash must be present
 * - outputs_hash must be present (unless error_code set)
 * - For byo_runtime: runtime_hash and gpu_fingerprint must NOT be null
 * - For runpod_serverless: runtime_hash and gpu_fingerprint must NOT be null
 *   (gpu_fingerprint is GPU type only, not hardware serial)
 *
 * v0.2 additions:
 * - model_revision: for auditability (commit SHA or tag)
 * - capacity_bucket, endpoint_id: for runpod_serverless mode
 * - billing: cost transparency (compute_seconds, gpu_type, cost_usd)
 * - queue_time_ms, cold_start_ms: serverless metrics
 *
 * @param input - Extended receipt input
 * @param signerType - Who is signing: 'orchestrator' | 'compute' | 'worker'
 * @param idempotencyKey - Optional key for idempotent creation
 * @param skipValidation - Skip receipt validity gates (use with caution, only for legacy receipts)
 * @returns Signed extended receipt
 * @throws ReceiptValidationError if validation fails
 */
export function createComputeReceipt(
  input: ComputeReceiptInput,
  signerType: SignerType = 'orchestrator',
  idempotencyKey?: string,
  skipValidation: boolean = false
): ComputeReceipt {
  // Validate receipt input against Fluid Compute v0 gates
  if (!skipValidation) {
    const validation = validateComputeReceiptInput(input);
    if (!validation.valid) {
      const firstError = validation.errors[0];
      throw new ReceiptValidationError(
        firstError.code,
        `Receipt validation failed: ${validation.errors.map(e => e.message).join('; ')}`,
        firstError.field
      );
    }
  }

  // Check idempotency
  if (idempotencyKey) {
    const existingRunId = idempotencyStore.get(idempotencyKey);
    if (existingRunId) {
      const existing = receiptStore.get(existingRunId) as ComputeReceipt | undefined;
      if (existing) {
        return existing;
      }
    }
  }

  // Generate run_id (use provided or generate new)
  const run_id = input.run_id || `run_${uuid().replace(/-/g, '')}`;
  
  // Check if run_id already exists
  if (receiptStore.has(run_id)) {
    return receiptStore.get(run_id)! as ComputeReceipt;
  }

  const timestamp = Math.floor(Date.now() / 1000);

  // Build extended receipt body
  const body: ComputeReceiptBody = {
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

  // Add optional base fields
  if (input.trace_id) body.trace_id = input.trace_id;
  if (input.image_hash) body.image_hash = input.image_hash;
  if (input.model_hash) body.model_hash = input.model_hash;
  if (input.attestation) body.attestation = input.attestation;
  if (input.p95_ms !== undefined) body.metrics.p95_ms = input.p95_ms;

  // Add Fluid Compute v0 extended fields
  if (input.execution_mode) body.execution_mode = input.execution_mode;
  if (input.job_hash) body.job_hash = input.job_hash;
  if (input.quote_hash) body.quote_hash = input.quote_hash;
  if (input.node_id) body.node_id = input.node_id;
  if (input.runtime_hash !== undefined) body.runtime_hash = input.runtime_hash;
  if (input.gpu_fingerprint !== undefined) body.gpu_fingerprint = input.gpu_fingerprint;
  if (input.outputs_hash) body.outputs_hash = input.outputs_hash;
  if (input.output_ref) body.output_ref = input.output_ref;
  if (input.start_ts !== undefined) body.start_ts = input.start_ts;
  if (input.end_ts !== undefined) body.end_ts = input.end_ts;
  if (input.input_ref) body.input_ref = input.input_ref;
  if (input.error_code) body.error_code = input.error_code;
  if (input.error_message) body.error_message = input.error_message;

  // Add Fluid Compute v0.2 fields (RunPod Serverless support)
  if (input.model_revision) body.model_revision = input.model_revision;
  if (input.capacity_bucket) body.capacity_bucket = input.capacity_bucket;
  if (input.endpoint_id) body.endpoint_id = input.endpoint_id;
  if (input.billing) body.billing = input.billing;

  // Extended metrics
  if (input.total_latency_ms !== undefined) body.metrics.total_latency_ms = input.total_latency_ms;
  if (input.queue_wait_ms !== undefined) body.metrics.queue_wait_ms = input.queue_wait_ms;
  if (input.queue_time_ms !== undefined) body.metrics.queue_time_ms = input.queue_time_ms;
  if (input.cold_start_ms !== undefined) body.metrics.cold_start_ms = input.cold_start_ms;
  if (input.model_load_ms !== undefined) body.metrics.model_load_ms = input.model_load_ms;
  if (input.cache_hit !== undefined) body.metrics.cache_hit = input.cache_hit;

  // Compute canonical hash
  const receipt_hash = computeComputeReceiptHash(body);

  // Sign the hash with ed25519
  const { signature, publicKey } = signMessage(receipt_hash);

  // Build signed receipt
  const signed: ComputeReceipt = {
    ...body,
    receipt_type: 'compute',
    receipt_hash,
    receipt_signature: signature,
    signer_pubkey: publicKey,
    signer_type: signerType,
  };

  // Validate against schema
  const v = validateWithSchema('RunReceipt', signed);
  if (!v.ok) {
    throw new Error('Invalid extended receipt schema: ' + JSON.stringify(v.errors));
  }

  // Add to MMR
  const mmr = getReceiptMMR();
  const leafIndex = mmr.addLeaf(receipt_hash);
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
 * Get an extended receipt by run_id.
 */
export function getComputeReceipt(run_id: string): ComputeReceipt | null {
  const r = receiptStore.get(run_id);
  return r?.receipt_type === 'compute' ? r : null;
}

/**
 * Verify an extended receipt's hash and signature.
 */
export function verifyComputeReceipt(run_id: string): ReceiptVerifyResult {
  const receipt = receiptStore.get(run_id);
  if (!receipt || receipt.receipt_type !== 'compute') {
    return { hash_valid: false, signature_valid: false };
  }

  // Verify hash
  const body = extractComputeReceiptBody(receipt);
  const computed = computeComputeReceiptHash(body);
  const hash_valid = computed === receipt.receipt_hash;

  // Verify signature
  const signature_valid = verifySignature(
    receipt.receipt_hash,
    receipt.receipt_signature,
    receipt.signer_pubkey
  );

  // Verify MMR inclusion
  let inclusion_valid: boolean | undefined;
  let merkle_root: string | undefined;

  if (receipt._mmr_leaf_index !== undefined) {
    const mmr = getReceiptMMR();
    const proof = mmr.getProof(receipt._mmr_leaf_index);
    if (proof) {
      inclusion_valid = ReceiptMMR.verifyProof(proof);
      merkle_root = proof.root;
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
 * List all extended receipts (for admin/debugging).
 */
export function listComputeReceipts(): ComputeReceipt[] {
  return Array.from(receiptStore.values()).filter((r): r is ComputeReceipt => r.receipt_type === 'compute');
}

/**
 * Create receipt from a completed job result.
 * 
 * This is a convenience function for workers to create receipts
 * after job execution completes.
 * 
 * @param job - The original job request
 * @param result - The job execution result
 * @param workerId - ID of the worker that executed the job
 * @param executionMode - Execution mode used
 * @param runtimeHash - Docker image digest (null for managed_endpoint)
 * @param gpuFingerprint - GPU hardware fingerprint (null for managed_endpoint)
 */
export function createComputeReceiptFromJob(
  job: JobRequest,
  result: {
    output?: object;
    output_ref?: string;
    metrics: {
      ttft_ms: number;
      tokens_in: number;
      tokens_out: number;
      p95_ms?: number;
      total_latency_ms?: number;
      queue_wait_ms?: number;
      model_load_ms?: number;
      cache_hit?: boolean;
    };
    error_code?: string;
    error_message?: string;
    start_ts: number;
    end_ts: number;
  },
  workerId: string,
  executionMode: ExecutionMode,
  runtimeHash: string | null,
  gpuFingerprint: string | null
): ComputeReceipt {
  const outputs_hash = result.output ? computeOutputsHash(result.output) : undefined;
  
  return createComputeReceipt({
    // Required fields
    model_passport_id: job.model_id,
    compute_passport_id: job.offer_id,
    policy_hash: job.quote.policy_hash,
    runtime: executionMode === 'managed_endpoint' ? 'hf-inference-api' : 'vllm',
    tokens_in: result.metrics.tokens_in,
    tokens_out: result.metrics.tokens_out,
    ttft_ms: result.metrics.ttft_ms,
    
    // Optional base fields
    run_id: job.job_id, // Use job_id as run_id for traceability
    trace_id: job.trace_id,
    p95_ms: result.metrics.p95_ms,
    
    // Fluid Compute v0 extended fields
    execution_mode: executionMode,
    job_hash: job.job_hash,
    quote_hash: job.quote.quote_hash,
    node_id: workerId,
    runtime_hash: runtimeHash,
    gpu_fingerprint: gpuFingerprint,
    outputs_hash,
    output_ref: result.output_ref,
    start_ts: result.start_ts,
    end_ts: result.end_ts,
    input_ref: job.input_ref,
    error_code: result.error_code,
    error_message: result.error_message,
    
    // Extended metrics
    total_latency_ms: result.metrics.total_latency_ms,
    queue_wait_ms: result.metrics.queue_wait_ms,
    model_load_ms: result.metrics.model_load_ms,
    cache_hit: result.metrics.cache_hit,
  }, 'worker');
}

// ============================================================================
// BODY EXTRACTORS FOR NEW RECEIPT TYPES
// ============================================================================

function extractToolReceiptBody(receipt: ToolReceipt | ToolReceiptBody): ToolReceiptBody {
  const body: ToolReceiptBody = {
    schema_version: '1.0',
    run_id: receipt.run_id,
    timestamp: receipt.timestamp,
    tool_passport_id: receipt.tool_passport_id,
    input_hash: receipt.input_hash,
    output_hash: receipt.output_hash,
    latency_ms: receipt.latency_ms,
    success: receipt.success,
  };
  if (receipt.trace_id !== undefined) body.trace_id = receipt.trace_id;
  if (receipt.agent_passport_id !== undefined) body.agent_passport_id = receipt.agent_passport_id;
  if (receipt.error_code !== undefined) body.error_code = receipt.error_code;
  if (receipt.error_message !== undefined) body.error_message = receipt.error_message;
  return body;
}

function extractAgentReceiptBody(receipt: AgentReceipt | AgentReceiptBody): AgentReceiptBody {
  const body: AgentReceiptBody = {
    schema_version: '1.0',
    run_id: receipt.run_id,
    timestamp: receipt.timestamp,
    agent_passport_id: receipt.agent_passport_id,
    task_hash: receipt.task_hash,
    sub_receipt_ids: [...receipt.sub_receipt_ids],
    steps_count: receipt.steps_count,
    total_tokens: receipt.total_tokens,
    duration_ms: receipt.duration_ms,
    success: receipt.success,
  };
  if (receipt.trace_id !== undefined) body.trace_id = receipt.trace_id;
  if (receipt.total_cost_usd !== undefined) body.total_cost_usd = receipt.total_cost_usd;
  if (receipt.error_code !== undefined) body.error_code = receipt.error_code;
  if (receipt.error_message !== undefined) body.error_message = receipt.error_message;
  return body;
}

function extractDatasetReceiptBody(receipt: DatasetReceipt | DatasetReceiptBody): DatasetReceiptBody {
  const body: DatasetReceiptBody = {
    schema_version: '1.0',
    run_id: receipt.run_id,
    timestamp: receipt.timestamp,
    dataset_passport_id: receipt.dataset_passport_id,
    access_type: receipt.access_type,
    data_hash: receipt.data_hash,
    bytes_transferred: receipt.bytes_transferred,
  };
  if (receipt.trace_id !== undefined) body.trace_id = receipt.trace_id;
  if (receipt.consumer_passport_id !== undefined) body.consumer_passport_id = receipt.consumer_passport_id;
  if (receipt.rows_returned !== undefined) body.rows_returned = receipt.rows_returned;
  if (receipt.query_hash !== undefined) body.query_hash = receipt.query_hash;
  return body;
}

function extractMemoryReceiptBody(receipt: MemoryReceipt): MemoryReceiptBody | BatchedEpisodicReceiptBody {
  return receipt.body;
}

// ============================================================================
// GENERIC RECEIPT PIPELINE (shared by new receipt types)
// ============================================================================

/**
 * Generic receipt creation pipeline: body → hash → sign → MMR → store.
 * Used by tool, agent, and dataset receipts. Inference and compute keep
 * their existing (more complex) create functions as wrappers.
 */
function createReceiptGeneric<TBody extends { run_id: string }, TReceipt extends Receipt>(
  receiptType: ReceiptType,
  body: TBody,
  opts: ReceiptCreateOptions = {}
): TReceipt {
  const run_id = body.run_id;

  // Check idempotency
  if (opts.idempotencyKey) {
    const existingRunId = idempotencyStore.get(opts.idempotencyKey);
    if (existingRunId) {
      const existing = receiptStore.get(existingRunId);
      if (existing) return existing as TReceipt;
    }
  }

  // Check existing
  if (receiptStore.has(run_id)) {
    return receiptStore.get(run_id)! as TReceipt;
  }

  // Hash body (JCS canonical JSON)
  const receipt_hash = canonicalSha256Hex(body);

  // Sign with ed25519
  const { signature, publicKey } = signMessage(receipt_hash);

  // Build signed receipt
  const signed = {
    ...body,
    receipt_type: receiptType,
    receipt_hash,
    receipt_signature: signature,
    signer_pubkey: publicKey,
    signer_type: opts.signerType || 'orchestrator',
  } as unknown as TReceipt;

  // Add to MMR
  const mmr = getReceiptMMR();
  const leafIndex = mmr.addLeaf(receipt_hash);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (signed as any)._mmr_leaf_index = leafIndex;

  // Store
  receiptStore.set(run_id, signed as Receipt);

  // Idempotency
  if (opts.idempotencyKey) {
    idempotencyStore.set(opts.idempotencyKey, run_id);
  }

  return signed;
}

// ============================================================================
// TYPE-SPECIFIC CREATE FUNCTIONS (new receipt types)
// ============================================================================

/**
 * Create a tool receipt.
 */
export function createToolReceipt(input: ToolReceiptInput, opts: ReceiptCreateOptions = {}): ToolReceipt {
  const run_id = input.run_id || `run_${uuid().replace(/-/g, '')}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const body: ToolReceiptBody = {
    schema_version: '1.0',
    run_id,
    timestamp,
    tool_passport_id: input.tool_passport_id,
    input_hash: input.input_hash,
    output_hash: input.output_hash,
    latency_ms: input.latency_ms,
    success: input.success,
  };

  if (input.trace_id) body.trace_id = input.trace_id;
  if (input.agent_passport_id) body.agent_passport_id = input.agent_passport_id;
  if (input.error_code) body.error_code = input.error_code;
  if (input.error_message) body.error_message = input.error_message;

  return createReceiptGeneric<ToolReceiptBody, ToolReceipt>('tool', body, opts);
}

/**
 * Create an agent receipt.
 */
export function createAgentReceipt(input: AgentReceiptInput, opts: ReceiptCreateOptions = {}): AgentReceipt {
  const run_id = input.run_id || `run_${uuid().replace(/-/g, '')}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const body: AgentReceiptBody = {
    schema_version: '1.0',
    run_id,
    timestamp,
    agent_passport_id: input.agent_passport_id,
    task_hash: input.task_hash,
    sub_receipt_ids: [...input.sub_receipt_ids],
    steps_count: input.steps_count,
    total_tokens: input.total_tokens,
    duration_ms: input.duration_ms,
    success: input.success,
  };

  if (input.trace_id) body.trace_id = input.trace_id;
  if (input.total_cost_usd !== undefined) body.total_cost_usd = input.total_cost_usd;
  if (input.error_code) body.error_code = input.error_code;
  if (input.error_message) body.error_message = input.error_message;

  return createReceiptGeneric<AgentReceiptBody, AgentReceipt>('agent', body, opts);
}

/**
 * Create a dataset receipt.
 */
export function createDatasetReceipt(input: DatasetReceiptInput, opts: ReceiptCreateOptions = {}): DatasetReceipt {
  const run_id = input.run_id || `run_${uuid().replace(/-/g, '')}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const body: DatasetReceiptBody = {
    schema_version: '1.0',
    run_id,
    timestamp,
    dataset_passport_id: input.dataset_passport_id,
    access_type: input.access_type,
    data_hash: input.data_hash,
    bytes_transferred: input.bytes_transferred,
  };

  if (input.trace_id) body.trace_id = input.trace_id;
  if (input.consumer_passport_id) body.consumer_passport_id = input.consumer_passport_id;
  if (input.rows_returned !== undefined) body.rows_returned = input.rows_returned;
  if (input.query_hash) body.query_hash = input.query_hash;

  return createReceiptGeneric<DatasetReceiptBody, DatasetReceipt>('dataset', body, opts);
}

export function createMemoryReceipt(input: {
  agent_passport_id: string;
  memory_id: string;
  memory_type: string;
  content_hash: string;
  prev_hash: string | null;
  namespace: string;
  run_id?: string;
}): MemoryReceipt {
  const run_id = input.run_id || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const body: MemoryReceiptBody = {
    schema_version: '1.0',
    run_id,
    timestamp: Math.floor(Date.now() / 1000),
    agent_passport_id: input.agent_passport_id,
    memory_id: input.memory_id,
    memory_type: input.memory_type,
    content_hash: input.content_hash,
    prev_hash: input.prev_hash,
    namespace: input.namespace,
  };
  return createReceiptGeneric<MemoryReceiptBody, MemoryReceipt>('memory', body);
}

export function createBatchedEpisodicReceipt(input: {
  agent_passport_id: string;
  session_id: string;
  entry_hashes: string[];
  namespace: string;
  run_id?: string;
}): MemoryReceipt {
  const run_id = input.run_id || `mem_batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const body: BatchedEpisodicReceiptBody = {
    schema_version: '1.0',
    run_id,
    timestamp: Math.floor(Date.now() / 1000),
    agent_passport_id: input.agent_passport_id,
    session_id: input.session_id,
    entry_hashes: input.entry_hashes,
    entry_count: input.entry_hashes.length,
    namespace: input.namespace,
  };
  return createReceiptGeneric<BatchedEpisodicReceiptBody, MemoryReceipt>('memory', body as any);
}

// ============================================================================
// UNIFIED RECEIPT FUNCTIONS
// ============================================================================

/** Body extractor dispatch table */
const bodyExtractors: Record<ReceiptType, (receipt: Receipt) => object> = {
  inference: (r) => extractInferenceReceiptBody(r as InferenceReceipt),
  compute: (r) => extractComputeReceiptBody(r as ComputeReceipt),
  tool: (r) => extractToolReceiptBody(r as ToolReceipt),
  agent: (r) => extractAgentReceiptBody(r as AgentReceipt),
  dataset: (r) => extractDatasetReceiptBody(r as DatasetReceipt),
  memory: (r) => extractMemoryReceiptBody(r as MemoryReceipt),
};

/**
 * Create a receipt of any type — single entry point.
 */
export function createReceipt(type: 'inference', input: InferenceReceiptInput, opts?: ReceiptCreateOptions): InferenceReceipt;
export function createReceipt(type: 'compute', input: ComputeReceiptInput, opts?: ReceiptCreateOptions): ComputeReceipt;
export function createReceipt(type: 'tool', input: ToolReceiptInput, opts?: ReceiptCreateOptions): ToolReceipt;
export function createReceipt(type: 'agent', input: AgentReceiptInput, opts?: ReceiptCreateOptions): AgentReceipt;
export function createReceipt(type: 'dataset', input: DatasetReceiptInput, opts?: ReceiptCreateOptions): DatasetReceipt;
export function createReceipt(
  type: ReceiptType,
  input: InferenceReceiptInput | ComputeReceiptInput | ToolReceiptInput | AgentReceiptInput | DatasetReceiptInput,
  opts: ReceiptCreateOptions = {}
): Receipt {
  switch (type) {
    case 'inference':
      return createInferenceReceipt(input as InferenceReceiptInput, opts.idempotencyKey);
    case 'compute':
      return createComputeReceipt(
        input as ComputeReceiptInput,
        opts.signerType || 'orchestrator',
        opts.idempotencyKey,
        opts.skipValidation
      );
    case 'tool':
      return createToolReceipt(input as ToolReceiptInput, opts);
    case 'agent':
      return createAgentReceipt(input as AgentReceiptInput, opts);
    case 'dataset':
      return createDatasetReceipt(input as DatasetReceiptInput, opts);
    case 'memory':
      return createMemoryReceipt(input as any) as unknown as Receipt;
    default:
      throw new Error(`Unknown receipt type: ${type}`);
  }
}

/**
 * Get any receipt by run_id.
 */
export function getReceipt(run_id: string): Receipt | null {
  return receiptStore.get(run_id) || null;
}

/**
 * Verify any receipt's hash, signature, and inclusion proof.
 */
export function verifyReceipt(run_id: string): ReceiptVerifyResult {
  const receipt = receiptStore.get(run_id);
  if (!receipt) {
    return { hash_valid: false, signature_valid: false };
  }

  const extractor = bodyExtractors[receipt.receipt_type];
  const body = extractor(receipt);
  const computed = canonicalSha256Hex(body);
  const hash_valid = computed === receipt.receipt_hash;

  const signature_valid = verifySignature(
    receipt.receipt_hash,
    receipt.receipt_signature,
    receipt.signer_pubkey
  );

  let inclusion_valid: boolean | undefined;
  let merkle_root: string | undefined;

  if (receipt._mmr_leaf_index !== undefined) {
    const mmr = getReceiptMMR();
    const proof = mmr.getProof(receipt._mmr_leaf_index);
    if (proof) {
      inclusion_valid = ReceiptMMR.verifyProof(proof);
      merkle_root = proof.root;
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
 * Get inclusion proof for any receipt.
 */
export function getReceiptProof(run_id: string): SerializedMMRProof | null {
  const receipt = receiptStore.get(run_id);
  if (!receipt || receipt._mmr_leaf_index === undefined) {
    return null;
  }

  const mmr = getReceiptMMR();
  return mmr.getProof(receipt._mmr_leaf_index);
}

/**
 * List receipts, optionally filtered by type.
 */
export function listReceipts(type?: ReceiptType): Receipt[] {
  const all = Array.from(receiptStore.values());
  if (!type) return all;
  return all.filter(r => r.receipt_type === type);
}
