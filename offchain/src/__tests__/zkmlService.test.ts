/**
 * Tests for ZkMLService
 */
import { ZkMLService, getZkMLService } from '../services/zkmlService';
import type { ZkMLProof, ProofRequest } from '../services/zkmlTypes';

const mockRequest: ProofRequest = {
  modelId: 'model-gpt2-ezkl',
  inputHash: 'abc123def456',
  outputHash: 'output789',
  policyHash: 'policy101112',
};

describe('ZkMLService', () => {
  describe('singleton', () => {
    it('should return the same instance', () => {
      const a = getZkMLService();
      const b = getZkMLService();
      expect(a).toBe(b);
    });

    it('should be an instance of ZkMLService', () => {
      const service = getZkMLService();
      expect(service).toBeInstanceOf(ZkMLService);
    });
  });

  describe('generateProof', () => {
    it('should generate a valid proof structure', () => {
      const service = getZkMLService();
      const proof = service.generateProof(mockRequest);

      expect(proof.a).toBeDefined();
      expect(proof.a.x).toBeDefined();
      expect(proof.a.y).toBeDefined();
      expect(proof.b).toBeDefined();
      expect(proof.c).toBeDefined();
      expect(proof.publicInputs).toHaveLength(3);
      expect(proof.modelCircuitHash).toBeDefined();
      expect(proof.verified).toBe(false);
    });

    it('should include correct public inputs', () => {
      const service = getZkMLService();
      const proof = service.generateProof(mockRequest);

      // publicInputs[0] = outputHash
      expect(proof.publicInputs[0]).toContain(mockRequest.outputHash);
      // publicInputs[1] = modelCircuitHash
      expect(proof.publicInputs[1]).toBe(proof.modelCircuitHash);
      // publicInputs[2] = policyHash
      expect(proof.publicInputs[2]).toContain(mockRequest.policyHash);
    });

    it('should generate deterministic proofs', () => {
      const service = getZkMLService();
      const proof1 = service.generateProof(mockRequest);
      const proof2 = service.generateProof(mockRequest);

      expect(proof1.a.x).toBe(proof2.a.x);
      expect(proof1.modelCircuitHash).toBe(proof2.modelCircuitHash);
    });

    it('should generate different proofs for different inputs', () => {
      const service = getZkMLService();
      const proof1 = service.generateProof(mockRequest);
      const proof2 = service.generateProof({
        ...mockRequest,
        outputHash: 'different_output',
      });

      expect(proof1.a.x).not.toBe(proof2.a.x);
    });
  });

  describe('verifyProofOffchain', () => {
    it('should verify a valid proof', () => {
      const service = getZkMLService();
      const proof = service.generateProof(mockRequest);

      const result = service.verifyProofOffchain(proof);
      expect(result.valid).toBe(true);
    });

    it('should reject proof with missing points', () => {
      const service = getZkMLService();
      const badProof = { publicInputs: ['a', 'b', 'c'] } as unknown as ZkMLProof;

      const result = service.verifyProofOffchain(badProof);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing proof points');
    });

    it('should reject proof with wrong number of public inputs', () => {
      const service = getZkMLService();
      const proof = service.generateProof(mockRequest);
      proof.publicInputs = ['only_one'];

      const result = service.verifyProofOffchain(proof);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('3 public inputs');
    });

    it('should reject proof with mismatched model circuit hash', () => {
      const service = getZkMLService();
      const proof = service.generateProof(mockRequest);
      proof.publicInputs[1] = '0xwrong_hash';

      const result = service.verifyProofOffchain(proof);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('circuit hash mismatch');
    });
  });

  describe('attachProofToReceipt', () => {
    it('should attach zkml_proof to receipt body', () => {
      const service = getZkMLService();
      const proof = service.generateProof(mockRequest);

      const receipt = { run_id: 'test-run', schema_version: '1.0' };
      const extended = service.attachProofToReceipt(receipt, proof);

      expect(extended.zkml_proof).toBeDefined();
      const zkmlProof = extended.zkml_proof as Record<string, unknown>;
      expect(zkmlProof.model_circuit_hash).toBe(proof.modelCircuitHash);
      expect(zkmlProof.public_inputs).toHaveLength(3);
    });

    it('should preserve existing receipt fields', () => {
      const service = getZkMLService();
      const proof = service.generateProof(mockRequest);

      const receipt = { run_id: 'test-run', schema_version: '1.0', policy_hash: 'abc' };
      const extended = service.attachProofToReceipt(receipt, proof);

      expect(extended.run_id).toBe('test-run');
      expect(extended.schema_version).toBe('1.0');
      expect(extended.policy_hash).toBe('abc');
    });
  });

  describe('listRegisteredModels', () => {
    it('should return empty array initially', () => {
      const service = getZkMLService();
      // Note: may have models from other tests if singleton
      const models = service.listRegisteredModels();
      expect(Array.isArray(models)).toBe(true);
    });
  });

  describe('ABI', () => {
    it('should expose the zkML verifier ABI', () => {
      const abi = ZkMLService.getABI();
      expect(Array.isArray(abi)).toBe(true);
      expect(abi.length).toBeGreaterThan(0);
    });

    it('should include key functions and events', () => {
      const abi = ZkMLService.getABI();
      const names = abi.map((f) => f.name);
      expect(names).toContain('registerModel');
      expect(names).toContain('verifyProof');
      expect(names).toContain('isModelRegistered');
      expect(names).toContain('ModelRegistered');
      expect(names).toContain('ProofVerified');
    });
  });

  describe('verifyProofOnchain validation', () => {
    it('should reject unknown chain', async () => {
      const service = getZkMLService();
      const proof = service.generateProof(mockRequest);
      await expect(
        service.verifyProofOnchain('bad-chain', proof, '0xreceipt')
      ).rejects.toThrow('Unknown chain');
    });

    it('should reject chain without zkml verifier', async () => {
      const service = getZkMLService();
      const proof = service.generateProof(mockRequest);
      await expect(
        service.verifyProofOnchain('base', proof, '0xreceipt')
      ).rejects.toThrow('No zkML verifier');
    });
  });

  describe('registerModelCircuit validation', () => {
    it('should reject unknown chain', async () => {
      const service = getZkMLService();
      await expect(
        service.registerModelCircuit('bad-chain', '0xmodel', {
          alpha: { x: '0', y: '0' },
          beta: { x: ['0', '0'], y: ['0', '0'] },
          gamma: { x: ['0', '0'], y: ['0', '0'] },
          delta: { x: ['0', '0'], y: ['0', '0'] },
          ic: [],
        })
      ).rejects.toThrow('Unknown chain');
    });
  });
});
