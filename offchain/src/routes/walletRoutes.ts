import express from 'express';
import { protocolManager } from '../services/protocolManager';
import { SessionSignerService } from '../services/sessionSignerService';
import path from 'path';

const router = express.Router();

// Initialize session signer service
let sessionSignerService: SessionSignerService | null = null;

// Test hook: allow unit tests to inject a mocked SessionSignerService.
// This avoids hitting Supabase/env-dependent constructor in Jest.
export function __setSessionSignerServiceForTests(service: SessionSignerService | null) {
  sessionSignerService = service;
}

function getSessionSignerService(): SessionSignerService {
  if (!sessionSignerService) {
    sessionSignerService = new SessionSignerService();
  }
  return sessionSignerService;
}

// Helper to get Privy credentials config
function getPrivyConfig() {
  return {
    network: 'mainnet',
    credentials: {
      appId: process.env.PRIVY_APP_ID,
      appSecret: process.env.PRIVY_APP_SECRET,
      authPrivateKey: process.env.PRIVY_AUTH_PRIVATE_KEY,
      keyQuorumId: process.env.PRIVY_KEY_QUORUM_ID,
      apiBaseUrl: process.env.PRIVY_API_BASE_URL
    }
  };
}

/**
 * GET /api/wallets/options/:optionType
 * Provide dynamic options for n8n nodes
 * NOTE: This MUST come before /:userId/:chainType to avoid route conflicts
 */
