import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import App from './App';
import config from './config';

// Create root element
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <PrivyProvider
      appId={config.privyAppId}
      config={{
        embeddedWallets: {
          solana: {
            createOnLogin: 'users-without-wallets',
          },
        },
        appearance: {
          walletChainType: 'solana-only',
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors(),
          },
        },
        loginMethods: ['wallet', 'email'],
        supportedChains: [config.network === 'mainnet-beta' ? 'solana' : 'solana:devnet'],
      }}
    >
      <App />
    </PrivyProvider>
  </StrictMode>
);
