// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EpochRegistry
 * @notice On-chain epoch storage for EVM chains -- mirrors Solana's thought-epoch program.
 * @dev Authorized submitters commit epoch MMR roots; anyone can read/verify.
 *      Each agent has an independent epoch timeline.
 */
contract EpochRegistry is Ownable {
    // =========================================================================
    // Types
    // =========================================================================

    struct EpochData {
        bytes32 mmrRoot;
        uint64 epochId;
        uint64 leafCount;
        uint256 timestamp;
        uint64 mmrSize;
        bool finalized;
    }

    // =========================================================================
    // State
    // =========================================================================

    /// @notice Agent ID => array of committed epochs
    mapping(bytes32 => EpochData[]) public agentEpochs;

    /// @notice Agent ID => latest epoch ID
    mapping(bytes32 => uint64) public latestEpoch;

    /// @notice Authorized epoch submitters
    mapping(address => bool) public authorizedSubmitters;

    // =========================================================================
    // Events
    // =========================================================================

    event EpochCommitted(
        bytes32 indexed agentId,
        uint64 indexed epochId,
        bytes32 mmrRoot,
        uint64 leafCount,
        uint64 mmrSize,
        uint256 timestamp
    );

    event SubmitterAuthorized(address indexed submitter, bool authorized);

    // =========================================================================
    // Errors
    // =========================================================================

    error NotAuthorized();
    error EpochAlreadyExists();
    error EpochNotFound();
    error InvalidEpochId();
    error InvalidRoot();

    // =========================================================================
    // Modifiers
    // =========================================================================

    modifier onlyAuthorized() {
        if (!authorizedSubmitters[msg.sender] && msg.sender != owner()) {
            revert NotAuthorized();
        }
        _;
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor() Ownable(msg.sender) {
        // Owner is automatically authorized
        authorizedSubmitters[msg.sender] = true;
    }

    // =========================================================================
    // Administration
    // =========================================================================

    /// @notice Authorize or deauthorize an epoch submitter.
    /// @param submitter Address to authorize/deauthorize
    /// @param authorized Whether to grant or revoke access
    function setSubmitter(address submitter, bool authorized) external onlyOwner {
        authorizedSubmitters[submitter] = authorized;
        emit SubmitterAuthorized(submitter, authorized);
    }

    // =========================================================================
    // Epoch Commitment
    // =========================================================================

    /// @notice Commit an epoch root for an agent.
    /// @param agentId Unique identifier for the agent (bytes32)
    /// @param mmrRoot The MMR root hash for this epoch
    /// @param epochId The epoch sequence number
    /// @param leafCount Number of leaves (receipts) in this epoch
    /// @param mmrSize Total MMR size after this epoch
    function commitEpoch(
        bytes32 agentId,
        bytes32 mmrRoot,
        uint64 epochId,
        uint64 leafCount,
        uint64 mmrSize
    ) external onlyAuthorized {
        if (mmrRoot == bytes32(0)) revert InvalidRoot();
        if (epochId == 0) revert InvalidEpochId();

        // Ensure epoch ID is sequential
        uint64 latest = latestEpoch[agentId];
        if (epochId <= latest) revert EpochAlreadyExists();

        EpochData memory epoch = EpochData({
            mmrRoot: mmrRoot,
            epochId: epochId,
            leafCount: leafCount,
            timestamp: block.timestamp,
            mmrSize: mmrSize,
            finalized: true
        });

        agentEpochs[agentId].push(epoch);
        latestEpoch[agentId] = epochId;

        emit EpochCommitted(agentId, epochId, mmrRoot, leafCount, mmrSize, block.timestamp);
    }

    // =========================================================================
    // Views
    // =========================================================================

    /// @notice Get a specific epoch for an agent.
    /// @param agentId Agent identifier
    /// @param epochId Epoch sequence number
    /// @return epoch The epoch data
    function getEpoch(bytes32 agentId, uint64 epochId)
        external
        view
        returns (EpochData memory epoch)
    {
        EpochData[] storage epochs = agentEpochs[agentId];
        for (uint256 i = 0; i < epochs.length; i++) {
            if (epochs[i].epochId == epochId) {
                return epochs[i];
            }
        }
        revert EpochNotFound();
    }

    /// @notice Get the latest epoch for an agent.
    /// @param agentId Agent identifier
    /// @return epoch The latest epoch data
    function getLatestEpoch(bytes32 agentId)
        external
        view
        returns (EpochData memory epoch)
    {
        EpochData[] storage epochs = agentEpochs[agentId];
        if (epochs.length == 0) revert EpochNotFound();
        return epochs[epochs.length - 1];
    }

    /// @notice Get the total number of epochs for an agent.
    /// @param agentId Agent identifier
    /// @return count Number of committed epochs
    function getEpochCount(bytes32 agentId) external view returns (uint256 count) {
        return agentEpochs[agentId].length;
    }

    /// @notice Verify that a specific MMR root was committed for an epoch.
    /// @param agentId Agent identifier
    /// @param epochId Epoch sequence number
    /// @param mmrRoot Expected MMR root
    /// @return valid True if the root matches
    function verifyEpochInclusion(
        bytes32 agentId,
        uint64 epochId,
        bytes32 mmrRoot
    ) external view returns (bool valid) {
        EpochData[] storage epochs = agentEpochs[agentId];
        for (uint256 i = 0; i < epochs.length; i++) {
            if (epochs[i].epochId == epochId) {
                return epochs[i].mmrRoot == mmrRoot;
            }
        }
        return false;
    }

    /// @notice Get a range of epochs for an agent (for pagination).
    /// @param agentId Agent identifier
    /// @param offset Starting index
    /// @param limit Maximum number of epochs to return
    /// @return epochs Array of epoch data
    function getEpochRange(bytes32 agentId, uint256 offset, uint256 limit)
        external
        view
        returns (EpochData[] memory epochs)
    {
        EpochData[] storage allEpochs = agentEpochs[agentId];
        if (offset >= allEpochs.length) {
            return new EpochData[](0);
        }
        uint256 end = offset + limit;
        if (end > allEpochs.length) {
            end = allEpochs.length;
        }
        uint256 count = end - offset;
        epochs = new EpochData[](count);
        for (uint256 i = 0; i < count; i++) {
            epochs[i] = allEpochs[offset + i];
        }
        return epochs;
    }
}