router.get('/options/:optionType', async (req, res) => {
  try {
    const { optionType } = req.params;
    
    console.log(`🔧 Fetching options for type: ${optionType}`);
    
    switch (optionType) {
      case 'chains':
        res.json({
          success: true,
          options: [
            { name: 'Solana', value: 'solana' },
            { name: 'Ethereum', value: 'ethereum' },
            { name: 'Base', value: 'base' },
            { name: 'Polygon', value: 'polygon' }
          ]
        });
        break;
        
      case 'allowedPrograms':
        res.json({
          success: true,
          options: [
            { name: 'Jupiter Aggregator', value: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB' },
            { name: 'Raydium AMM', value: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8' },
            { name: 'Orca Whirlpool', value: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc' },
            { name: 'Serum DEX', value: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin' }
          ]
        });
        break;
        
      case 'policyTemplates':
        res.json({
          success: true,
          options: [
            {
              name: 'Conservative (24h, 1 SOL max)',
              value: 'conservative',
              config: {
                ttl: 86400,
                maxAmount: '1000000000',
                dailyLimit: '5000000000',
                requiresQuorum: false
              }
            },
            {
              name: 'Moderate (7 days, 10 SOL max)',
              value: 'moderate',
              config: {
                ttl: 604800,
                maxAmount: '10000000000',
                dailyLimit: '50000000000',
                requiresQuorum: false
              }
            },
            {
              name: 'High-Value (1h, 100 SOL, requires quorum)',
              value: 'high-value',
              config: {
                ttl: 3600,
                maxAmount: '100000000000',
                dailyLimit: '500000000000',
                requiresQuorum: true
              }
            }
          ]
        });
        break;
        
      default:
        res.status(404).json({ 
          success: false,
          error: `Unknown option type: ${optionType}` 
        });
    }
  } catch (error) {
    console.error('Error fetching options:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});


/**
 * GET /api/wallets/auth
 * Serve Privy authentication page for Chrome extension (Vite build)
 * NOTE: This MUST come before /:userId/:chainType to avoid route conflicts
 */
router.get('/auth', (req, res) => {
  try {
    console.log('🔐 Serving Privy auth page from Vite build...');
    
    // Serve the built index.html from auth-frontend/dist
    const authHtmlPath = path.join(__dirname, '../../../auth-frontend/dist/index.html');
    res.sendFile(authHtmlPath);
  } catch (error) {
    console.error('Error serving auth page:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve authentication page'
    });
  }
});

/**
 * GET /api/wallets/auth/assets/*
 * Serve static assets from auth-frontend build
 */
router.get('/auth/assets/*', (req, res) => {
  const assetPath = req.path.replace('/api/wallets/auth/assets/', '');
  const fullPath = path.join(__dirname, '../../../auth-frontend/dist/assets/', assetPath);
  res.sendFile(fullPath);
});

// Legacy inline HTML version (fallback)
router.get('/auth-inline', (req, res) => {
  try {
    console.log('🔐 Serving inline Privy auth page (fallback)...');
    const extensionId = req.query.extension_id || 'your-extension-id';
    const authHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connect Wallet - Lucid L2™</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: #e2e8f0;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .container {
            max-width: 400px;
            width: 100%;
            text-align: center;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 20px;
            color: #6366f1;
        }
        .description {
            margin-bottom: 30px;
            line-height: 1.5;
        }
        .privy-container {
            margin: 20px 0;
        }
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #6366f1;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .status {
            margin-top: 20px;
            padding: 10px;
            border-radius: 8px;
            font-size: 14px;
        }
        .success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .error { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">Lucid L2™</div>
        <div class="description">
            <p>Connect your wallet to start earning mGas by processing AI thoughts.</p>
            <p>Choose from Phantom, Backpack, or other Solana wallets.</p>
        </div>

        <div id="privy-container" class="privy-container">
            <div class="loading"></div>
            <p>Loading wallet connection...</p>
        </div>

        <div id="status" class="status" style="display: none;"></div>
    </div>

    <!-- Load React and ReactDOM from CDN -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    
    <script>
        // Configuration
        const PRIVY_APP_ID = '${process.env.PRIVY_APP_ID || 'cm7kvvobw020cisjqrkr9hr2m'}';
        const EXTENSION_ID = '${extensionId}';
        
        // Function to load Privy SDK dynamically
        function loadPrivySDK() {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/@privy-io/react-auth@1.55.5/dist/index.umd.js';
                script.onload = () => {
                    console.log('✅ Privy SDK loaded');
                    resolve();
                };
                script.onerror = () => {
                    console.error('❌ Failed to load Privy SDK');
                    reject(new Error('Failed to load Privy SDK'));
                };
                document.head.appendChild(script);
            });
        }
        
        // Wait for libraries to load
        window.addEventListener('load', async function() {
            console.log('🔐 Initializing Privy from CDN...');
            
            try {
                // Check React loaded
                if (!window.React || !window.ReactDOM) {
                    throw new Error('React libraries not loaded');
                }
                console.log('✅ React and ReactDOM loaded');
                
                // Load Privy SDK
                await loadPrivySDK();
                
                // Wait a bit for Privy to initialize
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Check if Privy loaded successfully
                if (!window.Privy) {
                    throw new Error('Privy SDK not available on window object');
                }
                
                const { PrivyProvider, usePrivy, useLogin, useWallets } = window.Privy;
                const React = window.React;
                const ReactDOM = window.ReactDOM;
                
                // Auth component
                function AuthContent() {
                    const { ready, authenticated, user, logout } = usePrivy();
                    const { login } = useLogin({
                        onComplete: () => {
                            console.log('✅ Authentication complete');
                        }
                    });
                    const { wallets } = useWallets();
                    
                    React.useEffect(() => {
                        if (!ready) return;
                        
                        if (authenticated && wallets && wallets.length > 0) {
                            const evmWallet = wallets.find(w => w.walletClientType !== 'solana');
                            const solanaWallet = wallets.find(w => w.walletClientType === 'solana');
                            
                            const payload = {
                                userId: user?.id || null,
                                address: evmWallet?.address || null,
                                chainId: evmWallet?.chainId || null,
                                walletType: evmWallet?.walletClientType || null,
                                solanaAddress: solanaWallet?.address || null,
                                solanaWalletType: solanaWallet?.walletClientType || 'solana',
                                walletCount: wallets.length,
                                hasSolanaWallet: !!solanaWallet,
                                hasEvmWallet: !!evmWallet,
                                preferredWallet: solanaWallet ? 'solana' : 'evm'
                            };
                            
                            console.log('✅ Authentication successful:', payload);
                            
                            // Send to extension
                            if (window.chrome && window.chrome.runtime) {
                                chrome.runtime.sendMessage({
                                    type: 'privy_authenticated',
                                    payload: payload
                                });
                            }
                            
                            // Show success message
                            document.getElementById('privy-container').innerHTML = 
                                '<p>✅ Wallet connected successfully!</p>';
                            document.getElementById('status').textContent = 
                                'Authentication complete. You can close this tab.';
                            document.getElementById('status').className = 'status success';
                            document.getElementById('status').style.display = 'block';
                            
                            // Close tab after delay
                            setTimeout(() => {
                                try {
                                    chrome.tabs.getCurrent((tab) => {
                                        if (tab?.id) chrome.tabs.remove(tab.id);
                                    });
                                } catch {
                                    window.close();
                                }
                            }, 2000);
                        }
                    }, [ready, authenticated, user, wallets]);
                    
                    return React.createElement('div', { style: { textAlign: 'center' } },
                        !ready ? React.createElement('p', null, '🔄 Loading...') :
                        !authenticated ? React.createElement('button', {
                            onClick: login,
                            style: {
                                background: '#6366f1',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '12px 24px',
                                fontSize: '16px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                width: '100%'
                            }
                        }, 'Connect Wallet') :
                        React.createElement('p', null, '✅ Connected! Closing...')
                    );
                }
                
                // App component
                function App() {
                    return React.createElement(PrivyProvider, {
                        appId: PRIVY_APP_ID,
                        config: {
                            loginMethods: ['email', 'wallet', 'google'],
                            appearance: {
                                theme: 'dark',
                                accentColor: '#6366f1',
                                showWalletLoginFirst: true,
                                walletChainType: 'ethereum-and-solana',
                                walletList: [
                                    'phantom',
                                    'backpack',
                                    'detected_solana_wallets',
                                    'metamask',
                                    'detected_ethereum_wallets',
                                    'rainbow',
                                    'coinbase_wallet',
                                    'wallet_connect'
                                ]
                            }
                        }
                    }, React.createElement(AuthContent));
                }
                
                // Render
                const container = document.getElementById('privy-container');
                const root = ReactDOM.createRoot(container);
                root.render(React.createElement(App));
                
                console.log('✅ Privy initialized successfully');
                
            } catch (error) {
                console.error('❌ Failed to initialize Privy:', error);
                document.getElementById('privy-container').innerHTML =
                    '<p>❌ Failed to load wallet connection. Please refresh and try again.</p>';
                document.getElementById('status').textContent = 'Error: ' + error.message;
                document.getElementById('status').className = 'status error';
                document.getElementById('status').style.display = 'block';
            }
        });
    </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(authHtml);

  } catch (error) {
    console.error('Error serving auth page:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve authentication page'
    });
  }
});

/**
 * POST /api/wallets/onboard
 * Create wallet and session signer for a user
 */
router.post('/onboard', async (req, res) => {
  try {
    const { userId, chainType, policies } = req.body;
    
    if (!userId || !chainType) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: userId and chainType are required' 
      });
    }

    console.log(`📝 Onboarding user ${userId} with ${chainType} wallet...`);
    
    // Create wallet via Privy adapter
    const walletResult = await protocolManager.execute({
      protocolId: 'privy',
      operationId: 'createUser',
      parameters: { userId, chainType },
      userId,
      config: getPrivyConfig() as any
    });
    
    console.log(`🔍 Wallet result:`, JSON.stringify(walletResult, null, 2));
    
    if (!walletResult.success) {
      return res.status(400).json({ 
        success: false,
        error: walletResult.error 
      });
    }
    
    console.log(`🔍 walletResult.data:`, walletResult.data);
    const walletId = (walletResult.data as any).walletId;
    console.log(`🔍 Extracted walletId: ${walletId}`);
    
    // Add session signer with policies
    console.log(`📝 Adding session signer for wallet ${walletId}...`);
    
    const signerResult = await protocolManager.execute({
      protocolId: 'privy',
      operationId: 'addSessionSigner',
      parameters: {
        walletId: walletId,
        userId,
        ...policies
      },
      userId,
      config: getPrivyConfig() as any
    });
    
    console.log(`🔍 Signer result:`, JSON.stringify(signerResult, null, 2));
    
    if (!signerResult.success) {
      console.error(`❌ Session signer creation failed:`, signerResult.error);
      return res.status(400).json({
        success: false,
        error: `Wallet created but session signer failed: ${signerResult.error}`
      });
    }
    
    console.log(`✅ User ${userId} onboarded successfully`);
    
    res.json({
      success: true,
      wallet: walletResult.data,
      sessionSigner: signerResult.data,
      message: `Wallet and session signer created for ${userId}`
    });
    
  } catch (error) {
    console.error('Error in wallet onboarding:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * GET /api/wallets/:walletId/session-signers
 * List all session signers for a wallet
 * NOTE: Must come before /:userId/:chainType to avoid route conflicts.
 */
router.get('/:walletId/session-signers', async (req, res) => {
  try {
    const { walletId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameter: userId'
      });
    }

    console.log(`📋 Listing session signers for wallet ${walletId}...`);

    const result = await protocolManager.execute({
      protocolId: 'privy',
      operationId: 'listSessionSigners',
      parameters: { walletId },
      userId: userId as string,
      config: getPrivyConfig() as any
    });

    res.json({
      success: result.success,
      data: result.data,
      error: result.error,
      message: result.success ? 'Session signers retrieved' : 'Failed to retrieve signers'
    });

  } catch (error) {
    console.error('Error listing session signers:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/wallets/:userId/:chainType
 * Get wallet for a user
 */
router.get('/:userId/:chainType', async (req, res) => {
  try {
    const { userId, chainType } = req.params;
    
    if (!userId || !chainType) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required parameters: userId and chainType' 
      });
    }

    console.log(`🔍 Fetching wallet for user ${userId} (${chainType})...`);
    
    const result = await protocolManager.execute({
      protocolId: 'privy',
      operationId: 'getWallet',
      parameters: { userId, chainType },
      userId,
      config: getPrivyConfig() as any
    });
    
    if (!result.success) {
      return res.status(404).json({ 
        success: false,
        error: result.error || 'Wallet not found' 
      });
    }
    
    res.json({
      success: true,
      wallet: result.data,
      message: `Wallet retrieved for ${userId}`
    });
    
  } catch (error) {
    console.error('Error fetching wallet:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * POST /api/wallets/:walletId/sign-transaction
 * Sign a transaction with session signer
 */
router.post('/:walletId/sign-transaction', async (req, res) => {
  try {
    const { walletId } = req.params;
    const { userId, transaction, chainType, n8nWorkflowId, n8nExecutionId } = req.body;
    
    if (!userId || !transaction || !chainType) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: userId, transaction, and chainType are required' 
      });
    }

    console.log(`🔐 Signing transaction for wallet ${walletId} (${chainType})...`);
    
    const service = getSessionSignerService();
    
    // Check if signing is allowed based on policies
    const canSign = await service.canSign(userId, walletId, transaction);
    
    if (!canSign.allowed) {
      console.log(`❌ Transaction denied: ${canSign.reason}`);
      
      // Log denial in audit log
      if (canSign.signer) {
        await service.logTransaction({
          signerId: canSign.signer.id,
          walletId,
          userId,
          transactionType: 'sign',
          chainType,
          status: 'denied',
          denialReason: canSign.reason,
          n8nWorkflowId,
          n8nExecutionId
        });
      }
      
      return res.status(403).json({ 
        success: false,
        error: canSign.reason 
      });
    }
    
    // Determine the correct operation based on chain type
    const operationId = chainType === 'solana' 
      ? 'signAndSendSolanaTransaction' 
      : 'sendEthereumTransaction';
    
    // Execute signing operation
    const result = await protocolManager.execute({
      protocolId: 'privy',
      operationId,
      parameters: {
        walletId,
        userId,
        transaction: chainType === 'solana' ? transaction : JSON.stringify(transaction),
        n8nWorkflowId,
        n8nExecutionId
      },
      userId,
      config: getPrivyConfig() as any
    });
    
    // Update usage tracking and log transaction
    if (result.success && canSign.signer) {
      await service.updateUsage(
        canSign.signer.id,
        transaction.amount || '0'
      );
      
      const resultData = result.data as any;
      
      await service.logTransaction({
        signerId: canSign.signer.id,
        walletId,
        userId,
        transactionType: 'sign_and_send',
        chainType,
        amount: transaction.amount,
        programId: transaction.programId,
        contractAddress: transaction.to,
        transactionSignature: resultData?.signature,
        transactionHash: resultData?.hash,
        status: 'success',
        n8nWorkflowId,
        n8nExecutionId
      });
      
      console.log(`✅ Transaction signed and sent successfully`);
    }
    
    res.json({
      success: result.success,
      data: result.data,
      error: result.error,
      message: result.success ? 'Transaction signed and sent' : 'Transaction failed'
    });
    
  } catch (error) {
    console.error('Error signing transaction:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * DELETE /api/wallets/:walletId/session-signers/:signerId
 * Revoke a session signer
 */
router.delete('/:walletId/session-signers/:signerId', async (req, res) => {
  try {
    const { walletId, signerId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required field: userId' 
      });
    }

    console.log(`🚫 Revoking session signer ${signerId} for wallet ${walletId}...`);
    
    const result = await protocolManager.execute({
      protocolId: 'privy',
      operationId: 'revokeSessionSigner',
      parameters: { walletId, signerId },
      userId,
      config: getPrivyConfig() as any
    });
    
    if (result.success) {
      console.log(`✅ Session signer revoked successfully`);
    }
    
    res.json({
      success: result.success,
      data: result.data,
      error: result.error,
      message: result.success ? 'Session signer revoked' : 'Revocation failed'
    });
    
  } catch (error) {
    console.error('Error revoking session signer:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;
