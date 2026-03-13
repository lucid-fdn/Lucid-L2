// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title LucidSessionManager
 * @notice Manages delegated session keys for agent wallets.
 *         A wallet owner can grant time-limited, spend-capped authority
 *         to a delegate address with a permissions bitmask.
 */
contract LucidSessionManager {
    // =========================================================================
    // Types
    // =========================================================================

    struct Session {
        address wallet;
        address delegate;
        uint256 permissions;   // Bitmask of allowed operations
        uint256 expiresAt;
        uint256 maxAmount;
        uint256 amountUsed;
        bool active;
        uint256 createdAt;
    }

    // =========================================================================
    // State
    // =========================================================================

    /// @dev wallet => delegate => Session
    mapping(address => mapping(address => Session)) public sessions;

    // =========================================================================
    // Events
    // =========================================================================

    event SessionCreated(
        address indexed wallet,
        address indexed delegate,
        uint256 permissions,
        uint256 expiresAt,
        uint256 maxAmount
    );

    event SessionRevoked(
        address indexed wallet,
        address indexed delegate
    );

    event SessionUsed(
        address indexed wallet,
        address indexed delegate,
        uint256 amount,
        uint256 totalUsed
    );

    // =========================================================================
    // Core Functions
    // =========================================================================

    /**
     * @notice Create a session key granting a delegate limited authority.
     * @param delegate Address receiving delegated authority
     * @param permissions Bitmask of allowed operations
     * @param expiresAt Unix timestamp when session expires
     * @param maxAmount Maximum cumulative spend allowed during session
     */
    function createSession(
        address delegate,
        uint256 permissions,
        uint256 expiresAt,
        uint256 maxAmount
    ) external {
        require(delegate != address(0), "Invalid delegate");
        require(expiresAt > block.timestamp, "Expiry must be in the future");
        require(permissions > 0, "Permissions must be non-zero");

        sessions[msg.sender][delegate] = Session({
            wallet: msg.sender,
            delegate: delegate,
            permissions: permissions,
            expiresAt: expiresAt,
            maxAmount: maxAmount,
            amountUsed: 0,
            active: true,
            createdAt: block.timestamp
        });

        emit SessionCreated(msg.sender, delegate, permissions, expiresAt, maxAmount);
    }

    /**
     * @notice Revoke a session key. Only the wallet owner can revoke.
     * @param delegate Address whose session is being revoked
     */
    function revokeSession(address delegate) external {
        Session storage session = sessions[msg.sender][delegate];
        require(session.createdAt != 0, "Session does not exist");
        require(session.active, "Session already revoked");

        session.active = false;

        emit SessionRevoked(msg.sender, delegate);
    }

    /**
     * @notice Record spend against a session. Called by the delegate.
     * @param wallet The wallet that created the session
     * @param amount Amount to record against the session cap
     */
    function useSession(address wallet, uint256 amount) external {
        Session storage session = sessions[wallet][msg.sender];
        require(session.createdAt != 0, "Session does not exist");
        require(session.active, "Session not active");
        require(block.timestamp < session.expiresAt, "Session expired");

        uint256 newTotal = session.amountUsed + amount;
        require(newTotal <= session.maxAmount, "Spend cap exceeded");
        session.amountUsed = newTotal;

        emit SessionUsed(wallet, msg.sender, amount, newTotal);
    }

    // =========================================================================
    // Views
    // =========================================================================

    /**
     * @notice Check whether a session is currently valid (active + not expired + within spend cap).
     * @param wallet The wallet that created the session
     * @param delegate The delegated address
     * @return True if the session is valid
     */
    function isSessionValid(address wallet, address delegate) external view returns (bool) {
        Session storage session = sessions[wallet][delegate];
        return session.active
            && block.timestamp < session.expiresAt
            && session.amountUsed < session.maxAmount;
    }

    /**
     * @notice Get full session data.
     * @param wallet The wallet that created the session
     * @param delegate The delegated address
     * @return The Session struct
     */
    function getSession(address wallet, address delegate) external view returns (Session memory) {
        require(sessions[wallet][delegate].createdAt != 0, "Session does not exist");
        return sessions[wallet][delegate];
    }
}
