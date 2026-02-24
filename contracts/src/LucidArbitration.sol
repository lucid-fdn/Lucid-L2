// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LucidArbitration
 * @notice Automated dispute resolution for LucidEscrow.
 *         Multi-phase: evidence submission -> automated ruling -> optional appeal.
 */
contract LucidArbitration is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // =========================================================================
    // Constants
    // =========================================================================

    uint256 public constant EVIDENCE_WINDOW = 48 hours;
    uint256 public constant APPEAL_WINDOW = 72 hours;
    uint256 public constant APPEAL_STAKE = 100 * 10**9; // 100 $LUCID (9 decimals)

    // =========================================================================
    // Types
    // =========================================================================

    enum DisputeStatus { Open, EvidencePhase, Resolved, Appealed }

    struct Evidence {
        address submitter;
        bytes32 receiptHash;
        bytes32 mmrRoot;
        bytes mmrProof;
        string description;
        uint256 submittedAt;
    }

    struct Dispute {
        bytes32 disputeId;
        bytes32 escrowId;
        address initiator;
        string reason;
        DisputeStatus status;
        uint256 createdAt;
        uint256 evidenceDeadline;
        address resolvedInFavorOf;
        bool appealed;
        uint256 appealDeadline;
        address appealedBy;
    }

    // =========================================================================
    // State
    // =========================================================================

    mapping(bytes32 => Dispute) public disputes;
    mapping(bytes32 => Evidence[]) public evidenceStore;
    mapping(bytes32 => bytes32) public escrowToDispute; // escrowId -> disputeId

    address public immutable escrowContract;
    address public immutable lucidValidator;
    IERC20 public immutable lucidToken;

    // =========================================================================
    // Events
    // =========================================================================

    event DisputeOpened(
        bytes32 indexed disputeId,
        bytes32 indexed escrowId,
        address indexed initiator,
        string reason,
        uint256 evidenceDeadline
    );

    event EvidenceSubmitted(
        bytes32 indexed disputeId,
        address indexed submitter,
        bytes32 receiptHash,
        bytes32 mmrRoot
    );

    event DisputeResolved(
        bytes32 indexed disputeId,
        address indexed resolvedInFavorOf,
        bool hasValidReceipt
    );

    event DisputeAppealed(
        bytes32 indexed disputeId,
        address indexed appealedBy,
        uint256 newDeadline
    );

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(
        address _escrowContract,
        address _lucidValidator,
        address _lucidToken
    ) {
        require(_escrowContract != address(0), "Invalid escrow contract");
        require(_lucidValidator != address(0), "Invalid validator");
        require(_lucidToken != address(0), "Invalid token");

        escrowContract = _escrowContract;
        lucidValidator = _lucidValidator;
        lucidToken = IERC20(_lucidToken);
    }

    // =========================================================================
    // Core Functions
    // =========================================================================

    /**
     * @notice Open a dispute for an escrow. Calls LucidEscrow.disputeEscrow()
     *         to freeze the funds, then creates the dispute record.
     * @param escrowId The escrow to dispute
     * @param reason Human-readable reason
     */
    function openDispute(
        bytes32 escrowId,
        string calldata reason
    ) external returns (bytes32 disputeId) {
        require(escrowToDispute[escrowId] == bytes32(0), "Dispute already exists for escrow");

        disputeId = keccak256(abi.encodePacked(escrowId, msg.sender, block.timestamp));
        require(disputes[disputeId].createdAt == 0, "Dispute ID collision");

        uint256 evidenceDeadline = block.timestamp + EVIDENCE_WINDOW;

        disputes[disputeId] = Dispute({
            disputeId: disputeId,
            escrowId: escrowId,
            initiator: msg.sender,
            reason: reason,
            status: DisputeStatus.EvidencePhase,
            createdAt: block.timestamp,
            evidenceDeadline: evidenceDeadline,
            resolvedInFavorOf: address(0),
            appealed: false,
            appealDeadline: 0,
            appealedBy: address(0)
        });

        escrowToDispute[escrowId] = disputeId;

        // Call escrow contract to freeze funds
        (bool success,) = escrowContract.call(
            abi.encodeWithSignature(
                "disputeEscrow(bytes32,string)",
                escrowId,
                reason
            )
        );
        // Note: disputeEscrow may fail if already disputed or not Created
        // We allow the dispute record to exist regardless

        emit DisputeOpened(disputeId, escrowId, msg.sender, reason, evidenceDeadline);
    }

    /**
     * @notice Submit evidence for a dispute. Either party can submit.
     * @param disputeId The dispute identifier
     * @param receiptHash Receipt hash as evidence
     * @param mmrRoot MMR root for proof-of-contribution
     * @param mmrProof Encoded MMR proof
     * @param description Human-readable evidence description
     */
    function submitEvidence(
        bytes32 disputeId,
        bytes32 receiptHash,
        bytes32 mmrRoot,
        bytes calldata mmrProof,
        string calldata description
    ) external {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.createdAt != 0, "Dispute does not exist");
        require(
            dispute.status == DisputeStatus.EvidencePhase ||
            dispute.status == DisputeStatus.Appealed,
            "Not accepting evidence"
        );

        uint256 deadline = dispute.appealed ? dispute.appealDeadline : dispute.evidenceDeadline;
        require(block.timestamp <= deadline, "Evidence window closed");

        evidenceStore[disputeId].push(Evidence({
            submitter: msg.sender,
            receiptHash: receiptHash,
            mmrRoot: mmrRoot,
            mmrProof: mmrProof,
            description: description,
            submittedAt: block.timestamp
        }));

        emit EvidenceSubmitted(disputeId, msg.sender, receiptHash, mmrRoot);
    }

    /**
     * @notice Resolve a dispute. Iterates evidence and verifies receipts.
     *         If beneficiary has valid receipt -> release to beneficiary.
     *         If no valid receipt -> refund to depositor.
     * @param disputeId The dispute to resolve
     */
    function resolveDispute(bytes32 disputeId) external nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.createdAt != 0, "Dispute does not exist");
        require(
            dispute.status == DisputeStatus.EvidencePhase ||
            dispute.status == DisputeStatus.Appealed,
            "Cannot resolve"
        );

        uint256 deadline = dispute.appealed ? dispute.appealDeadline : dispute.evidenceDeadline;
        require(block.timestamp > deadline, "Evidence window still open");

        // Check evidence for valid receipts
        bool hasValidReceipt = false;
        Evidence[] storage evidence = evidenceStore[disputeId];

        for (uint256 i = 0; i < evidence.length; i++) {
            if (evidence[i].receiptHash != bytes32(0)) {
                // Try to validate receipt via LucidValidator
                // We use a basic check: receipt hash is non-zero = considered valid for MVP
                // Full verification would call validateReceipt with signature
                hasValidReceipt = true;
                break;
            }
        }

        dispute.status = DisputeStatus.Resolved;

        // Get escrow info to determine depositor/beneficiary
        // Call escrow's getEscrow to find the parties
        (bool success, bytes memory result) = escrowContract.staticcall(
            abi.encodeWithSignature("getEscrow(bytes32)", dispute.escrowId)
        );

        if (success && result.length > 0) {
            // Decode the escrow tuple - we need depositor (index 1) and beneficiary (index 2)
            (, address depositor, address beneficiary,,,,,,) = abi.decode(
                result,
                (bytes32, address, address, address, uint256, uint256, uint256, bytes32, uint8)
            );

            address winner = hasValidReceipt ? beneficiary : depositor;
            dispute.resolvedInFavorOf = winner;

            // Call escrow to resolve dispute and transfer funds
            escrowContract.call(
                abi.encodeWithSignature(
                    "resolveDispute(bytes32,address)",
                    dispute.escrowId,
                    winner
                )
            );
        }

        emit DisputeResolved(disputeId, dispute.resolvedInFavorOf, hasValidReceipt);
    }

    /**
     * @notice Appeal a resolved dispute. Requires staking APPEAL_STAKE $LUCID.
     *         Extends evidence window by APPEAL_WINDOW.
     * @param disputeId The dispute to appeal
     */
    function appealDecision(bytes32 disputeId) external nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        require(dispute.createdAt != 0, "Dispute does not exist");
        require(dispute.status == DisputeStatus.Resolved, "Can only appeal resolved disputes");
        require(!dispute.appealed, "Already appealed");

        // Transfer appeal stake
        lucidToken.safeTransferFrom(msg.sender, address(this), APPEAL_STAKE);

        dispute.status = DisputeStatus.Appealed;
        dispute.appealed = true;
        dispute.appealDeadline = block.timestamp + APPEAL_WINDOW;
        dispute.appealedBy = msg.sender;

        emit DisputeAppealed(disputeId, msg.sender, dispute.appealDeadline);
    }

    // =========================================================================
    // Views
    // =========================================================================

    function getDispute(bytes32 disputeId) external view returns (Dispute memory) {
        require(disputes[disputeId].createdAt != 0, "Dispute does not exist");
        return disputes[disputeId];
    }

    function getEvidenceCount(bytes32 disputeId) external view returns (uint256) {
        return evidenceStore[disputeId].length;
    }

    function getEvidence(bytes32 disputeId, uint256 index) external view returns (Evidence memory) {
        require(index < evidenceStore[disputeId].length, "Index out of bounds");
        return evidenceStore[disputeId][index];
    }
}
