# Privy Wallet Delegation - Frontend Developer Guide

## 📋 Overview

This guide provides frontend developers with everything needed to implement wallet delegation for autonomous n8n workflows using Privy embedded wallets. Users grant permission for the backend to sign transactions on their behalf, enabling automated trading while maintaining self-custodial wallet security.

**What You'll Build:**
- Wallet connection UI with Privy
- Delegation authorization flow
- Policy configuration interface
- Status monitoring dashboard
- Session management controls

---

## 🎯 Understanding the Delegation Flow

### The User Journey

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: CONNECT WALLET                                      │
│  User clicks "Connect Wallet" → Privy modal opens           │
│  → User selects wallet (Phantom, MetaMask, etc.)            │
│  → Wallet is created/connected                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: CONFIGURE POLICIES                                  │
│  User reviews/customizes delegation policies:                │
│  • Time limit (24h default)                                 │
│  • Max transaction amount (1 SOL default)                   │
│  • Daily spending limit (5 SOL default)                     │
│  • Allowed programs/contracts                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: GRANT AUTHORIZATION                                 │
│  User clicks "Authorize" → Your frontend calls backend API  │
│  → Backend creates session signer with policies             │
│  → Stores encrypted credentials in database                 │
│  → Returns success confirmation                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: AUTONOMOUS EXECUTION                                │
│  n8n workflows can now sign transactions automatically       │
│  All operations respect the policies user configured         │
│  User can monitor activity and revoke anytime               │
└─────────────────────────────────────────────────────────────┘
```

### Frontend vs Backend Responsibilities

**Frontend (Your Code):**
- ✅ Privy wallet connection UI
- ✅ Policy configuration form
- ✅ Authorization confirmation
- ✅ Status display & monitoring
- ✅ Revocation controls
- ✅ Error handling & user feedback

**Backend (Already Implemented):**
- ✅ Session signer creation
- ✅ Policy enforcement
- ✅ Transaction signing
- ✅ Audit logging
- ✅ Key encryption/storage

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install @privy-io/react-auth @privy-io/react-auth/solana
```

### 2. Environment Variables

Create `.env.local`:

```bash
# Privy Configuration
VITE_PRIVY_APP_ID=your_privy_app_id_here

# Backend API
VITE_API_BASE_URL=http://localhost:3001
```

### 3. Initialize Privy Provider

```tsx
// main.tsx or App.tsx
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

function App() {
  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        loginMethods: ['wallet', 'email', 'google'],
        appearance: {
          theme: 'dark',
          accentColor: '#667eea',
          showWalletLoginFirst: true,
          walletChainType: 'ethereum-and-solana',
          walletList: [
            // Solana wallets (prioritized for your use case)
            'phantom',
            'backpack',
            'detected_solana_wallets',
            
            // Ethereum wallets
            'metamask',
            'detected_ethereum_wallets',
            'rainbow',
            'coinbase_wallet',
            'wallet_connect'
          ]
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors()
          }
        }
      }}
    >
      <YourApp />
    </PrivyProvider>
  );
}
```

---

## 🎨 Component Implementation

### Component 1: Wallet Connection

