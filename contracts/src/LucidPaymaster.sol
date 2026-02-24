// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title IEntryPoint
 * @notice Minimal interface for ERC-4337 EntryPoint v0.7.
 */
interface IEntryPoint {
    function depositTo(address account) external payable;
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external;
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title PackedUserOperation
 * @notice Minimal packed UserOperation struct for ERC-4337 v0.7.
 */
struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    bytes32 gasFees;
    bytes paymasterAndData;
    bytes signature;
}

/**
 * @title LucidPaymaster
 * @notice ERC-4337 Paymaster that sponsors UserOps and deducts $LUCID
 *         from the agent's wallet/TBA instead of requiring ETH.
 */
contract LucidPaymaster is Ownable {
    using SafeERC20 for IERC20;

    // =========================================================================
    // State
    // =========================================================================

    IERC20 public immutable lucidToken;
    IEntryPoint public immutable entryPoint;

    /// @notice Exchange rate: $LUCID per ETH (in token's native decimals)
    /// e.g., 1000 * 10^9 means 1 ETH = 1000 $LUCID (9-decimal token)
    uint256 public lucidPerEth;

    /// @notice Maximum gas cost in $LUCID that the paymaster will sponsor
    uint256 public maxCostLucid;

    // =========================================================================
    // Events
    // =========================================================================

    event ExchangeRateUpdated(uint256 oldRate, uint256 newRate);
    event MaxCostUpdated(uint256 oldMax, uint256 newMax);
    event GasSponsored(address indexed sender, uint256 lucidCharged, uint256 ethCost);
    event Deposited(address indexed from, uint256 amount);
    event LucidWithdrawn(address indexed to, uint256 amount);
    event EthWithdrawn(address indexed to, uint256 amount);

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(
        address _lucidToken,
        address _entryPoint,
        uint256 _lucidPerEth,
        uint256 _maxCostLucid
    ) Ownable(msg.sender) {
        require(_lucidToken != address(0), "Invalid token");
        require(_entryPoint != address(0), "Invalid entrypoint");
        require(_lucidPerEth > 0, "Invalid exchange rate");
        require(_maxCostLucid > 0, "Invalid max cost");

        lucidToken = IERC20(_lucidToken);
        entryPoint = IEntryPoint(_entryPoint);
        lucidPerEth = _lucidPerEth;
        maxCostLucid = _maxCostLucid;
    }

    // =========================================================================
    // Paymaster Validation (called by EntryPoint)
    // =========================================================================

    /**
     * @notice Validate a UserOperation for paymaster sponsorship.
     * @param userOp The packed UserOperation
     * @param maxCost Maximum gas cost in ETH (wei)
     * @return context Encoded context for postOp
     * @return validationData 0 for success
     */
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /* userOpHash */,
        uint256 maxCost
    ) external view returns (bytes memory context, uint256 validationData) {
        // Calculate max cost in $LUCID
        uint256 maxCostInLucid = (maxCost * lucidPerEth) / 1e18;

        // Check sender has sufficient $LUCID allowance
        uint256 allowance = lucidToken.allowance(userOp.sender, address(this));
        require(allowance >= maxCostInLucid, "Insufficient LUCID allowance");

        // Check against max cost limit
        require(maxCostInLucid <= maxCostLucid, "Exceeds max cost");

        // Check sender has sufficient $LUCID balance
        uint256 balance = lucidToken.balanceOf(userOp.sender);
        require(balance >= maxCostInLucid, "Insufficient LUCID balance");

        context = abi.encode(userOp.sender, maxCostInLucid);
        validationData = 0;
    }

    /**
     * @notice Post-operation: deduct actual $LUCID cost from sender.
     * @param mode 0 = success, 1 = reverted, 2 = postOp reverted
     * @param context Encoded context from validation
     * @param actualGasCost Actual gas cost in ETH (wei)
     */
    function postOp(
        uint8 mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /* actualUserOpFeePerGas */
    ) external {
        // Only charge if the operation succeeded
        if (mode == 1) {
            // opReverted — don't charge
            return;
        }

        (address sender, ) = abi.decode(context, (address, uint256));

        // Calculate actual cost in $LUCID
        uint256 actualCostLucid = (actualGasCost * lucidPerEth) / 1e18;

        if (actualCostLucid > 0) {
            lucidToken.safeTransferFrom(sender, address(this), actualCostLucid);
            emit GasSponsored(sender, actualCostLucid, actualGasCost);
        }
    }

    // =========================================================================
    // Admin Functions
    // =========================================================================

    /**
     * @notice Update the ETH/$LUCID exchange rate.
     * @param newRate New rate (LUCID per ETH, 18 decimals)
     */
    function setExchangeRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "Rate must be > 0");
        uint256 old = lucidPerEth;
        lucidPerEth = newRate;
        emit ExchangeRateUpdated(old, newRate);
    }

    /**
     * @notice Update the maximum gas cost in $LUCID.
     * @param newMax New max cost
     */
    function setMaxCost(uint256 newMax) external onlyOwner {
        require(newMax > 0, "Max must be > 0");
        uint256 old = maxCostLucid;
        maxCostLucid = newMax;
        emit MaxCostUpdated(old, newMax);
    }

    /**
     * @notice Deposit ETH to EntryPoint for gas sponsoring.
     */
    function deposit() external payable onlyOwner {
        require(msg.value > 0, "Must send ETH");
        entryPoint.depositTo{value: msg.value}(address(this));
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw collected $LUCID.
     * @param amount Amount to withdraw
     */
    function withdrawLucid(uint256 amount) external onlyOwner {
        lucidToken.safeTransfer(msg.sender, amount);
        emit LucidWithdrawn(msg.sender, amount);
    }

    /**
     * @notice Withdraw ETH from EntryPoint.
     * @param amount Amount to withdraw
     */
    function withdrawEth(uint256 amount) external onlyOwner {
        entryPoint.withdrawTo(payable(msg.sender), amount);
        emit EthWithdrawn(msg.sender, amount);
    }

    // =========================================================================
    // Views
    // =========================================================================

    /**
     * @notice Get the paymaster's ETH balance in the EntryPoint.
     */
    function getDeposit() external view returns (uint256) {
        return entryPoint.balanceOf(address(this));
    }

    /**
     * @notice Estimate gas cost in $LUCID for a given ETH cost.
     * @param ethCost Cost in ETH (wei)
     * @return lucidCost Cost in $LUCID
     */
    function estimateLucidCost(uint256 ethCost) external view returns (uint256 lucidCost) {
        return (ethCost * lucidPerEth) / 1e18;
    }
}
