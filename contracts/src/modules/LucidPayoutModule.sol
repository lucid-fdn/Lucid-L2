// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IModule.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title LucidPayoutModule
 * @notice ERC-7579 Executor module for automated payout splitting.
 *         Smart accounts install this to auto-split payments across recipients.
 */
contract LucidPayoutModule is IModule {
    using SafeERC20 for IERC20;

    // =========================================================================
    // Types
    // =========================================================================

    struct SplitConfig {
        address[] recipients;
        uint256[] basisPoints; // Must sum to 10000
    }

    // =========================================================================
    // State
    // =========================================================================

    /// @dev account => split configuration
    mapping(address => SplitConfig) private _splits;

    // =========================================================================
    // Events
    // =========================================================================

    event SplitConfigured(address indexed account, address[] recipients, uint256[] basisPoints);
    event PayoutExecuted(address indexed account, address token, uint256 totalAmount, uint256 recipientCount);

    // =========================================================================
    // IModule Implementation
    // =========================================================================

    /**
     * @notice Install: decode and store split configuration.
     * @param data ABI-encoded (address[] recipients, uint256[] basisPoints)
     */
    function onInstall(bytes calldata data) external override {
        if (data.length == 0) return;

        (address[] memory recipients, uint256[] memory basisPoints) = abi.decode(
            data,
            (address[], uint256[])
        );
        _setSplit(msg.sender, recipients, basisPoints);
    }

    /**
     * @notice Uninstall: clear split configuration.
     */
    function onUninstall(bytes calldata) external override {
        delete _splits[msg.sender];
    }

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == TYPE_EXECUTOR;
    }

    // =========================================================================
    // Split Management
    // =========================================================================

    /**
     * @notice Set or update the payout split configuration.
     * @param recipients Array of recipient addresses
     * @param basisPoints Array of basis points per recipient (must sum to 10000)
     */
    function setSplit(address[] calldata recipients, uint256[] calldata basisPoints) external {
        _setSplit(msg.sender, recipients, basisPoints);
    }

    /**
     * @notice Get the split configuration for an account.
     */
    function getSplit(address account) external view returns (
        address[] memory recipients,
        uint256[] memory basisPoints
    ) {
        SplitConfig storage config = _splits[account];
        return (config.recipients, config.basisPoints);
    }

    // =========================================================================
    // Execution
    // =========================================================================

    /**
     * @notice Execute a payout split. Transfers `amount` of `token` from msg.sender
     *         to all configured recipients according to basis points.
     * @param token ERC-20 token to split
     * @param amount Total amount to split
     */
    function execute(address token, uint256 amount) external {
        SplitConfig storage config = _splits[msg.sender];
        require(config.recipients.length > 0, "No split configured");
        require(amount > 0, "Amount must be > 0");

        for (uint256 i = 0; i < config.recipients.length; i++) {
            uint256 share = (amount * config.basisPoints[i]) / 10000;
            if (share > 0) {
                IERC20(token).safeTransferFrom(msg.sender, config.recipients[i], share);
            }
        }

        emit PayoutExecuted(msg.sender, token, amount, config.recipients.length);
    }

    // =========================================================================
    // Internal
    // =========================================================================

    function _setSplit(
        address account,
        address[] memory recipients,
        uint256[] memory basisPoints
    ) internal {
        require(recipients.length == basisPoints.length, "Length mismatch");
        require(recipients.length > 0, "Must have recipients");

        uint256 total = 0;
        for (uint256 i = 0; i < basisPoints.length; i++) {
            require(recipients[i] != address(0), "Invalid recipient");
            total += basisPoints[i];
        }
        require(total == 10000, "Basis points must sum to 10000");

        _splits[account] = SplitConfig({
            recipients: recipients,
            basisPoints: basisPoints
        });

        emit SplitConfigured(account, recipients, basisPoints);
    }
}
