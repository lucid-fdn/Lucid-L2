// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockEntryPoint
 * @notice Minimal mock for ERC-4337 EntryPoint v0.7 (testing only).
 */
contract MockEntryPoint {
    mapping(address => uint256) public balanceOf;

    function depositTo(address account) external payable {
        balanceOf[account] += msg.value;
    }

    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external {
        require(balanceOf[msg.sender] >= withdrawAmount, "Insufficient deposit");
        balanceOf[msg.sender] -= withdrawAmount;
        (bool success,) = withdrawAddress.call{value: withdrawAmount}("");
        require(success, "Withdraw failed");
    }

    receive() external payable {}
}
