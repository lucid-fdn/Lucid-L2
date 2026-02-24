// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LucidOFTAdapter
 * @notice Adapter for chains that already have an existing ERC-20 $LUCID token.
 *         Wraps the existing token into the LayerZero OFT layer (lock/unlock pattern).
 *
 * @dev   Use LucidOFT for chains where $LUCID is minted fresh (mint/burn).
 *        Use LucidOFTAdapter for chains where $LUCID ERC-20 already exists.
 */
contract LucidOFTAdapter is OFTAdapter {
    /**
     * @param _token        Address of existing ERC-20 $LUCID on this chain
     * @param _lzEndpoint   LayerZero V2 endpoint on this chain
     * @param _delegate     Address authorized to configure OFT (typically deployer)
     */
    constructor(
        address _token,
        address _lzEndpoint,
        address _delegate
    ) OFTAdapter(_token, _lzEndpoint, _delegate) Ownable(_delegate) {}
}
