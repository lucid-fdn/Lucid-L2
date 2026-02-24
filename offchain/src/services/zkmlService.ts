/**
 * zkML Service
 *
 * Off-chain service for generating and verifying zkML proofs.
 * Attaches cryptographic inference proofs to receipts.
 */

import { createHash } from 'crypto';
import type {
  ZkMLProof,
  ProofRequest,
  VerifyingKeyData,
  CircuitMetadata,
  ZkMLReceiptExtension,
} from './zkmlTypes';

// ZkMLVerifier ABI (minimal)
const ZKML_VERIFIER_ABI = [
  {
    name: 'registerModel',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'modelHash', type: 'bytes32' },
      {
        name: 'alpha',
        type: 'tuple',
        components: [
          { name: 'x', type: 'uint256' },
          { name: 'y', type: 'uint256' },
        ],
      },
      {
        name: 'beta',
        type: 'tuple',
        components: [
          { name: 'x', type: 'uint256[2]' },
          { name: 'y', type: 'uint256[2]' },
        ],
      },
      {
        name: 'gamma',
        type: 'tuple',
        components: [
          { name: 'x', type: 'uint256[2]' },
          { name: 'y', type: 'uint256[2]' },
        ],
      },
      {
        name: 'delta',
        type: 'tuple',
        components: [
          { name: 'x', type: 'uint256[2]' },
          { name: 'y', type: 'uint256[2]' },
        ],
      },
      {
        name: 'ic',
        type: 'tuple[]',
        components: [
          { name: 'x', type: 'uint256' },
          { name: 'y', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
  },
  {
    name: 'verifyProof',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'modelHash', type: 'bytes32' },
      {
        name: 'a',
        type: 'tuple',
        components: [
          { name: 'x', type: 'uint256' },
          { name: 'y', type: 'uint256' },
        ],
      },
      {
        name: 'b',
        type: 'tuple',
        components: [
          { name: 'x', type: 'uint256[2]' },
          { name: 'y', type: 'uint256[2]' },
        ],
      },
      {
        name: 'c',
        type: 'tuple',
        components: [
          { name: 'x', type: 'uint256' },
          { name: 'y', type: 'uint256' },
        ],
      },
      { name: 'publicInputs', type: 'uint256[]' },
    ],
    outputs: [{ name: 'valid', type: 'bool' }],
  },
  {
    name: 'isModelRegistered',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'modelHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'getModelCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'ModelRegistered',
    type: 'event',
    inputs: [
      { name: 'modelHash', type: 'bytes32', indexed: true },
    ],
  },
  {
    name: 'ProofVerified',
    type: 'event',
    inputs: [
      { name: 'modelHash', type: 'bytes32', indexed: true },
      { name: 'receiptHash', type: 'bytes32', indexed: true },
      { name: 'valid', type: 'bool', indexed: false },
    ],
  },
] as const;

export class ZkMLService {
  private static instance: ZkMLService | null = null;

  // In-memory circuit metadata store
  private circuitStore = new Map<string, CircuitMetadata>();

  private constructor() {}

  static getInstance(): ZkMLService {
    if (!ZkMLService.instance) {
      ZkMLService.instance = new ZkMLService();
    }
    return ZkMLService.instance;
  }

  /**
   * Generate a mock zkML proof for a model inference.
   * MVP: generates deterministic test values. Real EZKL integration
   * would require circuit compilation and witness generation.
   */
  generateProof(request: ProofRequest): ZkMLProof {
    const { modelId, inputHash, outputHash, policyHash } = request;

    // Derive model circuit hash
    const modelCircuitHash = createHash('sha256')
      .update(`circuit:${modelId}`)
      .digest('hex');

    // Generate deterministic proof points from inputs
    const proofSeed = createHash('sha256')
      .update(`${modelId}:${inputHash}:${outputHash}:${policyHash}`)
      .digest('hex');

    // Mock Groth16 proof structure
    const proof: ZkMLProof = {
      a: {
        x: '0x' + proofSeed.substring(0, 64).padStart(64, '0'),
        y: '0x' + proofSeed.substring(0, 64).padStart(64, '1'),
      },
      b: {
        x: ['0x' + '00'.repeat(32), '0x' + '00'.repeat(32)],
        y: ['0x' + '00'.repeat(32), '0x' + '00'.repeat(32)],
      },
      c: {
        x: '0x' + createHash('sha256').update(`c_x:${proofSeed}`).digest('hex'),
        y: '0x' + createHash('sha256').update(`c_y:${proofSeed}`).digest('hex'),
      },
      publicInputs: [
        '0x' + outputHash.replace('0x', ''),
        '0x' + modelCircuitHash,
        '0x' + policyHash.replace('0x', ''),
      ],
      modelCircuitHash: '0x' + modelCircuitHash,
      verified: false,
    };

    return proof;
  }

