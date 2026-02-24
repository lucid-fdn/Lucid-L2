// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IModule.sol";

/**
 * @title LucidPolicyModule
 * @notice ERC-7579 Validator module that enforces Lucid policy constraints.
 *         Smart accounts install this to restrict operations to allowed policy hashes.
 */
contract LucidPolicyModule is IModule {
    // =========================================================================
    // State
    // =========================================================================

    /// @dev account => policyHash => allowed
    mapping(address => mapping(bytes32 => bool)) private _allowedPolicies;

    /// @dev account => list of policy hashes (for enumeration)
    mapping(address => bytes32[]) private _policyList;

    // =========================================================================
    // Events
    // =========================================================================

    event PolicySet(address indexed account, bytes32 indexed policyHash, bool allowed);

    // =========================================================================
    // IModule Implementation
    // =========================================================================

    /**
     * @notice Install: decode and store allowed policy hashes.
     * @param data ABI-encoded bytes32[] of policy hashes to allow
     */
    function onInstall(bytes calldata data) external override {
        if (data.length == 0) return;

        bytes32[] memory policies = abi.decode(data, (bytes32[]));
        for (uint256 i = 0; i < policies.length; i++) {
            _allowedPolicies[msg.sender][policies[i]] = true;
            _policyList[msg.sender].push(policies[i]);
            emit PolicySet(msg.sender, policies[i], true);
        }
    }

    /**
     * @notice Uninstall: clear all stored policies for the account.
     */
    function onUninstall(bytes calldata) external override {
        bytes32[] storage policies = _policyList[msg.sender];
        for (uint256 i = 0; i < policies.length; i++) {
            delete _allowedPolicies[msg.sender][policies[i]];
        }
        delete _policyList[msg.sender];
    }

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == TYPE_VALIDATOR;
    }

    // =========================================================================
    // Policy Management
    // =========================================================================

    /**
     * @notice Add or remove an allowed policy hash.
     * @param policyHash The policy hash to set
     * @param allowed Whether this policy is allowed
     */
    function setPolicy(bytes32 policyHash, bool allowed) external {
        _allowedPolicies[msg.sender][policyHash] = allowed;

        if (allowed) {
            _policyList[msg.sender].push(policyHash);
        }

        emit PolicySet(msg.sender, policyHash, allowed);
    }

    /**
     * @notice Check if a policy hash is allowed for an account.
     */
    function isPolicyAllowed(address account, bytes32 policyHash) external view returns (bool) {
        return _allowedPolicies[account][policyHash];
    }

    /**
     * @notice Get all policy hashes for an account.
     */
    function getPolicies(address account) external view returns (bytes32[] memory) {
        return _policyList[account];
    }

    // =========================================================================
    // Validation
    // =========================================================================

    /**
     * @notice Validate that a UserOp's policy is in the allowed set.
     *         Extracts policy hash from the first 32 bytes of calldata.
     * @param policyHash The policy hash to validate
     * @return valid True if the policy is allowed
     */
    function validatePolicy(bytes32 policyHash) external view returns (bool valid) {
        return _allowedPolicies[msg.sender][policyHash];
    }
}
