// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LucidEscrow
 * @notice Time-locked escrow for high-stakes agent-to-agent transactions.
 *         Releases on receipt verification via LucidValidator, or refunds on timeout.
 */
contract LucidEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // =========================================================================
    // Types
    // =========================================================================

    enum EscrowStatus { Created, Released, Refunded, Disputed }

    struct Escrow {
        bytes32 escrowId;
        address depositor;
        address beneficiary;
        address token;
        uint256 amount;
        uint256 createdAt;
        uint256 expiresAt;
        bytes32 expectedReceiptHash;
        EscrowStatus status;
    }

    // =========================================================================
    // State
    // =========================================================================

    mapping(bytes32 => Escrow) public escrows;
    address public lucidValidator;
    address public arbitrationContract;

    // =========================================================================
    // Events
    // =========================================================================

    event EscrowCreated(
        bytes32 indexed escrowId,
        address indexed depositor,
        address indexed beneficiary,
        address token,
        uint256 amount,
        uint256 expiresAt,
        bytes32 expectedReceiptHash
    );

    event EscrowReleased(
        bytes32 indexed escrowId,
        address indexed beneficiary,
        uint256 amount,
        bytes32 receiptHash
    );

    event EscrowRefunded(
        bytes32 indexed escrowId,
        address indexed depositor,
        uint256 amount
    );

    event EscrowDisputed(
        bytes32 indexed escrowId,
        address indexed disputedBy,
        string reason
    );

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(address _lucidValidator) Ownable(msg.sender) {
        require(_lucidValidator != address(0), "Invalid validator address");
        lucidValidator = _lucidValidator;
    }

    // =========================================================================
    // Core Functions
    // =========================================================================

    /**
     * @notice Create a new escrow. Transfers tokens from depositor to this contract.
     * @param beneficiary Address to receive funds on successful release
     * @param token ERC-20 token address
     * @param amount Amount of tokens to escrow
     * @param duration Duration in seconds before timeout
     * @param expectedReceiptHash Optional expected receipt hash for auto-verification
     * @return escrowId The unique escrow identifier
     */
    function createEscrow(
        address beneficiary,
        address token,
        uint256 amount,
        uint256 duration,
        bytes32 expectedReceiptHash
    ) external nonReentrant returns (bytes32 escrowId) {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(token != address(0), "Invalid token");
        require(amount > 0, "Amount must be > 0");
        require(duration > 0, "Duration must be > 0");

        escrowId = keccak256(abi.encodePacked(
            msg.sender, beneficiary, token, amount, block.timestamp, block.number
        ));
        require(escrows[escrowId].createdAt == 0, "Escrow already exists");

        uint256 expiresAt = block.timestamp + duration;

        escrows[escrowId] = Escrow({
            escrowId: escrowId,
            depositor: msg.sender,
            beneficiary: beneficiary,
            token: token,
            amount: amount,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            expectedReceiptHash: expectedReceiptHash,
            status: EscrowStatus.Created
        });

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit EscrowCreated(
            escrowId, msg.sender, beneficiary, token, amount, expiresAt, expectedReceiptHash
        );
    }

    /**
     * @notice Release escrow to beneficiary after verifying receipt via LucidValidator.
     * @param escrowId The escrow identifier
     * @param receiptHash The receipt hash to verify
     * @param receiptSignature The ed25519 signature (64 bytes)
     * @param signerPubkey The signer's public key (32 bytes)
     */
    function releaseEscrow(
        bytes32 escrowId,
        bytes32 receiptHash,
        bytes calldata receiptSignature,
        bytes32 signerPubkey
    ) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.createdAt != 0, "Escrow does not exist");
        require(escrow.status == EscrowStatus.Created, "Escrow not in Created status");

        // If expectedReceiptHash is set, verify it matches
        if (escrow.expectedReceiptHash != bytes32(0)) {
            require(receiptHash == escrow.expectedReceiptHash, "Receipt hash mismatch");
        }

        // Verify receipt via LucidValidator
        (bool success, bytes memory result) = lucidValidator.staticcall(
            abi.encodeWithSignature(
                "validateReceipt(bytes32,bytes,bytes32)",
                receiptHash,
                receiptSignature,
                signerPubkey
            )
        );
        require(success, "Validator call failed");
        bool valid = abi.decode(result, (bool));
        require(valid, "Invalid receipt");

        escrow.status = EscrowStatus.Released;

        IERC20(escrow.token).safeTransfer(escrow.beneficiary, escrow.amount);

        emit EscrowReleased(escrowId, escrow.beneficiary, escrow.amount, receiptHash);
    }

    /**
     * @notice Claim timeout refund. Only depositor can call, only after expiry,
     *         and only if escrow is not disputed.
     * @param escrowId The escrow identifier
     */
    function claimTimeout(bytes32 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.createdAt != 0, "Escrow does not exist");
        require(escrow.status == EscrowStatus.Created, "Escrow not in Created status");
        require(block.timestamp >= escrow.expiresAt, "Escrow has not expired");
        require(msg.sender == escrow.depositor, "Only depositor can claim timeout");

        escrow.status = EscrowStatus.Refunded;

        IERC20(escrow.token).safeTransfer(escrow.depositor, escrow.amount);

        emit EscrowRefunded(escrowId, escrow.depositor, escrow.amount);
    }

    /**
     * @notice Dispute an escrow. Either depositor or beneficiary can dispute.
     *         Freezes the escrow (prevents timeout claims).
     * @param escrowId The escrow identifier
     * @param reason Human-readable reason for dispute
     */
    function disputeEscrow(bytes32 escrowId, string calldata reason) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.createdAt != 0, "Escrow does not exist");
        require(escrow.status == EscrowStatus.Created, "Escrow not in Created status");
        require(
            msg.sender == escrow.depositor ||
            msg.sender == escrow.beneficiary ||
            msg.sender == arbitrationContract,
            "Only depositor, beneficiary, or arbitration contract can dispute"
        );

        escrow.status = EscrowStatus.Disputed;

        emit EscrowDisputed(escrowId, msg.sender, reason);
    }

    /**
     * @notice Resolve a disputed escrow. Only callable by the arbitration contract.
     *         Transfers funds to the winner.
     * @param escrowId The escrow identifier
     * @param winner Address to receive the funds (must be depositor or beneficiary)
     */
    function resolveDispute(bytes32 escrowId, address winner) external nonReentrant {
        require(msg.sender == arbitrationContract, "Only arbitration contract");
        Escrow storage escrow = escrows[escrowId];
        require(escrow.createdAt != 0, "Escrow does not exist");
        require(escrow.status == EscrowStatus.Disputed, "Escrow not disputed");
        require(
            winner == escrow.depositor || winner == escrow.beneficiary,
            "Winner must be depositor or beneficiary"
        );

        if (winner == escrow.beneficiary) {
            escrow.status = EscrowStatus.Released;
        } else {
            escrow.status = EscrowStatus.Refunded;
        }

        IERC20(escrow.token).safeTransfer(winner, escrow.amount);

        if (winner == escrow.beneficiary) {
            emit EscrowReleased(escrowId, winner, escrow.amount, bytes32(0));
        } else {
            emit EscrowRefunded(escrowId, winner, escrow.amount);
        }
    }

    // =========================================================================
    // Admin
    // =========================================================================

    /**
     * @notice Set the arbitration contract address. Owner only.
     * @param _arbitrationContract Address of the LucidArbitration contract
     */
    function setArbitrationContract(address _arbitrationContract) external onlyOwner {
        arbitrationContract = _arbitrationContract;
    }

    // =========================================================================
    // Views
    // =========================================================================

    function getEscrow(bytes32 escrowId) external view returns (Escrow memory) {
        require(escrows[escrowId].createdAt != 0, "Escrow does not exist");
        return escrows[escrowId];
    }
}
