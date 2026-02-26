// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LucidToken
 * @notice ERC-20 representation of $LUCID on EVM chains.
 *         Solana is the canonical chain (SPL mint: 7cBsSHBB4nSVQy6ceUvmrA8Z2ks8Me8AjxSUqvJ2q1S9).
 *         EVM chains use this contract with mint/burn gated by a bridge authority.
 *
 * @dev   Decimals = 9 to match Solana SPL token decimals.
 *        Owner (bridge authority) can mint when tokens are locked on Solana
 *        and burn when tokens are unlocked back to Solana.
 */
contract LucidToken is ERC20, ERC20Burnable, Ownable {
    /**
     * @param _name   Token name ("Lucid")
     * @param _symbol Token symbol ("LUCID")
     * @param _owner  Bridge authority address (can mint/burn)
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address _owner
    ) ERC20(_name, _symbol) Ownable(_owner) {}

    /**
     * @notice Returns 9 decimals to match Solana SPL token precision.
     */
    function decimals() public pure override returns (uint8) {
        return 9;
    }

    /**
     * @notice Mint tokens. Only callable by bridge authority (owner).
     * @param to Recipient address
     * @param amount Amount to mint (9 decimals)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