```tsx
// components/WalletConnection.tsx
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useState } from 'react';

export function WalletConnection() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const [loading, setLoading] = useState(false);

  const solanaWallet = wallets?.find(w => w.walletClientType === 'solana');
  const evmWallet = wallets?.find(w => w.walletClientType !== 'solana');

  const handleConnect = async () => {
    setLoading(true);
    try {
      await login();
    } catch (error) {
      console.error('Connection failed:', error);
      alert('Failed to connect wallet. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (confirm('Disconnect your wallet? This will revoke all delegations.')) {
      await logout();
    }
  };

  if (!ready) {
    return <div>Loading Privy...</div>;
  }

  if (!authenticated) {
    return (
      <div className="wallet-connection">
        <h2>Connect Your Wallet</h2>
        <p>Connect your Solana wallet to enable automated trading</p>
        <button 
          onClick={handleConnect} 
          disabled={loading}
          className="connect-button"
        >
          {loading ? 'Connecting...' : 'Connect Wallet'}
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-connected">
      <div className="wallet-info">
        <div className="wallet-avatar">
          {user?.wallet?.address?.slice(0, 2)}
        </div>
        <div className="wallet-details">
          <div className="wallet-address">
            {solanaWallet ? (
              <>
                <span className="chain-badge">Solana</span>
                {solanaWallet.address.slice(0, 4)}...{solanaWallet.address.slice(-4)}
              </>
            ) : evmWallet ? (
              <>
                <span className="chain-badge">EVM</span>
                {evmWallet.address.slice(0, 4)}...{evmWallet.address.slice(-4)}
              </>
            ) : (
              'No wallet detected'
            )}
          </div>
          <div className="wallet-type">
            {solanaWallet?.walletClientType || evmWallet?.walletClientType}
          </div>
        </div>
      </div>
      <button onClick={handleDisconnect} className="disconnect-button">
        Disconnect
      </button>
    </div>
  );
}
```

### Component 2: Delegation Authorization

```tsx
// components/DelegationAuthorization.tsx
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useState } from 'react';

interface DelegationPolicy {
  ttl?: number;              // Time-to-live in seconds
  maxAmount?: string;        // Max amount per transaction (lamports/wei)
  dailyLimit?: string;       // Daily spending limit
  allowedPrograms?: string[]; // Solana Program IDs
  allowedContracts?: string[]; // EVM contract addresses
}

export function DelegationAuthorization() {
  const { user, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [loading, setLoading] = useState(false);
  const [delegated, setDelegated] = useState(false);
  
  // State for policy configuration
  const [policies, setPolicies] = useState<DelegationPolicy>({
    ttl: 86400,              // 24 hours
    maxAmount: '1000000000', // 1 SOL
    dailyLimit: '5000000000', // 5 SOL
    allowedPrograms: []       // Empty = all allowed
  });

  const solanaWallet = wallets?.find(w => w.walletClientType === 'solana');

  const handleAuthorize = async () => {
    if (!solanaWallet || !user) {
      alert('Please connect a Solana wallet first');
      return;
    }

    setLoading(true);
    
    try {
      // Call your backend API to create session signer
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/wallets/onboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          chainType: 'solana',
          policies: policies
        })
      });

      if (!response.ok) {
        throw new Error('Authorization failed');
      }

      const result = await response.json();
      
      console.log('✅ Delegation authorized:', result);
      setDelegated(true);
      
      // Show success message
      alert('Authorization successful! Your wallet can now be used for automated trading.');
      
    } catch (error) {
      console.error('Authorization error:', error);
      alert('Failed to authorize delegation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return null;
  }

  if (delegated) {
    return (
      <div className="delegation-success">
        <div className="success-icon">✅</div>
        <h3>Delegation Active</h3>
        <p>Your wallet is now authorized for automated trading</p>
        <button onClick={() => setDelegated(false)} className="secondary-button">
          View Settings
        </button>
      </div>
    );
  }

  return (
    <div className="delegation-authorization">
      <h2>Authorize Automated Trading</h2>
      
      <div className="authorization-info">
        <p>Grant permission for automated trading workflows to execute transactions on your behalf.</p>
        <div className="info-badge">
          ℹ️ Your wallet remains self-custodial and secure
        </div>
      </div>

      <div className="policy-configuration">
        <h3>Security Policies</h3>
        
        <div className="policy-field">
          <label>Time Limit</label>
          <select 
            value={policies.ttl} 
            onChange={(e) => setPolicies({...policies, ttl: parseInt(e.target.value)})}
          >
            <option value={3600}>1 hour</option>
            <option value={86400}>24 hours</option>
            <option value={604800}>7 days</option>
            <option value={2592000}>30 days</option>
          </select>
          <div className="field-help">How long this authorization lasts</div>
        </div>

        <div className="policy-field">
          <label>Max Transaction Amount</label>
          <input
            type="text"
            value={(parseInt(policies.maxAmount || '0') / 1e9).toFixed(2)}
            onChange={(e) => setPolicies({
              ...policies, 
              maxAmount: (parseFloat(e.target.value) * 1e9).toString()
            })}
          />
          <div className="field-help">SOL per transaction (e.g., 1.0)</div>
        </div>

        <div className="policy-field">
          <label>Daily Spending Limit</label>
          <input
            type="text"
            value={(parseInt(policies.dailyLimit || '0') / 1e9).toFixed(2)}
            onChange={(e) => setPolicies({
              ...policies, 
              dailyLimit: (parseFloat(e.target.value) * 1e9).toString()
            })}
          />
          <div className="field-help">Maximum SOL per day (e.g., 5.0)</div>
        </div>

        <div className="policy-field">
          <label>Allowed Programs (Optional)</label>
          <select 
            multiple
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
              setPolicies({...policies, allowedPrograms: selected});
            }}
          >
            <option value="">All Programs (Default)</option>
            <option value="JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB">Jupiter</option>
            <option value="675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8">Raydium</option>
            <option value="whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc">Orca</option>
          </select>
          <div className="field-help">Leave empty to allow all programs</div>
        </div>
      </div>

      <div className="authorization-summary">
        <h4>You're authorizing:</h4>
        <ul>
          <li>✅ Max {(parseInt(policies.maxAmount || '0') / 1e9).toFixed(2)} SOL per transaction</li>
          <li>✅ Max {(parseInt(policies.dailyLimit || '0') / 1e9).toFixed(2)} SOL per day</li>
          <li>✅ Valid for {policies.ttl! / 3600} hours</li>
          <li>✅ {policies.allowedPrograms?.length ? `${policies.allowedPrograms.length} allowed programs` : 'All programs allowed'}</li>
        </ul>
      </div>

      <button
        onClick={handleAuthorize}
        disabled={loading}
        className="authorize-button"
      >
        {loading ? 'Authorizing...' : 'Authorize Automated Trading'}
      </button>

      <div className="security-note">
        🔒 You can revoke this authorization at any time
      </div>
    </div>
  );
}
```