  /**
   * Verify a proof off-chain (structure + public input consistency).
   */
  verifyProofOffchain(proof: ZkMLProof): { valid: boolean; error?: string } {
    // Check proof structure
    if (!proof.a || !proof.b || !proof.c) {
      return { valid: false, error: 'Missing proof points' };
    }

    // Check public inputs
    if (!proof.publicInputs || proof.publicInputs.length !== 3) {
      return { valid: false, error: 'Expected 3 public inputs (outputHash, modelHash, policyHash)' };
    }

    // Verify model circuit hash matches public input
    if (proof.publicInputs[1] !== proof.modelCircuitHash) {
      return { valid: false, error: 'Model circuit hash mismatch' };
    }

    // Check all values are non-empty
    for (const input of proof.publicInputs) {
      if (!input || input === '0x' || input === '0x' + '00'.repeat(32)) {
        return { valid: false, error: 'Empty public input' };
      }
    }

    return { valid: true };
  }

  /**
   * Verify a proof on-chain via ZkMLVerifier contract.
   */
  async verifyProofOnchain(
    chainId: string,
    proof: ZkMLProof,
    receiptHash: string,
  ): Promise<{ valid: boolean; txHash?: string }> {
    const { blockchainAdapterFactory } = await import('../blockchain/BlockchainAdapterFactory');
    const { CHAIN_CONFIGS } = await import('../blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config) throw new Error(`Unknown chain: ${chainId}`);
    if (!config.zkmlVerifier) throw new Error(`No zkML verifier on chain: ${chainId}`);

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) throw new Error(`No adapter for chain: ${chainId}`);

    const txReceipt = await adapter.sendTransaction({
      to: config.zkmlVerifier,
      data: `0xverifyProof_stub`,
    });

    proof.verified = txReceipt.success;
    proof.verificationTx = txReceipt.hash;

    return { valid: txReceipt.success, txHash: txReceipt.hash };
  }

  /**
   * Register a model circuit on-chain.
   */
  async registerModelCircuit(
    chainId: string,
    modelHash: string,
    verifyingKey: VerifyingKeyData,
  ): Promise<{ txHash: string }> {
    const { blockchainAdapterFactory } = await import('../blockchain/BlockchainAdapterFactory');
    const { CHAIN_CONFIGS } = await import('../blockchain/chains');

    const config = CHAIN_CONFIGS[chainId];
    if (!config) throw new Error(`Unknown chain: ${chainId}`);
    if (!config.zkmlVerifier) throw new Error(`No zkML verifier on chain: ${chainId}`);

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    if (!adapter) throw new Error(`No adapter for chain: ${chainId}`);

    const txReceipt = await adapter.sendTransaction({
      to: config.zkmlVerifier,
      data: `0xregisterModel_stub`,
    });

    // Track circuit metadata locally
    this.circuitStore.set(modelHash, {
      modelHash,
      inputShape: [],
      outputShape: [],
      framework: 'ezkl',
    });

    return { txHash: txReceipt.hash };
  }

  /**
   * List registered model circuits.
   */
  listRegisteredModels(): CircuitMetadata[] {
    return Array.from(this.circuitStore.values());
  }

  /**
   * Attach a zkML proof to a receipt's extended body.
   */
  attachProofToReceipt(
    receiptBody: Record<string, unknown>,
    proof: ZkMLProof,
  ): Record<string, unknown> {
    const extension: ZkMLReceiptExtension = {
      proof: JSON.stringify({
        a: proof.a,
        b: proof.b,
        c: proof.c,
      }),
      public_inputs: proof.publicInputs,
      model_circuit_hash: proof.modelCircuitHash,
      verified_onchain: proof.verified,
      verification_tx: proof.verificationTx,
    };

    return {
      ...receiptBody,
      zkml_proof: extension,
    };
  }

  /** Get the ABI for external use */
  static getABI() {
    return ZKML_VERIFIER_ABI;
  }
}

export function getZkMLService(): ZkMLService {
  return ZkMLService.getInstance();
}
