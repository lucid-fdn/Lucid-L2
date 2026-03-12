import React, { useEffect } from 'react';
import { PrivyProvider, useLogin, usePrivy, useWallets } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
// Extend Window interface for Chrome API
declare global {
  interface Window {
    chrome: any;
  }
}

const PRIVY_APP_ID = 'cm7kvvobw020cisjqrkr9hr2m';

function AuthContent() {
  const { ready, authenticated, user, logout } = usePrivy();
  const { login } = useLogin({
    onComplete: () => {
      console.log('✅ Authentication complete');
    }
  });
  const { wallets } = useWallets();

  const urlParams = new URLSearchParams(window.location.search);
  const extensionId = urlParams.get('extension_id') || '';
  const isLogout = urlParams.get('logout') === '1';

  useEffect(() => {
    if (!ready) return;

    if (isLogout && authenticated) {
      console.log('🔓 Logging out from Privy...');
      logout();
      return;
    }

    if (authenticated && wallets && wallets.length > 0) {
      const evmWallet = wallets.find((w: any) => w.walletClientType !== 'solana');
      const solanaWallet = wallets.find((w: any) => w.walletClientType === 'solana');

      const payload = {
        userId: user?.id || null,
        address: evmWallet?.address || null,
        solanaAddress: solanaWallet?.address || null,
        walletType: evmWallet?.walletClientType || null,
        solanaWalletType: solanaWallet?.walletClientType || 'solana',
        walletCount: wallets.length,
        hasSolanaWallet: !!solanaWallet,
        hasEvmWallet: !!evmWallet,
        preferredWallet: solanaWallet ? 'solana' : 'evm'
      };

      console.log('✅ Sending to extension:', payload);
      console.log('✅ Extension id:', extensionId);

      if (window.chrome?.runtime && extensionId) {
        window.chrome.runtime.sendMessage(extensionId, { type: 'privy_authenticated', payload });
      }
      /*
      setTimeout(() => {
        try {
          window.chrome?.tabs?.getCurrent((tab: any) => {
            if (tab?.id) window.chrome.tabs.remove(tab.id);
          }) || window.close();
        } catch { window.close(); }
      }, 2000);
      */
    }
  }, [ready, authenticated, user, wallets, logout, isLogout]);

  useEffect(() => {
    if (!ready || !isLogout || authenticated) return;
    
    console.log('✅ Logout complete');
    if (window.chrome?.runtime && extensionId) {
      window.chrome.runtime.sendMessage(extensionId, { type: 'privy_logged_out' });
    }
    setTimeout(() => window.close(), 1000);
  }, [ready, authenticated, isLogout]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px', textAlign: 'center' }}>
      <div style={{ maxWidth: '400px', width: '100%' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '20px' }}>Lucid L2™</h1>
        {!ready && <div><div className="loading-spinner"></div><p style={{ marginTop: '20px' }}>Loading...</p></div>}
        {ready && !authenticated && !isLogout && (
          <>
            <p style={{ marginBottom: '20px', fontSize: '16px' }}>Connect your wallet to start earning mGas</p>
            <button onClick={() => login()} style={{ background: '#667eea', color: 'white', border: 'none', borderRadius: '12px', padding: '16px 32px', fontSize: '18px', cursor: 'pointer', width: '100%' }}>
              Connect Wallet
            </button>
          </>
        )}
        {ready && authenticated && <div><div style={{ fontSize: '48px' }}>✅</div><p style={{ fontSize: '18px', color: '#10b981' }}>Connected!</p></div>}
        {isLogout && <div><div style={{ fontSize: '48px' }}>🔓</div><p>{authenticated ? 'Logging out...' : 'Logged Out'}</p></div>}
      </div>
    </div>
  );
}

function App() {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['wallet', 'email', 'google'],
        appearance: {
          theme: 'dark',
          accentColor: '#667eea',
          showWalletLoginFirst: true,
          walletChainType: 'ethereum-and-solana',
          walletList: ['phantom', 'backpack', 'detected_solana_wallets', 'metamask', 'detected_ethereum_wallets', 'rainbow', 'coinbase_wallet', 'wallet_connect']
        },
        externalWallets: {
                  solana: {
                    connectors: toSolanaWalletConnectors()
                  }
        },
      }}
    >
      <AuthContent />
    </PrivyProvider>
  );
}

export default App;
