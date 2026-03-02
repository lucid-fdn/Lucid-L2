/**
 * zkML Types
 *
 * TypeScript types for zero-knowledge machine learning proof integration.
 */

export interface G1Point {
  x: string;
  y: string;
}

export interface G2Point {
  x: [string, string]; // [x_imag, x_real]
  y: [string, string]; // [y_imag, y_real]
}

export interface ZkMLProof {
  /** Groth16 proof point A (G1) */
  a: G1Point;
  /** Groth16 proof point B (G2) */
  b: G2Point;
  /** Groth16 proof point C (G1) */
  c: G1Point;
  /** Public inputs: [outputHash, modelHash, policyHash] */
  publicInputs: string[];
  /** Model circuit hash */
  modelCircuitHash: string;
  /** Whether the proof has been verified on-chain */
  verified?: boolean;
  /** On-chain verification tx hash */
  verificationTx?: string;
}

export interface CircuitMetadata {
  modelHash: string;
  inputShape: number[];
  outputShape: number[];
  framework: string; // 'ezkl' | 'circom' | 'custom'
}

export interface VerifyingKeyData {
  alpha: G1Point;
  beta: G2Point;
  gamma: G2Point;
  delta: G2Point;
  ic: G1Point[];
}

export interface ProofRequest {
  modelId: string;
  inputHash: string;
  outputHash: string;
  policyHash: string;
}

export interface ZkMLReceiptExtension {
  proof: string; // JSON-encoded proof
  public_inputs: string[];
  model_circuit_hash: string;
  verified_onchain?: boolean;
  verification_tx?: string;
}