### Component 3: Delegation Status Dashboard

```tsx
// components/DelegationStatus.tsx
import { usePrivy } from '@privy-io/react-auth';
import { useState, useEffect } from 'react';

interface SessionSigner {
  id: string;
  expiresAt: string;
  usageCount: number;
  dailyUsage: string;
  maxAmount: string;
  dailyLimit: string;
  lastUsedAt?: string;
}

export function DelegationStatus() {
  const { user, authenticated } = usePrivy();
  const [signers, setSigners] = useState<SessionSigner[]>([]);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    if (authenticated && user) {
      fetchDelegationStatus();
    }
  }, [authenticated, user]);

  const fetchDelegationStatus = async () => {
    try {
      // Fetch active session signers
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/wallets/${user?.id}/session-signers`
      );
      
      if (response.ok) {
        const data = await response.json();
        setSigners(data.signers || []);
      }

      // Fetch recent transactions
      const txResponse = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/wallets/${user?.id}/transactions`
      );
      
      if (txResponse.ok) {
        const txData = await txResponse.json();
        setTransactions(txData.transactions || []);
      }
    } catch (error) {
      console.error('Failed to fetch delegation status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (signerId: string) => {
    if (!confirm('Revoke this delegation? Automated trading will stop.')) {
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/wallets/${user?.id}/session-signers/${signerId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ userId: user?.id })
        }
      );

      if (response.ok) {
        alert('Delegation revoked successfully');
        fetchDelegationStatus();
      }
    } catch (error) {
      console.error('Failed to revoke:', error);
      alert('Failed to revoke delegation. Please try again.');
    }
  };

  if (!authenticated) {
    return null;
  }

  if (loading) {
    return <div>Loading status...</div>;
  }

  return (
    <div className="delegation-status">
      <h2>Active Delegations</h2>

      {signers.length === 0 ? (
        <div className="no-delegations">
          <p>No active delegations</p>
          <p className="help-text">Authorize automated trading to get started</p>
        </div>
      ) : (
        <div className="signers-list">
          {signers.map(signer => (
            <div key={signer.id} className="signer-card">
              <div className="signer-header">
                <div className="signer-status active">Active</div>
                <button
                  onClick={() => handleRevoke(signer.id)}
                  className="revoke-button"
                >
                  Revoke
                </button>
              </div>

              <div className="signer-details">
                <div className="detail-row">
                  <span className="label">Expires:</span>
                  <span className="value">
                    {new Date(signer.expiresAt).toLocaleString()}
                  </span>
                </div>

                <div className="detail-row">
                  <span className="label">Usage:</span>
                  <span className="value">
                    {signer.usageCount} transactions
                  </span>
                </div>

                <div className="detail-row">
                  <span className="label">Today's Usage:</span>
                  <span className="value">
                    {(parseInt(signer.dailyUsage) / 1e9).toFixed(4)} / {(parseInt(signer.dailyLimit) / 1e9).toFixed(2)} SOL
                  </span>
                </div>

                <div className="detail-row">
                  <span className="label">Max per TX:</span>
                  <span className="value">
                    {(parseInt(signer.maxAmount) / 1e9).toFixed(2)} SOL
                  </span>
                </div>

                {signer.lastUsedAt && (
                  <div className="detail-row">
                    <span className="label">Last Used:</span>
                    <span className="value">
                      {new Date(signer.lastUsedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="transactions-section">
        <h3>Recent Transactions</h3>
        {transactions.length === 0 ? (
          <p className="no-transactions">No transactions yet</p>
        ) : (
          <div className="transactions-list">
            {transactions.slice(0, 10).map((tx: any) => (
              <div key={tx.id} className="transaction-row">
                <div className="tx-status">{tx.status}</div>
                <div className="tx-amount">
                  {(parseInt(tx.amount) / 1e9).toFixed(4)} SOL
                </div>
                <div className="tx-time">
                  {new Date(tx.createdAt).toLocaleString()}
                </div>
                {tx.transactionSignature && (
                  <a
                    href={`https://solscan.io/tx/${tx.transactionSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tx-link"
                  >
                    View →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

