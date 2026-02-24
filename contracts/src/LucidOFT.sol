// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LucidOFT
 * @notice Omnichain Fungible Token for $LUCID.
 *         Solana is the canonical chain (SPL token mint: 7cBsSHBB4nSVQy6ceUvmrA8Z2ks8Me8AjxSUqvJ2q1S9).
 *         EVM chains use this OFT contract for mint/burn bridging via LayerZero V2.
 *
 * @dev   Inherits OFT from @layerzerolabs/oft-evm which handles:
 *        - Cross-chain send/receive via LayerZero endpoint
 *        - Shared decimals conversion
 *        - Message encoding/decoding
 *
 *        Decimals = 9 to match Solana SPL token decimals.
 */
contract LucidOFT is OFT {
    /**
     * @param _name         Token name ("Lucid")
     * @param _symbol       Token symbol ("LUCID")
     * @param _lzEndpoint   LayerZero V2 endpoint on this chain
     * @param _delegate     Address authorized to configure OFT (typically deployer)
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _delegate
    ) OFT(_name, _symbol, _lzEndpoint, _delegate) Ownable(_delegate) {}

    /**
     * @notice Returns 9 decimals to match Solana SPL token precision.
     */
    function decimals() public pure override returns (uint8) {
        return 9;
    }
}
