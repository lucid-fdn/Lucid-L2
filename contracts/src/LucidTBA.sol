// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC6551Account, IERC6551Executable } from "./interfaces/IERC6551.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title LucidTBA
 * @notice Token Bound Account implementation for Lucid passport NFTs.
 *
 *         Each Lucid passport NFT (ERC-721 from ERC-8004 Identity Registry) gets
 *         a TBA — a smart contract wallet that can:
 *         - Hold $LUCID and other ERC-20 tokens
 *         - Receive ETH/native tokens
 *         - Receive payout splits automatically
 *         - Execute transactions on behalf of the passport owner
 *
 * @dev    Uses the canonical ERC-6551 Registry at
 *         0x000000006551c19487814612e58FE06813775758
 */
contract LucidTBA is IERC6551Account, IERC6551Executable {
    uint256 private _state;

    // ERC-6551 magic value for isValidSigner
    bytes4 constant IS_VALID_SIGNER = 0x523e3260;

    receive() external payable {}

    // =========================================================================
    // IERC6551Account
    // =========================================================================

    /**
     * @notice Returns the NFT this account is bound to.
     */
    function token()
        public
        view
        override
        returns (uint256 chainId, address tokenContract, uint256 tokenId)
    {
        bytes memory footer = new bytes(0x60);
        assembly {
            // ERC-6551 standard: token data is appended to bytecode
            // Layout: ...bytecode | salt (32) | chainId (32) | tokenContract (32) | tokenId (32)
            extcodecopy(address(), add(footer, 0x20), 0x4d, 0x60)
            chainId := mload(add(footer, 0x20))
            tokenContract := mload(add(footer, 0x40))
            tokenId := mload(add(footer, 0x60))
        }
    }

    /**
     * @notice Check if a signer is valid (must be the NFT owner).
     */
    function isValidSigner(address signer, bytes calldata)
        external
        view
        override
        returns (bytes4)
    {
        if (_isOwner(signer)) {
            return IS_VALID_SIGNER;
        }
        return bytes4(0);
    }

    /**
     * @notice Current account state (incremented on each execution).
     */
    function state() external view override returns (uint256) {
        return _state;
    }

    // =========================================================================
    // IERC6551Executable
    // =========================================================================

    /**
     * @notice Execute a call from this TBA. Only the NFT owner can call.
     * @param to Target address
     * @param value Native token value to send
     * @param data Calldata
     * @param operation 0 = call, 1 = delegatecall
     */
    function execute(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation
    ) external payable override returns (bytes memory result) {
        require(_isOwner(msg.sender), "LucidTBA: not owner");
        require(operation == 0, "LucidTBA: only call supported");

        _state++;

        bool success;
        (success, result) = to.call{value: value}(data);
        require(success, "LucidTBA: execution failed");
    }

    // =========================================================================
    // Convenience Methods
    // =========================================================================

    /**
     * @notice Transfer ERC-20 tokens from this TBA. Owner only.
     */
    function transferERC20(address token_, address to, uint256 amount) external {
        require(_isOwner(msg.sender), "LucidTBA: not owner");
        IERC20(token_).transfer(to, amount);
    }

    /**
     * @notice Get the owner of this TBA (= owner of the bound NFT).
     */
    function owner() public view returns (address) {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (chainId != block.chainid) return address(0);
        return IERC721(tokenContract).ownerOf(tokenId);
    }

    // =========================================================================
    // Internal
    // =========================================================================

    function _isOwner(address caller) internal view returns (bool) {
        return caller == owner();
    }
}