### Component 4: Full Integration Example

```tsx
// pages/WalletDelegation.tsx
import { WalletConnection } from '@/components/WalletConnection';
import { DelegationAuthorization } from '@/components/DelegationAuthorization';
import { DelegationStatus } from '@/components/DelegationStatus';
import { usePrivy } from '@privy-io/react-auth';
import { useState } from 'react';

export function WalletDelegation() {
  const { authenticated } = usePrivy();
  const [activeTab, setActiveTab] = useState<'authorize' | 'status'>('authorize');

  return (
    <div className="wallet-delegation-page">
      <header className="page-header">
        <h1>Automated Trading Setup</h1>
        <p>Connect your wallet and authorize automated trading workflows</p>
      </header>

      <div className="wallet-section">
        <WalletConnection />
      </div>

      {authenticated && (
        <>
          <div className="tabs">
            <button
              className={activeTab === 'authorize' ? 'active' : ''}
              onClick={() => setActiveTab('authorize')}
            >
              Authorize
            </button>
            <button
              className={activeTab === 'status' ? 'active' : ''}
              onClick={() => setActiveTab('status')}
            >
              Status & Activity
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'authorize' ? (
              <DelegationAuthorization />
            ) : (
              <DelegationStatus />
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

---

## 🎨 Styling Example

```css
/* styles/wallet-delegation.css */

