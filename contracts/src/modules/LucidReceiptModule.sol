// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IModule.sol";

/**
 * @title LucidReceiptModule
 * @notice ERC-7579 Executor module for emitting structured receipt events.
 *         Stateless — just emits events that offchain indexers pick up.
 */
contract LucidReceiptModule is IModule {
    // =========================================================================
    // Events
    // =========================================================================

    event ReceiptEmitted(
        address indexed account,
        bytes32 indexed receiptHash,
        bytes32 policyHash,
        string modelPassportId,
        string computePassportId,
        uint256 tokensIn,
        uint256 tokensOut,
        uint256 timestamp
    );

    // =========================================================================
    // IModule Implementation
    // =========================================================================

    function onInstall(bytes calldata) external override {
        // Stateless — no-op
    }

    function onUninstall(bytes calldata) external override {
        // Stateless — no-op
    }

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == TYPE_EXECUTOR;
    }

    // =========================================================================
    // Receipt Emission
    // =========================================================================

    /**
     * @notice Emit a structured receipt event.
     * @param receiptData ABI-encoded receipt fields:
     *        (bytes32 receiptHash, bytes32 policyHash, string modelPassportId,
     *         string computePassportId, uint256 tokensIn, uint256 tokensOut)
     */
    function emitReceipt(bytes calldata receiptData) external {
        (
            bytes32 receiptHash,
            bytes32 policyHash,
            string memory modelPassportId,
            string memory computePassportId,
            uint256 tokensIn,
            uint256 tokensOut
        ) = abi.decode(receiptData, (bytes32, bytes32, string, string, uint256, uint256));

        emit ReceiptEmitted(
            msg.sender,
            receiptHash,
            policyHash,
            modelPassportId,
            computePassportId,
            tokensIn,
            tokensOut,
            block.timestamp
        );
    }
}
