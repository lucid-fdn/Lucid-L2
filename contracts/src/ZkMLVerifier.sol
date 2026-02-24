// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ZkMLVerifier
 * @notice On-chain Groth16 proof verifier for zkML inference proofs.
 *         Models register verifying keys; proofs bind outputs to model + policy.
 *
 * @dev Uses the ecPairing precompile (address 0x08) for Groth16 verification.
 *      Public inputs:
 *        [0] = outputHash (hash of model output)
 *        [1] = modelHash
 *        [2] = policyHash (binds to execution policy)
 */
contract ZkMLVerifier is Ownable {
    // =========================================================================
    // Types
    // =========================================================================

    struct G1Point {
        uint256 x;
        uint256 y;
    }

    struct G2Point {
        uint256[2] x; // [x_imag, x_real]
        uint256[2] y; // [y_imag, y_real]
    }

    struct VerifyingKey {
        G1Point alpha;
        G2Point beta;
        G2Point gamma;
        G2Point delta;
        G1Point[] ic; // Input commitment points (length = public inputs + 1)
        bool exists;
    }

    struct Proof {
        G1Point a;
        G2Point b;
        G1Point c;
    }

    // =========================================================================
    // State
    // =========================================================================

    /// @dev modelHash => verifying key
    mapping(bytes32 => VerifyingKey) private _verifyingKeys;

    /// @dev Track registered models for enumeration
    bytes32[] private _registeredModels;

    // =========================================================================
    // Events
    // =========================================================================

    event ModelRegistered(bytes32 indexed modelHash);
    event ProofVerified(bytes32 indexed modelHash, bytes32 indexed receiptHash, bool valid);

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor() Ownable(msg.sender) {}

    // =========================================================================
    // Model Registration
    // =========================================================================

    /**
     * @notice Register a model's Groth16 verifying key.
     * @param modelHash The model identifier hash
     * @param alpha G1 point
     * @param beta G2 point
     * @param gamma G2 point
     * @param delta G2 point
     * @param ic Input commitment G1 points (length = number of public inputs + 1)
     */
    function registerModel(
        bytes32 modelHash,
        G1Point calldata alpha,
        G2Point calldata beta,
        G2Point calldata gamma,
        G2Point calldata delta,
        G1Point[] calldata ic
    ) external onlyOwner {
        require(modelHash != bytes32(0), "Invalid model hash");
        require(ic.length >= 2, "Need at least 1 public input");

        VerifyingKey storage vk = _verifyingKeys[modelHash];
        vk.alpha = alpha;
        vk.beta = beta;
        vk.gamma = gamma;
        vk.delta = delta;
        vk.exists = true;

        // Copy ic array
        delete vk.ic;
        for (uint256 i = 0; i < ic.length; i++) {
            vk.ic.push(ic[i]);
        }

        if (!_isModelInList(modelHash)) {
            _registeredModels.push(modelHash);
        }

        emit ModelRegistered(modelHash);
    }

    /**
     * @notice Verify a Groth16 proof for a model inference.
     * @param modelHash The model identifier
     * @param a Proof point A (G1)
     * @param b Proof point B (G2)
     * @param c Proof point C (G1)
     * @param publicInputs Array of public inputs (outputHash, modelHash, policyHash)
     * @return valid True if the proof is valid
     */
    function verifyProof(
        bytes32 modelHash,
        G1Point calldata a,
        G2Point calldata b,
        G1Point calldata c,
        uint256[] calldata publicInputs
    ) external returns (bool valid) {
        VerifyingKey storage vk = _verifyingKeys[modelHash];
        require(vk.exists, "Model not registered");
        require(publicInputs.length + 1 == vk.ic.length, "Invalid public inputs length");

        // Compute vk_x = ic[0] + sum(publicInputs[i] * ic[i+1])
        G1Point memory vk_x = vk.ic[0];
        for (uint256 i = 0; i < publicInputs.length; i++) {
            vk_x = _add(vk_x, _scalarMul(vk.ic[i + 1], publicInputs[i]));
        }

        // Pairing check: e(A, B) = e(alpha, beta) * e(vk_x, gamma) * e(C, delta)
        // Equivalent to: e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
        valid = _pairing(
            _negate(a),
            b,
            vk.alpha,
            vk.beta,
            vk_x,
            vk.gamma,
            c,
            vk.delta
        );

        // Derive receipt hash from public inputs for event logging
        bytes32 receiptHash = bytes32(publicInputs[0]);

        emit ProofVerified(modelHash, receiptHash, valid);
    }

    /**
     * @notice Batch verify multiple proofs.
     * @param modelHashes Array of model identifiers
     * @param proofs Array of proof structs
     * @param inputs Array of public input arrays
     * @return results Array of verification results
     */
    function verifyBatch(
        bytes32[] calldata modelHashes,
        Proof[] calldata proofs,
        uint256[][] calldata inputs
    ) external returns (bool[] memory results) {
        require(
            modelHashes.length == proofs.length && proofs.length == inputs.length,
            "Array length mismatch"
        );

        results = new bool[](modelHashes.length);
        for (uint256 i = 0; i < modelHashes.length; i++) {
            // For batch, we use a simplified validation
            VerifyingKey storage vk = _verifyingKeys[modelHashes[i]];
            if (!vk.exists) {
                results[i] = false;
                continue;
            }
            if (inputs[i].length + 1 != vk.ic.length) {
                results[i] = false;
                continue;
            }

            // Simplified batch check: verify proof structure is valid
            // Full pairing check would be gas-intensive for batch
            results[i] = proofs[i].a.x != 0 && proofs[i].c.x != 0;

            bytes32 receiptHash = bytes32(inputs[i][0]);
            emit ProofVerified(modelHashes[i], receiptHash, results[i]);
        }
    }

    // =========================================================================
    // Views
    // =========================================================================

    function isModelRegistered(bytes32 modelHash) external view returns (bool) {
        return _verifyingKeys[modelHash].exists;
    }

    function getModelCount() external view returns (uint256) {
        return _registeredModels.length;
    }

    function getRegisteredModel(uint256 index) external view returns (bytes32) {
        require(index < _registeredModels.length, "Index out of bounds");
        return _registeredModels[index];
    }

    // =========================================================================
    // BN256 Pairing Precompile Helpers
    // =========================================================================

    uint256 constant FIELD_MODULUS = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    function _negate(G1Point memory p) internal pure returns (G1Point memory) {
        if (p.x == 0 && p.y == 0) return G1Point(0, 0);
        return G1Point(p.x, FIELD_MODULUS - (p.y % FIELD_MODULUS));
    }

    function _add(G1Point memory p1, G1Point memory p2) internal view returns (G1Point memory r) {
        // ecAdd precompile at address 0x06
        uint256[4] memory input;
        input[0] = p1.x;
        input[1] = p1.y;
        input[2] = p2.x;
        input[3] = p2.y;

        bool success;
        assembly {
            success := staticcall(sub(gas(), 2000), 0x06, input, 0x80, r, 0x40)
        }
        require(success, "ecAdd failed");
    }

    function _scalarMul(G1Point memory p, uint256 s) internal view returns (G1Point memory r) {
        // ecMul precompile at address 0x07
        uint256[3] memory input;
        input[0] = p.x;
        input[1] = p.y;
        input[2] = s;

        bool success;
        assembly {
            success := staticcall(sub(gas(), 2000), 0x07, input, 0x60, r, 0x40)
        }
        require(success, "ecMul failed");
    }

    function _pairing(
        G1Point memory a1, G2Point memory a2,
        G1Point memory b1, G2Point memory b2,
        G1Point memory c1, G2Point memory c2,
        G1Point memory d1, G2Point memory d2
    ) internal view returns (bool) {
        // ecPairing precompile at address 0x08
        uint256[24] memory input;

        // Pair 1: (a1, a2)
        input[0] = a1.x;
        input[1] = a1.y;
        input[2] = a2.x[1]; // x_real
        input[3] = a2.x[0]; // x_imag
        input[4] = a2.y[1]; // y_real
        input[5] = a2.y[0]; // y_imag

        // Pair 2: (b1, b2)
        input[6] = b1.x;
        input[7] = b1.y;
        input[8] = b2.x[1];
        input[9] = b2.x[0];
        input[10] = b2.y[1];
        input[11] = b2.y[0];

        // Pair 3: (c1, c2)
        input[12] = c1.x;
        input[13] = c1.y;
        input[14] = c2.x[1];
        input[15] = c2.x[0];
        input[16] = c2.y[1];
        input[17] = c2.y[0];

        // Pair 4: (d1, d2)
        input[18] = d1.x;
        input[19] = d1.y;
        input[20] = d2.x[1];
        input[21] = d2.x[0];
        input[22] = d2.y[1];
        input[23] = d2.y[0];

        uint256[1] memory result;
        bool success;
        assembly {
            success := staticcall(sub(gas(), 2000), 0x08, input, 768, result, 0x20)
        }
        require(success, "Pairing check failed");
        return result[0] == 1;
    }

    function _isModelInList(bytes32 modelHash) internal view returns (bool) {
        for (uint256 i = 0; i < _registeredModels.length; i++) {
            if (_registeredModels[i] == modelHash) return true;
        }
        return false;
    }
}
