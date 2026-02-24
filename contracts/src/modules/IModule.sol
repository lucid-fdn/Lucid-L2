// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IModule
 * @notice ERC-7579 module interface for smart account compatibility.
 *         Any ERC-7579 compatible wallet (Safe, Kernel, Biconomy) can install these.
 */
interface IModule {
    /**
     * @notice Called when the module is installed on a smart account.
     * @param data Initialization data
     */
    function onInstall(bytes calldata data) external;

    /**
     * @notice Called when the module is uninstalled from a smart account.
     * @param data Cleanup data
     */
    function onUninstall(bytes calldata data) external;

    /**
     * @notice Check if this module implements a given module type.
     * @param moduleTypeId The module type to check
     * @return True if this module is of the given type
     */
    function isModuleType(uint256 moduleTypeId) external view returns (bool);
}

// ERC-7579 Module Type Constants
uint256 constant TYPE_VALIDATOR = 1;
uint256 constant TYPE_EXECUTOR = 2;
