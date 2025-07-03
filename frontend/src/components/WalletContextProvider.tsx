'use client';

import React, { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

interface Props {
  children: ReactNode;
}

export const WalletContextProvider: FC<Props> = ({ children }) => {
  // The network can be set to 'devnet', 'testnet', or 'mainnet-beta'.
  // For local development, we'll use localhost
  const network = WalletAdapterNetwork.Devnet;

  // You can also provide a custom RPC endpoint.
  const endpoint = useMemo(() => {
    if (process.env.NODE_ENV === 'development') {
      // Use WSL IP address so Windows browser can reach the Solana test validator
      return 'http://172.28.35.139:8899'; // Local test validator via WSL IP
    }
    return clusterApiUrl(network);
  }, [network]);

  const wallets = useMemo(() => {
    const walletAdapters = [];
    
    // Only add wallets that are available to avoid duplicates
    try {
      walletAdapters.push(new PhantomWalletAdapter());
    } catch (error) {
      console.warn('PhantomWalletAdapter not available:', error);
    }
    
    try {
      walletAdapters.push(new SolflareWalletAdapter());
    } catch (error) {
      console.warn('SolflareWalletAdapter not available:', error);
    }
    
    return walletAdapters;
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