.wallet-delegation-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  text-align: center;
  margin-bottom: 40px;
}

.page-header h1 {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 12px;
}

.page-header p {
  font-size: 16px;
  color: #6b7280;
}

/* Wallet Connection */
.wallet-connection {
  background: #fff;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  padding: 24px;
  text-align: center;
}

.connect-button {
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px 32px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.connect-button:hover {
  background: #5568d3;
}

.connect-button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.wallet-connected {
  background: #f0fdf4;
  border: 2px solid #86efac;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.wallet-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.wallet-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #667eea;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
}

.chain-badge {
  background: #667eea;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  margin-right: 8px;
}

.wallet-type {
  font-size: 14px;
  color: #6b7280;
  text-transform: capitalize;
}

.disconnect-button {
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
}

/* Delegation Authorization */
.delegation-authorization {
  background: #fff;
  border-radius: 12px;
  padding: 32px;
  margin-top: 20px;
}

.authorization-info {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
}

.info-badge {
  margin-top: 12px;
  font-size: 14px;
  color: #1e40af;
}

.policy-configuration {
  margin: 24px 0;
}

.policy-field {
  margin-bottom: 20px;
}

.policy-field label {
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
}

.policy-field input,
.policy-field select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}

.field-help {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

.authorization-summary {
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px;
  margin: 24px 0;
}

.authorization-summary h4 {
  margin-bottom: 12px;
}

.authorization-summary ul {
  list-style: none;
  padding: 0;
}

.authorization-summary li {
  padding: 8px 0;
  border-bottom: 1px solid #e5e7eb;
}

.authorization-summary li:last-child {
  border-bottom: none;
}

.authorize-button {
  width: 100%;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.authorize-button:hover {
  background: #059669;
}

.authorize-button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.security-note {
  text-align: center;
  font-size: 14px;
  color: #6b7280;
  margin-top: 16px;
}

/* Delegation Status */
.delegation-status {
  background: #fff;
  border-radius: 12px;
  padding: 32px;
  margin-top: 20px;
}

.signer-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.signer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.signer-status {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.signer-status.active {
  background: #d1fae5;
  color: #065f46;
}

.revoke-button {
  background: #fecaca;
  color: #991b1b;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 14px;
  cursor: pointer;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f3f4f6;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-row .label {
  font-weight: 600;
  color: #6b7280;
}

.detail-row .value {
  color: #111827;
}

.transactions-section {
  margin-top: 40px;
}

.transaction-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.tx-status {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: #d1fae5;
  color: #065f46;
}

.tx-link {
  color: #667eea;
  text-decoration: none;
  font-weight: 600;
}

.tx-link:hover {
  text-decoration: underline;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 8px;
  border-bottom: 2px solid #e5e7eb;
  margin-bottom: 20px;
}

.tabs button {
  background: none;
  border: none;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
}

.tabs button.active {
  color: #667eea;
  border-bottom-color: #667eea;
}
```

---

## 📡 Backend API Reference

### POST /api/wallets/onboard

Create wallet and session signer for user.

**Request:**
```json
{
  "userId": "user-123",
  "chainType": "solana",
  "policies": {
    "ttl": 86400,
    "maxAmount": "1000000000",
    "dailyLimit": "5000000000",
    "allowedPrograms": ["JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB"]
  }
}
```

**Response:**
```json
{
  "wallet": {
    "walletId": "wlt_abc123",
    "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA8...",
    "chainType": "solana"
  },
  "sessionSigner": {
    "signerId": "sig_xyz789",
    "expiresAt": "2025-11-14T13:46:00Z"
  }
}
```

### GET /api/wallets/:userId/session-signers

Fetch active session signers for user.

**Response:**
```json
{
  "signers": [
    {
      "id": "sig_xyz789",
      "expiresAt": "2025-11-14T13:46:00Z",
      "usageCount": 42,
      "dailyUsage": "2500000000",
      "maxAmount": "1000000000",
      "dailyLimit": "5000000000",
      "lastUsedAt": "2025-11-13T10:30:00Z"
    }
  ]
}
```

### DELETE /api/wallets/:userId/session-signers/:signerId

Revoke a session signer.

**Request:**
```json
{
  "userId": "user-123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Session signer revoked"
}
```

### GET /api/wallets/:userId/transactions

Fetch recent transactions.

**Response:**
```json
{
  "transactions": [
    {
      "id": "tx_123",
      "amount": "500000000",
      "status": "success",
      "transactionSignature": "5eykt4UsFv8P8NJdTREpY1vzq...",
      "createdAt": "2025-11-13T09:15:00Z"
    }
  ]
}
```

---

## 🧪 Testing Your Implementation

### 1. Local Development Testing

```bash
# Start your frontend dev server
npm run dev

# Open browser to http://localhost:5173 (or your port)
# Test the following scenarios:
```

**Test Scenarios:**
1. ✅ Connect wallet with Phantom
2. ✅ Connect wallet with MetaMask
3. ✅ Configure policies with various limits
4. ✅ Authorize delegation
5. ✅ View status dashboard
6. ✅ Revoke delegation
7. ✅ Reconnect and verify state

### 2. Browser Console Debugging

Open browser DevTools (F12) and check:

```javascript
// Check Privy session
console.log('Privy user:', window.privy?.user);

// Check wallet connection
console.log('Connected wallets:', window.privy?.wallets);

// Monitor API calls
// Network tab → Filter by '/api/wallets'
```

### 3. Error Handling Test Cases

**Test these error scenarios:**

```tsx
// Test 1: No wallet connected
// Expected: Show "Please connect wallet first" message

// Test 2: Invalid policy values
// Expected: Show validation error

// Test 3: Backend API down
// Expected: Show "Failed to authorize" error

// Test 4: Network timeout
// Expected: Loading state → Timeout error

// Test 5: Already delegated
// Expected: Show existing delegation status
```

### 4. Integration Testing Checklist

- [ ] Wallet connects successfully
- [ ] Privy modal displays correct wallet options
- [ ] Policy form validates user input
- [ ] Authorization API call succeeds
- [ ] Status dashboard loads data
- [ ] Transaction list displays correctly
- [ ] Revocation works immediately
- [ ] Page refresh maintains state
- [ ] Mobile responsive layout works
- [ ] Error messages are user-friendly

---

## 🎯 UI/UX Best Practices

### Clear Communication

**Good ✅**
```tsx
<p>
  Authorize automated trading with a maximum of 1 SOL per transaction 
  and 5 SOL per day. You can revoke this anytime.
</p>
```

**Bad ❌**
```tsx
<p>
  Create session signer with policy enforcement
</p>
```

### Visual Feedback

**Loading States:**
```tsx
{loading && (
  <div className="loading-spinner">
    <div className="spinner"></div>
    <p>Authorizing delegation...</p>
  </div>
)}
```

**Success States:**
```tsx
{success && (
  <div className="success-message">
    <span className="icon">✅</span>
    <h3>Authorization Complete!</h3>
    <p>Your wallet is ready for automated trading</p>
  </div>
)}
```

**Error States:**
```tsx
{error && (
  <div className="error-message">
    <span className="icon">⚠️</span>
    <h3>Authorization Failed</h3>
    <p>{error.message}</p>
    <button onClick={retry}>Try Again</button>
  </div>
)}
```

### Progressive Disclosure

Start with essential information, reveal details on demand:

```tsx
<div className="policy-summary">
  <h4>Security Policy Summary</h4>
  <ul>
    <li>Max per transaction: 1 SOL</li>
    <li>Daily limit: 5 SOL</li>
    <li>Valid for: 24 hours</li>
  </ul>
  
  <button onClick={() => setShowDetails(!showDetails)}>
    {showDetails ? 'Hide Details' : 'Show Full Policy'}
  </button>
  
  {showDetails && (
    <div className="policy-details">
      {/* Detailed policy information */}
    </div>
  )}
</div>
```

### Mobile Considerations

```css
/* Mobile-friendly styles */
@media (max-width: 768px) {
  .wallet-delegation-page {
    padding: 12px;
  }
  
  .policy-field input,
  .policy-field select {
    font-size: 16px; /* Prevents zoom on iOS */
  }
  
  .authorize-button {
    padding: 14px; /* Larger touch target */
  }
  
  .transaction-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
```

---

## 🔒 Security Considerations

### Frontend Security Checklist

1. **Never Store Sensitive Data in localStorage**
```tsx
// ❌ BAD
localStorage.setItem('privySession', JSON.stringify(session));

// ✅ GOOD - Let Privy manage session
// Session is handled automatically by Privy SDK
```

2. **Validate User Input**
```tsx
const validateAmount = (amount: string) => {
  const parsed = parseFloat(amount);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error('Invalid amount');
  }
  if (parsed > 1000) { // 1000 SOL max
    throw new Error('Amount too large');
  }
  return (parsed * 1e9).toString(); // Convert to lamports
};
```

3. **Sanitize Display Values**
```tsx
// Prevent XSS in transaction signatures
const sanitizeSignature = (sig: string) => {
  return sig.replace(/[<>]/g, '');
};
```

4. **Use HTTPS in Production**
```bash
# .env.production
VITE_API_BASE_URL=https://api.yourdomain.com
```

---

## 🚀 Production Deployment

### Build Optimization

```bash
# Build for production
npm run build

# Test production build locally
npm run preview
```

### Environment Configuration

**Development (.env.local):**
```bash
VITE_PRIVY_APP_ID=cm7kvvobw020cisjqrkr9hr2m
VITE_API_BASE_URL=http://localhost:3001
```

**Production (.env.production):**
```bash
VITE_PRIVY_APP_ID=your_production_app_id
VITE_API_BASE_URL=https://api.yourdomain.com
```

### Deployment Checklist

- [ ] Update VITE_PRIVY_APP_ID to production app
- [ ] Update VITE_API_BASE_URL to production backend
- [ ] Test wallet connection in production
- [ ] Verify API cors settings allow your domain
- [ ] Test authorization flow end-to-end
- [ ] Monitor for errors in production
- [ ] Set up error tracking (Sentry, etc.)

---

## 🐛 Troubleshooting

### Issue: "Privy is not defined"

**Cause:** Privy SDK not loaded properly

**Solution:**
```tsx
// Wrap usage in ready check
const { ready } = usePrivy();

if (!ready) {
  return <div>Loading...</div>;
}
```

### Issue: "Failed to connect wallet"

**Cause:** Wallet extension not installed or blocked

**Solution:**
```tsx
try {
  await login();
} catch (error) {
  if (error.message.includes('User rejected')) {
    alert('Connection cancelled. Please try again.');
  } else if (error.message.includes('No wallet')) {
    alert('Please install Phantom or MetaMask wallet extension.');
  } else {
    alert('Connection failed. Please refresh and try again.');
  }
}
```

### Issue: "Authorization API call fails with 401"

**Cause:** Missing or invalid authentication

**Solution:**
```tsx
// Ensure user is authenticated before API call
const { user, authenticated } = usePrivy();

if (!authenticated || !user) {
  alert('Please connect your wallet first');
  return;
}

// Then make API call with user.id
```

### Issue: "Session signer not found"

**Cause:** Delegation not created or expired

**Solution:**
```tsx
// Add helpful error message
if (error.message.includes('No active session signer')) {
  return (
    <div className="no-signer-message">
      <p>No active delegation found</p>
      <p>Please authorize automated trading to continue</p>
      <button onClick={() => navigate('/authorize')}>
        Authorize Now
      </button>
    </div>
  );
}
```

---

## 📚 Additional Resources

### Privy Documentation
- [React SDK](https://docs.privy.io/sdk/react)
- [Solana Support](https://docs.privy.io/wallets/chains/solana)
- [Wallet Connectors](https://docs.privy.io/wallets/external)

### Your Backend Documentation
- Main Integration Guide: `PRIVY-N8N-WALLET-INTEGRATION-GUIDE.md`
- Backend API: `offchain/src/routes/walletRoutes.ts`
- Session Signers: `offchain/src/services/sessionSignerService.ts`

### Example Repositories
- Check `auth-frontend/src/App.tsx` for reference implementation
- Check `browser-extension/src/auth.tsx` for extension integration

---

## 💬 User Communication Templates

### Email: Authorization Request

**Subject:** Authorize Automated Trading - Action Required

**Body:**
```
Hi [User Name],

To enable automated trading on your Lucid account, please authorize 
wallet delegation by following this link:

[Authorize Now Button]

What this means:
✓ Your wallet remains self-custodial (you're always in control)
✓ Automated workflows can execute trades within your limits
✓ Max transaction: 1 SOL
✓ Daily limit: 5 SOL
✓ Valid for: 24 hours
✓ You can revoke anytime

Questions? Reply to this email or visit our help center.

Stay safe,
The Lucid Team
```

### In-App Notification

```tsx
<div className="authorization-prompt">
  <h3>🤖 Enable Automated Trading</h3>
  <p>
    Set up wallet delegation to let your trading strategies run 24/7.
    Takes less than 2 minutes.
  </p>
  <button onClick={navigateToAuth}>Get Started</button>
</div>
```

### Success Message

```tsx
<div className="success-notification">
  <span className="emoji">🎉</span>
  <h3>You're All Set!</h3>
  <p>
    Your wallet is authorized for automated trading. We'll notify you 
    of all transactions via email.
  </p>
  <a href="/dashboard">View Dashboard</a>
</div>
```

---

## ✅ Implementation Checklist

### Phase 1: Setup
- [ ] Install @privy-io/react-auth dependencies
- [ ] Configure PrivyProvider with correct app ID
- [ ] Set up environment variables
- [ ] Create component directory structure

### Phase 2: Wallet Connection
- [ ] Build WalletConnection component
- [ ] Test connection with Phantom
- [ ] Test connection with MetaMask
- [ ] Handle connection errors gracefully

### Phase 3: Delegation Authorization
- [ ] Build policy configuration form
- [ ] Add input validation
- [ ] Implement backend API call
- [ ] Show success/error states
- [ ] Test full flow end-to-end

### Phase 4: Status Dashboard
- [ ] Build DelegationStatus component
- [ ] Fetch and display session signers
- [ ] Show transaction history
- [ ] Implement revocation
- [ ] Add refresh functionality

### Phase 5: Polish
- [ ] Add responsive CSS
- [ ] Implement loading states
- [ ] Add error boundaries
- [ ] Write user-friendly copy
- [ ] Test on mobile devices

### Phase 6: Production
- [ ] Update environment variables
- [ ] Build and deploy
- [ ] Test in production
- [ ] Monitor for errors
- [ ] Gather user feedback

---

## 🎓 Next Steps

After implementing this guide:

1. **Test thoroughly** with real wallets on devnet
2. **Get user feedback** on the authorization flow
3. **Monitor analytics** to identify drop-off points
4. **Iterate on UX** based on user behavior
5. **Add advanced features** like:
   - Multiple delegation profiles
   - Strategy templates
   - Performance analytics
   - Notification preferences

---

**Questions or Issues?**

Check the main integration guide (`PRIVY-N8N-WALLET-INTEGRATION-GUIDE.md`) or reach out to the backend team for API support.

**Version:** 1.0.0  
**Last Updated:** 2025-11-13  
**Maintainer:** Lucid Frontend Team
