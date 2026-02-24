// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IERC6551Account
 * @notice Interface for ERC-6551 Token Bound Accounts.
 * See: https://eips.ethereum.org/EIPS/eip-6551
 */
interface IERC6551Account {
    /**
     * @notice Returns the token that this account is bound to.
     * @return chainId The EIP-155 chain ID of the token
     * @return tokenContract The address of the token contract
     * @return tokenId The token ID
     */
    function token()
        external
        view
        returns (uint256 chainId, address tokenContract, uint256 tokenId);

    /**
     * @notice Returns whether the signer is valid for this account.
     */
    function isValidSigner(address signer, bytes calldata context)
        external
        view
        returns (bytes4 magicValue);

    /**
     * @notice Returns the current state of the account.
     */
    function state() external view returns (uint256);
}

/**
 * @title IERC6551Executable
 * @notice Interface for executable token bound accounts.
 */
interface IERC6551Executable {
    /**
     * @notice Execute a call from this account.
     * @param to Target address
     * @param value Native token value
     * @param data Calldata
     * @param operation Operation type (0 = call, 1 = delegatecall)
     */
    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        returns (bytes memory);
}

/**
 * @title IERC6551Registry
 * @notice Interface for the canonical ERC-6551 Registry.
 * Deployed at 0x000000006551c19487814612e58FE06813775758 on all major chains.
 */
interface IERC6551Registry {
    event ERC6551AccountCreated(
        address account,
        address indexed implementation,
        bytes32 salt,
        uint256 chainId,
        address indexed tokenContract,
        uint256 indexed tokenId
    );

    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address);

    function account(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external view returns (address);
}
