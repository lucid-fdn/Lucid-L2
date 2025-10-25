import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

// Chrome extension API types
declare const chrome: any;

const PRIVY_APP_ID = 'cm7kvvobw020cisjqrkr9hr2m';

// Import existing popup functionality
// We'll wrap it with Privy

function PopupContent() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const [showPrivyLogin, setShowPrivyLogin] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    
    // Get both EVM and Solana wallets
    const evmWallet = wallets?.find((w: any) => w.walletClientType !== 'solana');
    const solanaWallet = wallets?.find((w: any) => w.walletClientType === 'solana');
    
    console.log('🔍 Wallet connected:', {
      totalWallets: wallets?.length || 0,
      solanaAddress: solanaWallet?.address,
      evmAddress: evmWallet?.address
    });

    // Store wallet info
    const payload = {
      userId: user?.id || null,
      address: evmWallet?.address || null,
      solanaAddress: solanaWallet?.address || null,
      walletCount: wallets?.length || 0,
      hasSolanaWallet: !!solanaWallet,
      hasEvmWallet: !!evmWallet
    };
    
    chrome.storage.local.set({ 
      privy_session: payload,
      wallet: {
        address: solanaWallet?.address || evmWallet?.address || null
      }
    });

    // Notify background script
    chrome.runtime.sendMessage({ type: 'privy_authenticated', payload });
    
    // Close Privy modal after connection
    setShowPrivyLogin(false);
  }, [authenticated, user, wallets]);

  if (!ready) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <div>🔄 Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div style={{ 
        width: 400,
        minHeight: 600,
        background: '#0b1020',
        color: '#e5e7eb',
        fontFamily: 'system-ui',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}>
        <div style={{ textAlign: 'center', maxWidth: 350 }}>
          <h1 style={{ fontSize: 32, marginBottom: 10 }}>Lucid L2™</h1>
          <h2 style={{ fontSize: 18, marginBottom: 20, opacity: 0.8 }}>AI Thought Miner</h2>
          
          <p style={{ marginBottom: 30, opacity: 0.7, lineHeight: 1.6 }}>
            Connect your wallet to start earning mGas by interacting with AI models
          </p>

          <button
            onClick={() => {
              setShowPrivyLogin(true);
              login();
            }}
            style={{
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '14px 28px',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%',
              marginBottom: 12
            }}
          >
            🔗 Connect Wallet
          </button>

          <p style={{ fontSize: 12, opacity: 0.5, marginTop: 20 }}>
            v1.0.0 DEVNET
          </p>
        </div>
      </div>
    );
  }

  // User is authenticated - load the existing popup functionality
  // This loads the existing popup.js logic
  useEffect(() => {
    // Trigger the existing popup initialization
    const script = document.createElement('script');
    script.src = 'popup.js';
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div id="popup-content-root">
      {/* The existing popup.html content will be inserted here */}
      {/* popup.js will take over from here */}
    </div>
  );
}

function App() {
  return (
    <PrivyProvider 
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'wallet', 'google'],
        appearance: {
          theme: 'dark',
          accentColor: '#2563eb',
          logo: 'https://your-logo-url.com/logo.png',
          walletChainType: 'ethereum-and-solana',
          walletList: [
            'phantom',
            'backpack',
            'detected_solana_wallets',
            'metamask',
            'detected_ethereum_wallets',
            'rainbow',
            'coinbase_wallet',
            'wallet_connect',
          ],
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors()
          }
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
          solana: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      <PopupContent />
    </PrivyProvider>
  );
}

// Initialize when DOM is ready
if (document.getElementById('privy-popup-root')) {
  createRoot(document.getElementById('privy-popup-root')!).render(<App />);
}
