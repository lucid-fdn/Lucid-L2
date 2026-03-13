// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title LucidValidator
 * @notice Minimal on-chain verifier for Lucid receipts and MMR proofs.
 *         Implements hooks compatible with ERC-8004's IValidationRegistry.
 *
 *         This contract is STATELESS — pure verification functions with no storage
 *         and no admin. Minimal attack surface.
 *
 * @dev Uses SHA-256 for MMR hashing to match the offchain TypeScript implementation
 *      in utils/mmr.ts. ed25519 signature verification is checked offchain and the
 *      result is submitted here as a boolean.
 */
contract LucidValidator {
    // =========================================================================
    // Events
    // =========================================================================

    event ValidationSubmitted(
        address indexed validationRegistry,
        uint256 indexed agentTokenId,
        bytes32 receiptHash,
        bool valid
    );

    // =========================================================================
    // Receipt Verification
    // =========================================================================

    /**
     * @notice Verify a Lucid receipt hash matches a given SHA-256 preimage.
     * @param receiptHash  The receipt_hash (SHA-256 of JCS-canonicalized receipt body)
     * @param preimage     The canonical receipt body bytes
     * @return valid       True if sha256(preimage) == receiptHash
     */
    function verifyReceiptHash(
        bytes32 receiptHash,
        bytes calldata preimage
    ) external pure returns (bool valid) {
        return sha256(preimage) == receiptHash;
    }

    /**
     * @notice Verify that a receipt hash was signed by a known signer.
     *         For MVP, ed25519 verification happens offchain. This function
     *         accepts a pre-verified result and the signer identity for logging.
     * @param receiptHash   The receipt hash
     * @param signature     The ed25519 signature (64 bytes) — stored for audit trail
     * @param signerPubkey  The signer's ed25519 public key (32 bytes)
     * @return valid        Always returns true (signature verified offchain)
     * @dev In a future version, this can use an ed25519 precompile (EIP-665) or
     *      a Solidity ed25519 library for full on-chain verification.
     */
    function validateReceipt(
        bytes32 receiptHash,
        bytes calldata signature,
        bytes32 signerPubkey
    ) external pure returns (bool valid) {
        // MVP: signature format check only (64 bytes for ed25519)
        // Full on-chain ed25519 verification deferred to Phase 2
        require(signature.length == 64, "Invalid signature length");
        require(receiptHash != bytes32(0), "Empty receipt hash");
        require(signerPubkey != bytes32(0), "Empty signer pubkey");
        return true;
    }

    // =========================================================================
    // MMR Proof Verification
    // =========================================================================

    /**
     * @notice Verify a Merkle Mountain Range inclusion proof.
     *         Matches the algorithm in offchain/src/utils/mmr.ts MerkleTree.verifyProof()
     *
     * @param leafHash      The hash of the leaf being proven
     * @param siblings      The sibling hashes along the path to the peak
     * @param peaks         All peak hashes of the MMR
     * @param leafIndex     The 0-based index of the leaf
     * @param expectedRoot  The expected MMR root (bag of peaks)
     * @return valid        True if the proof is valid
     */
    function verifyMMRProof(
        bytes32 leafHash,
        bytes32[] calldata siblings,
        bytes32[] calldata peaks,
        uint64 leafIndex,
        bytes32 expectedRoot
    ) external pure returns (bool valid) {
        // Step 1: Walk siblings to reconstruct the peak
        bytes32 current = leafHash;
        uint64 idx = leafIndex;

        for (uint256 i = 0; i < siblings.length; i++) {
            if (idx % 2 == 0) {
                // Current is left child
                current = sha256(abi.encodePacked(current, siblings[i]));
            } else {
                // Current is right child
                current = sha256(abi.encodePacked(siblings[i], current));
            }
            idx = idx / 2;
        }

        // Step 2: Verify the reconstructed value is one of the peaks
        bool foundPeak = false;
        for (uint256 i = 0; i < peaks.length; i++) {
            if (peaks[i] == current) {
                foundPeak = true;
                break;
            }
        }
        if (!foundPeak) return false;

        // Step 3: Bag the peaks to get the root and compare
        bytes32 computedRoot = _bagPeaks(peaks);
        return computedRoot == expectedRoot;
    }

    // =========================================================================
    // ERC-8004 Validation Registry Integration
    // =========================================================================

    /**
     * @notice Submit a validation result to an ERC-8004 Validation Registry.
     *         Calls requestValidation on the registry contract.
     *
     * @dev    Security model: This contract is stateless and delegates access control
     *         to the validation registry itself. The registry's `requestValidation`
     *         must enforce that only authorized callers (e.g., token owners) can submit
     *         validations for a given agentTokenId. If the registry rejects the call,
     *         this function reverts.
     *
     * @param validationRegistry  Address of the ERC-8004 ValidationRegistry
     * @param agentTokenId        The agent's token ID in the Identity Registry
     * @param receiptHash         The Lucid receipt hash being validated
     * @param valid               Whether the receipt is valid
     */
    function submitValidation(
        address validationRegistry,
        uint256 agentTokenId,
        bytes32 receiptHash,
        bool valid
    ) external {
        require(validationRegistry != address(0), "Invalid registry address");

        // Encode the validation result as metadata
        bytes memory metadata = abi.encode(valid, msg.sender);

        // Call the ERC-8004 Validation Registry
        (bool success, ) = validationRegistry.call(
            abi.encodeWithSignature(
                "requestValidation(uint256,bytes32,bytes)",
                agentTokenId,
                receiptHash,
                metadata
            )
        );
        require(success, "Validation registry call failed");

        emit ValidationSubmitted(validationRegistry, agentTokenId, receiptHash, valid);
    }

    // =========================================================================
    // zkML Proof Verification (Phase 3)
    // =========================================================================

    /**
     * @notice Delegate zkML proof verification to a ZkMLVerifier contract.
     * @param zkmlVerifier Address of the ZkMLVerifier contract
     * @param modelHash Model circuit hash
     * @param a Proof point A (uint256[2])
     * @param b Proof point B (uint256[2][2])
     * @param c Proof point C (uint256[2])
     * @param publicInputs Public inputs array
     * @return valid True if the proof is valid
     */
    function verifyZkMLProof(
        address zkmlVerifier,
        bytes32 modelHash,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicInputs
    ) external returns (bool valid) {
        require(zkmlVerifier != address(0), "Invalid verifier address");

        // Encode the call to ZkMLVerifier.verifyProof
        // We pass the proof components directly and let the verifier handle pairing
        (bool success, bytes memory result) = zkmlVerifier.call(
            abi.encodeWithSignature(
                "verifyProof(bytes32,(uint256,uint256),(uint256[2],uint256[2]),(uint256,uint256),uint256[])",
                modelHash,
                a,
                b,
                c,
                publicInputs
            )
        );

        if (!success) return false;
        return abi.decode(result, (bool));
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    /**
     * @dev Bag peaks by hashing them together left-to-right.
     *      Matches the offchain MMR root computation.
     */
    function _bagPeaks(bytes32[] calldata peaks) internal pure returns (bytes32) {
        require(peaks.length > 0, "No peaks");

        if (peaks.length == 1) {
            return peaks[0];
        }

        bytes32 root = peaks[0];
        for (uint256 i = 1; i < peaks.length; i++) {
            root = sha256(abi.encodePacked(root, peaks[i]));
        }
        return root;
    }
}
