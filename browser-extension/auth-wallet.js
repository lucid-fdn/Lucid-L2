// Privy-based wallet connection for browser extension
let connecting = false;

function setStatus(message, type = 'loading') {
  const statusDiv = document.getElementById('status');
  statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
}

function setButtonsDisabled(disabled) {
  document.querySelectorAll('.wallet-option').forEach(btn => {
    btn.disabled = disabled;
  });
}

// Use Privy for proper extension-to-extension communication
async function connectWithPrivy() {
  if (connecting) return;
  connecting = true;
  setButtonsDisabled(true);
  setStatus('🔗 Opening Privy wallet connection...', 'loading');

  try {
    // Create React root element for Privy
    setStatus('📦 Setting up Privy environment...', 'loading');
    setupPrivyEnvironment();
    
    // Load the working Privy bundle (built version)
    setStatus('📦 Loading Privy SDK...', 'loading');
    await loadPrivyBundle();
    
    setStatus('🚀 Privy loaded! Initializing React...', 'loading');
    
    // Wait a moment for Privy to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setStatus('✅ Privy should be ready! Check for wallet popup...', 'success');
    
  } catch (error) {
    setStatus('❌ Failed to connect: ' + error.message, 'error');
    setButtonsDisabled(false);
    connecting = false;
  }
}

function setupPrivyEnvironment() {
  // Create the root element that Privy React app expects
  const existingRoot = document.getElementById('lucid-privy-root');
  if (!existingRoot) {
    const rootDiv = document.createElement('div');
    rootDiv.id = 'lucid-privy-root';
    rootDiv.style.position = 'absolute';
    rootDiv.style.top = '0';
    rootDiv.style.left = '0';
    rootDiv.style.width = '100%';
    rootDiv.style.height = '100%';
    rootDiv.style.zIndex = '9999';
    document.body.appendChild(rootDiv);
  }
}

async function loadPrivyBundle() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './dist/auth.js';
    script.onload = () => {
      setStatus('✅ Privy bundle loaded successfully', 'success');
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load Privy bundle'));
    };
    document.head.appendChild(script);
  });
}

// Inject wallet connection into active tab (where window.solana exists)
async function connectPhantomDirect() {
  if (connecting) return;
  connecting = true;
  setButtonsDisabled(true);
  setStatus('🔍 Finding active tab for wallet connection...', 'loading');

  try {
    // Prefer the tab that initiated the auth popup (captured in background.js)
    const { opener_tab_id } = await chrome.storage.local.get(['opener_tab_id']);

    // Fallback to currently active tab if opener not captured
    let targetTabId = opener_tab_id;
    if (!targetTabId) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs.length) {
        throw new Error('No active tab found');
      }
      targetTabId = tabs[0].id;
    }

    setStatus('🔗 Injecting wallet connection into active tab...', 'loading');

    // Inject wallet connection script into active tab
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      world: 'MAIN', // run in the page's main world to access window.solana
      func: async () => {
        try {
          const provider = (window.phantom && window.phantom.solana) ? window.phantom.solana : window.solana;
          if (!provider || !provider.isPhantom) {
            return { success: false, error: 'Phantom wallet not found on this page. Open an https page where Phantom injects and try again.' };
          }

          const response = await provider.connect();
          return { 
            success: true, 
            publicKey: response.publicKey.toString() 
          };
        } catch (error) {
          return { success: false, error: error?.message || String(error) };
        }
      }
    });

    // Clear opener tab id after use
    try { chrome.storage.local.remove('opener_tab_id'); } catch {}

    const result = results[0].result;
    if (!result.success) {
      throw new Error(result.error);
    }

    setStatus('✅ Connected to Phantom!', 'success');

    const payload = {
      userId: 'phantom_' + Date.now(),
      solanaAddress: result.publicKey,
      address: null,
      walletType: 'phantom',
      solanaWalletType: 'phantom',
      preferredWallet: 'solana',
      hasSolanaWallet: true,
      hasEvmWallet: false,
      walletCount: 1
    };

    chrome.storage.local.set({ privy_session: payload }, () => {
      chrome.runtime.sendMessage({ type: 'privy_authenticated', payload }, () => {
        setStatus('🎉 Wallet connected! Closing...', 'success');
        setTimeout(() => window.close(), 2000);
      });
    });

  } catch (error) {
    setStatus('❌ Failed to connect: ' + error.message, 'error');
    setButtonsDisabled(false);
    connecting = false;
  }
}

async function connectSolflare() {
  if (connecting) return;
  connecting = true;
  setButtonsDisabled(true);
  setStatus('🔍 Looking for Solflare wallet...', 'loading');

  try {
    if (!window.solflare) {
      throw new Error('Solflare wallet not found. Please install Solflare wallet extension.');
    }

    setStatus('🔗 Connecting to Solflare...', 'loading');
    
    const response = await window.solflare.connect();
    const publicKey = response.publicKey.toString();
    
    setStatus('✅ Connected to Solflare!', 'success');

    const payload = {
      userId: 'solflare_' + Date.now(),
      solanaAddress: publicKey,
      address: null,
      walletType: 'solflare',
      solanaWalletType: 'solflare',
      preferredWallet: 'solana',
      hasSolanaWallet: true,
      hasEvmWallet: false,
      walletCount: 1
    };

    chrome.storage.local.set({ privy_session: payload }, () => {
      chrome.runtime.sendMessage({ type: 'privy_authenticated', payload }, () => {
        setStatus('🎉 Wallet connected! Closing...', 'success');
        setTimeout(() => window.close(), 2000);
      });
    });

  } catch (error) {
    setStatus('❌ Failed to connect: ' + error.message, 'error');
    setButtonsDisabled(false);
    connecting = false;
  }
}

async function connectBackpack() {
  if (connecting) return;
  connecting = true;
  setButtonsDisabled(true);
  setStatus('🔍 Looking for Backpack wallet...', 'loading');

  try {
    if (!window.backpack) {
      throw new Error('Backpack wallet not found. Please install Backpack wallet extension.');
    }

    setStatus('🔗 Connecting to Backpack...', 'loading');
    
    const response = await window.backpack.connect();
    const publicKey = response.publicKey.toString();
    
    setStatus('✅ Connected to Backpack!', 'success');

    const payload = {
      userId: 'backpack_' + Date.now(),
      solanaAddress: publicKey,
      address: null,
      walletType: 'backpack',
      solanaWalletType: 'backpack',
      preferredWallet: 'solana',
      hasSolanaWallet: true,
      hasEvmWallet: false,
      walletCount: 1
    };

    chrome.storage.local.set({ privy_session: payload }, () => {
      chrome.runtime.sendMessage({ type: 'privy_authenticated', payload }, () => {
        setStatus('🎉 Wallet connected! Closing...', 'success');
        setTimeout(() => window.close(), 2000);
      });
    });

  } catch (error) {
    setStatus('❌ Failed to connect: ' + error.message, 'error');
    setButtonsDisabled(false);
    connecting = false;
  }
}

// Set up event listeners after DOM loads
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('privyBtn').addEventListener('click', connectWithPrivy);
  document.getElementById('phantomBtn').addEventListener('click', connectPhantomDirect);
  document.getElementById('solflareBtn').addEventListener('click', connectSolflare);
  document.getElementById('backpackBtn').addEventListener('click', connectBackpack);
  
  setStatus('🔍 Click a wallet to connect to Solana devnet', 'loading');
});
