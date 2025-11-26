import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider, useLogin, usePrivy, useWallets } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

// Chrome extension API types
declare const chrome: any;

const PRIVY_APP_ID = 'cm7kvvobw020cisjqrkr9hr2m';

function notifyPrivyAuthenticated(payload: any) {
  try {
    if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
      try {
        chrome.storage?.local?.set?.({ privy_session: payload }, () => {
          try {
            chrome.runtime.sendMessage({ type: 'privy_authenticated', payload });
          } catch {}
        });
      } catch {}
    } else {
      window.postMessage({ type: 'PRIVY_CONNECTED', payload }, '*');
    }
  } catch {
    try {
      window.postMessage({ type: 'PRIVY_CONNECTED', payload }, '*');
    } catch {}
  }
}

function notifyPrivyLoggedOut() {
  try {
    if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'privy_logged_out' }, () => {});
    } else {
      window.postMessage({ type: 'PRIVY_LOGGED_OUT' }, '*');
    }
  } catch {}
}

function AuthContent() {
  const { ready, authenticated, user, logout } = usePrivy();
  const { login } = useLogin({
    onComplete: () => {
      // Authentication complete - the window will close automatically
      console.log('✅ Authentication complete, closing auth window...');
    }
  });
  const { wallets } = useWallets();

  const params = new URLSearchParams(window.location.search);
  const doLogout = params.get('logout');
  const forceLogout = params.get('forceLogout');
  
  // Prevent multiple login calls
  const [loginStarted, setLoginStarted] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);

  useEffect(() => {
    if (!ready) return;
    
    if (doLogout || forceLogout) {
      if (loggingOut) return; // Prevent multiple logout calls
      setLoggingOut(true);
      
      // Force logout and clear everything
      (async () => {
        try { 
          if (authenticated) {
            console.log('🔓 Logging out from Privy...');
            await logout(); 
          } else {
            console.log('🔓 Force clearing session data...');
          }
        } catch (err) {
          console.log('Logout error (ignored):', err);
        }
        
        // Clear all stored data
        chrome.storage.local.clear(() => {
          console.log('✅ All storage cleared');
          chrome.runtime.sendMessage({ type: 'privy_logged_out' }, () => {
            console.log('✅ Logout notification sent');
            setTimeout(() => {
              window.close();
            }, 500);
          });
        });
      })();
      return;
    }

    // DON'T auto-trigger login - wait for user to click
    // This prevents recursive popup issues
  }, [ready, authenticated, login, logout, doLogout, forceLogout, loginStarted, loggingOut]);

  useEffect(() => {
    if (!authenticated) return;
    
    // Get both EVM and Solana wallets
    const evmWallet = wallets?.find((w: any) => w.walletClientType !== 'solana');
    const solanaWallet = wallets?.find((w: any) => w.walletClientType === 'solana');
    
    console.log('🔍 Wallet analysis:', {
      totalWallets: wallets?.length || 0,
      evmWallet: evmWallet ? { 
        type: evmWallet.walletClientType, 
        address: evmWallet.address?.substring(0, 10) + '...' 
      } : null,
      solanaWallet: solanaWallet ? { 
        type: solanaWallet.walletClientType, 
        address: solanaWallet.address?.substring(0, 10) + '...' 
      } : null
    });

    // Check if we need a Solana wallet specifically
    if (!solanaWallet && evmWallet) {
      console.log('⚠️ Only EVM wallet detected, user needs Solana wallet for devnet');
    }
    
    const payload = {
      userId: user?.id || null,
      // EVM wallet info (fallback)
      address: evmWallet?.address || null,
      chainId: evmWallet?.chainId || null,
      walletType: evmWallet?.walletClientType || null,
      // Solana wallet info (prioritized)
      solanaAddress: solanaWallet?.address || null,
      solanaWalletType: solanaWallet?.walletClientType || 'solana',
      // Additional info
      walletCount: wallets?.length || 0,
      hasSolanaWallet: !!solanaWallet,
      hasEvmWallet: !!evmWallet,
      preferredWallet: solanaWallet ? 'solana' : 'evm'
    };
    
    // Store session and notify (works in both extension and in-page contexts)
    notifyPrivyAuthenticated(payload);
    console.log('✅ Authentication complete, wallet data stored');
    
    // ✅ FIX: Close the auth tab after success (not window, since we're in a tab now)
    try {
      setTimeout(() => {
        try {
          chrome.tabs.getCurrent((tab: any) => {
            if (tab?.id) {
              chrome.tabs.remove(tab.id);
            }
          });
        } catch {
          // Fallback to window.close() if not in tab context
          window.close();
        }
      }, 1000);
    } catch {}
  }, [authenticated, user, wallets]);

  return (
    <div style={{ 
      padding: 20, 
      fontFamily: 'system-ui', 
      textAlign: 'center',
      background: '#0b1020',
      color: '#e5e7eb',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {!ready && (
        <div className="text-center">
          <img 
            src={chrome.runtime.getURL('icons/lucid_w.gif')}
            alt="Loading..."
            className="w-16 h-16 mx-auto mb-4"
          />
          <p className="text-sm text-slate-400">Loading Privy...</p>
        </div>
      )}
      
      {ready && !authenticated && (doLogout || forceLogout) && <div>🔓 Logging out...</div>}
      
      {ready && !authenticated && !doLogout && !forceLogout && (
        <div style={{ maxWidth: 400 }}>
          <h2 style={{ marginBottom: 20 }}>Connect Your Wallet</h2>
          <p style={{ marginBottom: 30, opacity: 0.8 }}>
            Connect your Solana wallet to start earning mGas
          </p>
          <button
            onClick={() => {
              setLoginStarted(true);
              login();
            }}
            style={{
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%'
            }}
          >
            Connect Wallet
          </button>
        </div>
      )}
      
      {ready && authenticated && <div>✅ Connected! Closing window...</div>}
      {loggingOut && <div>🧹 Clearing session data...</div>}
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
          showWalletLoginFirst: true,
          walletChainType: 'ethereum-and-solana',
          walletList: [
            // Solana wallets (prioritized)
            'phantom',
            'backpack',
            'detected_solana_wallets',
            
            // Ethereum wallets
            'metamask',
            'detected_ethereum_wallets',
            'rainbow',
            'coinbase_wallet',
            'wallet_connect',
          ],
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors({shouldAutoConnect: true,})
          }
        },
      }}
    >
      <AuthContent />
    </PrivyProvider>
  );
}

// Export initialization function for server-side usage
// This simply mounts the same App component to a different root
(window as any).initPrivyAuth = function(config: {
  containerId: string;
  appId: string;
  extensionId: string;
  onSuccess: (walletData: any) => void;
  onError: (error: Error) => void;
}) {
  console.log('🔐 Initializing Privy on server page with config:', config);
  
  // Store callbacks globally for the AuthContent component to access
  (window as any).__privyCallbacks = {
    onSuccess: config.onSuccess,
    onError: config.onError
  };
  
  const container = document.getElementById(config.containerId);
  if (!container) {
    throw new Error(`Container element with id '${config.containerId}' not found`);
  }
  
  // Simply mount the same App component
  createRoot(container).render(<App />);
};

// Also initialize for extension context if root element exists
const extensionRoot = document.getElementById('lucid-privy-root');
if (extensionRoot) {
  createRoot(extensionRoot).render(<App />);
}
