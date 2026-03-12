import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useState } from 'react';
import { storage } from './storage-manager';
import config from './config';

interface Balance {
  mGas: number;
  lucid: number;
  sol: number;
}

interface DailyProgress {
  completed: number;
  total: number;
}

function App() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const [balance, setBalance] = useState<Balance>({ mGas: 0, lucid: 0, sol: 0 });
  const [dailyProgress, setDailyProgress] = useState<DailyProgress>({ completed: 0, total: 10 });
  const [streak, setStreak] = useState(0);

  // Load data from storage
  useEffect(() => {
    const loadData = async () => {
      const storedBalance = await storage.get('balance');
      const storedProgress = await storage.get('dailyProgress');
      const storedStreak = await storage.get('streak');
      
      setBalance(storedBalance);
      setDailyProgress(storedProgress);
      setStreak(storedStreak);
    };

    loadData();
  }, []);

  // Save wallet info when connected
  useEffect(() => {
    if (authenticated && user?.wallet) {
      storage.set('wallet', {
        address: user.wallet.address,
        publicKey: user.wallet.address,
      });
    }
  }, [authenticated, user]);

  if (!ready) {
    return (
      <div style={styles.container}>
        <div style={styles.loader}>Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Lucid Extension</h1>
          <p style={styles.subtitle}>Earn mGas by interacting with AI</p>
        </div>
        <button style={styles.button} onClick={login}>
          Connect Wallet
        </button>
        <div style={styles.footer}>
          <p style={styles.network}>Network: {config.network}</p>
        </div>
      </div>
    );
  }

  const walletAddress = user?.wallet?.address || 'No wallet';
  const shortAddress = walletAddress.length > 10 
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : walletAddress;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Lucid Extension</h1>
        <p style={styles.wallet}>{shortAddress}</p>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Balance</h2>
        <div style={styles.balanceGrid}>
          <div style={styles.balanceItem}>
            <span style={styles.balanceLabel}>mGas</span>
            <span style={styles.balanceValue}>{balance.mGas.toFixed(2)}</span>
          </div>
          <div style={styles.balanceItem}>
            <span style={styles.balanceLabel}>$LUCID</span>
            <span style={styles.balanceValue}>{balance.lucid.toFixed(2)}</span>
          </div>
          <div style={styles.balanceItem}>
            <span style={styles.balanceLabel}>SOL</span>
            <span style={styles.balanceValue}>{balance.sol.toFixed(4)}</span>
          </div>
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Daily Progress</h2>
        <div style={styles.progress}>
          <div style={styles.progressBar}>
            <div 
              style={{
                ...styles.progressFill,
                width: `${(dailyProgress.completed / dailyProgress.total) * 100}%`
              }}
            />
          </div>
          <p style={styles.progressText}>
            {dailyProgress.completed} / {dailyProgress.total} thoughts processed
          </p>
        </div>
        <p style={styles.streak}>🔥 {streak} day streak</p>
      </div>

      <div style={styles.section}>
        <p style={styles.info}>
          Visit ChatGPT to start earning mGas tokens by having conversations!
        </p>
      </div>

      <button style={styles.logoutButton} onClick={logout}>
        Disconnect
      </button>

      <div style={styles.footer}>
        <p style={styles.network}>Network: {config.network}</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    width: '400px',
    minHeight: '500px',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    backgroundColor: '#f7f9fc',
  } as React.CSSProperties,
  header: {
    textAlign: 'center' as const,
    marginBottom: '20px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '0 0 8px 0',
    color: '#1a1a1a',
  } as React.CSSProperties,
  subtitle: {
    fontSize: '14px',
    color: '#666',
    margin: 0,
  } as React.CSSProperties,
  wallet: {
    fontSize: '12px',
    color: '#666',
    margin: '4px 0 0 0',
    fontFamily: 'monospace',
  } as React.CSSProperties,
  section: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 12px 0',
    color: '#1a1a1a',
  } as React.CSSProperties,
  balanceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  } as React.CSSProperties,
  balanceItem: {
    textAlign: 'center' as const,
  } as React.CSSProperties,
  balanceLabel: {
    display: 'block',
    fontSize: '12px',
    color: '#666',
    marginBottom: '4px',
  } as React.CSSProperties,
  balanceValue: {
    display: 'block',
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1a1a1a',
  } as React.CSSProperties,
  progress: {
    marginBottom: '8px',
  } as React.CSSProperties,
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e0e0e0',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '8px',
  } as React.CSSProperties,
  progressFill: {
    height: '100%',
    backgroundColor: '#667eea',
    transition: 'width 0.3s ease',
  } as React.CSSProperties,
  progressText: {
    fontSize: '14px',
    color: '#666',
    margin: 0,
  } as React.CSSProperties,
  streak: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1a1a1a',
    margin: '8px 0 0 0',
  } as React.CSSProperties,
  info: {
    fontSize: '14px',
    color: '#666',
    margin: 0,
    lineHeight: '1.5',
  } as React.CSSProperties,
  button: {
    width: '100%',
    padding: '12px',
    fontSize: '16px',
    fontWeight: '600',
    color: 'white',
    backgroundColor: '#667eea',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  logoutButton: {
    width: '100%',
    padding: '10px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#666',
    backgroundColor: 'white',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginTop: '12px',
  } as React.CSSProperties,
  footer: {
    marginTop: '16px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  network: {
    fontSize: '12px',
    color: '#999',
    margin: 0,
  } as React.CSSProperties,
  loader: {
    textAlign: 'center' as const,
    padding: '40px',
    color: '#666',
  } as React.CSSProperties,
};

export default App;
