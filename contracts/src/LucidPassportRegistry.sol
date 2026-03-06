// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title LucidPassportRegistry
 * @notice Passport anchor + payment gate. Agents pay for time-window access.
 */
contract LucidPassportRegistry is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Passport Anchor ---

    struct Anchor {
        bytes32 contentHash;
        address owner;
        uint8   status;       // 0=Active 1=Deprecated 2=Superseded 3=Revoked
        uint64  createdAt;
        uint64  updatedAt;
    }

    mapping(bytes32 => Anchor) public anchors;
    mapping(address => bool)   public authorizedSyncers;

    event PassportAnchored(bytes32 indexed passportId, bytes32 contentHash, address indexed owner);
    event PassportStatusUpdated(bytes32 indexed passportId, uint8 oldStatus, uint8 newStatus);
    event SyncerUpdated(address indexed syncer, bool authorized);

    error NotAuthorizedSyncer();
    error PassportNotAnchored();
    error InvalidStatus();
    error GateNotEnabled();
    error InsufficientPayment();
    error NotGateOwner();
    error NoRevenue();

    modifier onlySyncer() {
        if (!authorizedSyncers[msg.sender] && msg.sender != owner())
            revert NotAuthorizedSyncer();
        _;
    }

    // --- Payment Gate ---

    struct Gate {
        address gateOwner;
        uint256 priceNative;
        uint256 priceLucid;
        uint256 revenueNative;
        uint256 revenueLucid;
        uint64  totalAccesses;
        bool    enabled;
    }

    IERC20 public immutable lucidToken;
    mapping(bytes32 => Gate) public gates;
    mapping(bytes32 => mapping(address => uint64)) public accessExpiry;

    event GateSet(bytes32 indexed passportId, uint256 priceNative, uint256 priceLucid);
    event AccessPurchased(bytes32 indexed passportId, address indexed payer, uint64 expiresAt, uint256 paid);
    event RevenueWithdrawn(bytes32 indexed passportId, address indexed to, uint256 amountNative, uint256 amountLucid);
    event AccessRevoked(bytes32 indexed passportId, address indexed user);

    constructor(address lucidToken_) Ownable(msg.sender) {
        lucidToken = IERC20(lucidToken_);
    }

    // =================================================================
    // Syncer management
    // =================================================================

    function setSyncer(address syncer, bool authorized) external onlyOwner {
        authorizedSyncers[syncer] = authorized;
        emit SyncerUpdated(syncer, authorized);
    }

    // =================================================================
    // Passport anchor
    // =================================================================

    function anchorPassport(
        bytes32 passportId,
        bytes32 contentHash,
        address passportOwner
    ) external onlySyncer {
        anchors[passportId] = Anchor({
            contentHash: contentHash,
            owner: passportOwner,
            status: 0,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp)
        });
        emit PassportAnchored(passportId, contentHash, passportOwner);
    }

    function updateStatus(bytes32 passportId, uint8 newStatus) external onlySyncer {
        Anchor storage a = anchors[passportId];
        if (a.createdAt == 0) revert PassportNotAnchored();
        if (newStatus > 3) revert InvalidStatus();
        uint8 oldStatus = a.status;
        a.status = newStatus;
        a.updatedAt = uint64(block.timestamp);
        emit PassportStatusUpdated(passportId, oldStatus, newStatus);
    }

    function verifyAnchor(bytes32 passportId, bytes32 contentHash) external view returns (bool) {
        return anchors[passportId].contentHash == contentHash && anchors[passportId].createdAt != 0;
    }

    // =================================================================
    // Payment gate
    // =================================================================

    function setGate(
        bytes32 passportId,
        uint256 priceNative,
        uint256 priceLucid
    ) external {
        Anchor storage a = anchors[passportId];
        if (a.createdAt == 0) revert PassportNotAnchored();
        // Only passport owner or contract owner can set gate
        if (a.owner != msg.sender && msg.sender != owner()) revert NotGateOwner();

        Gate storage g = gates[passportId];
        g.gateOwner = a.owner;
        g.priceNative = priceNative;
        g.priceLucid = priceLucid;
        g.enabled = true;
        emit GateSet(passportId, priceNative, priceLucid);
    }

    function payForAccess(bytes32 passportId, uint64 duration) external payable nonReentrant {
        Gate storage g = gates[passportId];
        if (!g.enabled) revert GateNotEnabled();
        if (msg.value < g.priceNative) revert InsufficientPayment();

        uint64 currentExpiry = accessExpiry[passportId][msg.sender];
        uint64 start = currentExpiry > uint64(block.timestamp) ? currentExpiry : uint64(block.timestamp);
        uint64 newExpiry = start + duration;

        accessExpiry[passportId][msg.sender] = newExpiry;
        g.revenueNative += msg.value;
        g.totalAccesses++;

        emit AccessPurchased(passportId, msg.sender, newExpiry, msg.value);
    }

    function payForAccessLucid(bytes32 passportId, uint64 duration) external nonReentrant {
        Gate storage g = gates[passportId];
        if (!g.enabled) revert GateNotEnabled();
        if (g.priceLucid == 0) revert InsufficientPayment();

        lucidToken.safeTransferFrom(msg.sender, address(this), g.priceLucid);

        uint64 currentExpiry = accessExpiry[passportId][msg.sender];
        uint64 start = currentExpiry > uint64(block.timestamp) ? currentExpiry : uint64(block.timestamp);
        uint64 newExpiry = start + duration;

        accessExpiry[passportId][msg.sender] = newExpiry;
        g.revenueLucid += g.priceLucid;
        g.totalAccesses++;

        emit AccessPurchased(passportId, msg.sender, newExpiry, g.priceLucid);
    }

    function checkAccess(bytes32 passportId, address user) external view returns (bool) {
        return accessExpiry[passportId][user] > uint64(block.timestamp);
    }

    function withdrawRevenue(bytes32 passportId) external nonReentrant {
        Gate storage g = gates[passportId];
        if (g.gateOwner != msg.sender && msg.sender != owner()) revert NotGateOwner();

        uint256 native = g.revenueNative;
        uint256 lucid = g.revenueLucid;
        if (native == 0 && lucid == 0) revert NoRevenue();

        g.revenueNative = 0;
        g.revenueLucid = 0;

        if (native > 0) {
            (bool ok, ) = payable(msg.sender).call{value: native}("");
            require(ok, "ETH transfer failed");
        }
        if (lucid > 0) {
            lucidToken.safeTransfer(msg.sender, lucid);
        }

        emit RevenueWithdrawn(passportId, msg.sender, native, lucid);
    }

    function revokeAccess(bytes32 passportId, address user) external {
        Gate storage g = gates[passportId];
        if (g.gateOwner != msg.sender && msg.sender != owner()) revert NotGateOwner();
        accessExpiry[passportId][user] = 0;
        emit AccessRevoked(passportId, user);
    }
}
