// Debug: Log when background script loads
console.log('🚀 Background script loaded, extension ID:', chrome.runtime.id);
console.log('🚀 Extension manifest version:', chrome.runtime.getManifest().manifest_version);

// ============================================
// STARTUP REWARDS FETCHING
// ============================================

const LUCID_API_BASE = 'https://api.lucid.foundation';
const REWARD_REFRESH_INTERVAL_MINUTES = 5; // Refresh every 5 minutes

// Helper: Get userId from session (same resolution as chatgpt_message handler)
function getUserIdFromSession(session) {
  return session?.userId || session?.solanaAddress || session?.address || session?.wallet?.address;
}

// Fetch rewards from backend
async function loadRewardsFromBackend() {
  try {
    const result = await chrome.storage.local.get(['privy_session']);
    const session = result.privy_session;
    const userId = getUserIdFromSession(session);
    
    if (!userId) {
      console.log('[BG] No userId found in session, skipping reward fetch');
      return;
    }
    
    console.log('📊 [BG] Fetching rewards for user:', userId);
    
    const response = await fetch(`${LUCID_API_BASE}/api/rewards/balance/${userId}`);
    const data = await response.json();
    
    if (data.success && data.rewards) {
      console.log('✅ [BG] Backend rewards loaded:', data.rewards);
      
      // Store balance in chrome.storage.local (same storage location as popup.js expects)
      const balance = {
        mGas: data.rewards.balance?.mGas || 0,
        lucid: data.rewards.balance?.lucid || 0,
        sol: 0 // SOL balance fetched separately if needed
      };
      
      await chrome.storage.local.set({ 
        balance,
        backend_balance_timestamp: Date.now(),
        streakDays: data.rewards.streakDays || 0,
        totalThoughts: data.rewards.totalThoughts || 0
      });
      
      console.log('💾 [BG] Saved backend balance to storage:', balance);
      
      // Notify popup if it's open
      chrome.runtime.sendMessage({
        type: 'rewards_updated',
        data: balance
      }).catch(() => {
        // Popup not open, that's fine
      });
      
      return balance;
    } else {
      console.log('⚠️ [BG] Backend response not successful:', data);
    }
  } catch (error) {
    console.error('❌ [BG] Error fetching rewards from backend:', error);
  }
  return null;
}

// Setup periodic reward refresh using chrome.alarms
async function setupRewardRefreshAlarm() {
  // Clear existing alarm if any
  await chrome.alarms.clear('rewardRefresh');
  
  // Create new alarm to refresh every 5 minutes
  chrome.alarms.create('rewardRefresh', {
    periodInMinutes: REWARD_REFRESH_INTERVAL_MINUTES
  });
  
  console.log(`⏰ [BG] Reward refresh alarm set for every ${REWARD_REFRESH_INTERVAL_MINUTES} minutes`);
}

// Handle alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'rewardRefresh') {
    console.log('⏰ [BG] Reward refresh alarm triggered');
    loadRewardsFromBackend();
  }
});

// On extension startup (browser starts up)
chrome.runtime.onStartup.addListener(async () => {
  console.log('🚀 [BG] Extension startup triggered');
  await loadRewardsFromBackend();
  await setupRewardRefreshAlarm();
});

// On extension installed or updated
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('📦 [BG] Extension installed/updated:', details.reason);
  await loadRewardsFromBackend();
  await setupRewardRefreshAlarm();
});

// Also load rewards when background script first loads (for development/reload scenarios)
setTimeout(async () => {
  console.log('🔄 [BG] Initial rewards fetch on script load');
  await loadRewardsFromBackend();
  await setupRewardRefreshAlarm();
}, 1000);

// ============================================
// END STARTUP REWARDS FETCHING
// ============================================

// Opens the Privy auth/logout popup windows and relays results to the active tab
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'open_privy_auth') {
    // Capture opener tab id
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const openerTabId = tabs?.[0]?.id;
      if (openerTabId) {
        chrome.storage.local.set({ opener_tab_id: openerTabId });
      }
      
      // Open auth page on server (https:// allows Phantom injection + SSL certificate)
      const extensionId = chrome.runtime.id;
      chrome.tabs.create({
        url: `https://www.lucid.foundation/test/auth?extension_id=${extensionId}`,
        active: true
      });

      sendResponse?.({ ok: true });
    });
    return true; // keep the message channel open for async sendResponse
  }
  if (msg?.type === 'open_privy_logout') {
    // Capture opener tab id for logout flows too
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const openerTabId = tabs?.[0]?.id;
      if (openerTabId) {
        chrome.storage.local.set({ opener_tab_id: openerTabId });
      }
      const url = chrome.runtime.getURL('auth.html') + '?logout=1';
      chrome.windows.create({ 
        url, 
        type: 'popup', 
        width: 420, 
        height: 520 
      });
      sendResponse?.({ ok: true });
    });
    return true;
  }
  if (msg?.type === 'chatgpt_message') {
    // NEW: Process ChatGPT messages through reward system
    console.log('[BG] chatgpt_message received:', msg.data?.messageType);
    
    chrome.storage.local.get(['privy_session'], async (result) => {
      // FIX: privy_session stores wallet address, not userId
      // Use solanaAddress, address, or wallet.address as the userId
      const session = result.privy_session;
      const userId = session?.userId || session?.solanaAddress || session?.address || session?.wallet?.address;
      
      console.log('[BG] privy_session:', JSON.stringify(session, null, 2));
      console.log('[BG] Resolved userId:', userId);
      
      if (!userId) {
        console.log('[BG] No userId found, skipping reward processing');
        sendResponse?.({ ok: false, error: 'Not authenticated' });
        return;
      }
      
      const LUCID_API_BASE = 'https://api.lucid.foundation';
      
      try {
        const response = await fetch(`${LUCID_API_BASE}/api/rewards/process-conversation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            messageType: msg.data?.messageType || 'user',
            content: msg.data?.content || '',
            inputTokens: msg.data?.inputTokens,
            outputTokens: msg.data?.outputTokens
          })
        });
        
        const data = await response.json();
        console.log('[BG] Reward processing result:', data);
        
        if (data.success) {
          // CRITICAL FIX: Store the balance in chrome.storage.local
          // This was missing - balance was never being persisted!
          if (data.balance) {
            chrome.storage.local.set({ balance: data.balance }, () => {
              console.log('[BG] ✅ Balance stored:', data.balance);
            });
          }
          
          if (data.earned > 0) {
            // Notify popup to refresh
            chrome.runtime.sendMessage({
              type: 'rewards_updated',
              data: data.balance
            }).catch(err => console.log('[BG] Popup not open:', err));
          }
        }
        
        sendResponse?.({ ok: true, data });
      } catch (err) {
        console.error('[BG] Error processing conversation:', err);
        sendResponse?.({ ok: false, error: err.message });
      }
    });
    
    return true; // Keep channel open for async response
  }
  if (msg?.type === 'lucid_run') {
    // Perform backend fetch from the service worker to avoid mixed-content/CORS issues
    const LUCID_API_BASE = 'https://api.lucid.foundation';
    try {
      console.log('[BG] lucid_run received. text length:', (msg.payload?.text || '').length);
      fetch(`${LUCID_API_BASE}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: msg.payload?.text,
          wallet: msg.payload?.wallet || 'test-wallet'
        })
      })
        .then(async (r) => {
          const data = await r.json().catch(() => null);
          console.log('[BG] lucid_run response status:', r.status, 'ok:', r.ok);
          // Return a normalized response to the content script
          sendResponse?.({ ok: r.ok, status: r.status, data });
        })
        .catch((err) => {
          console.error('[BG] lucid_run fetch error:', err);
          sendResponse?.({ ok: false, error: err?.message || String(err) });
        });
    } catch (e) {
      console.error('[BG] lucid_run exception:', e);
      sendResponse?.({ ok: false, error: e?.message || String(e) });
    }
    return true; // keep channel open for async sendResponse
  }
});

// Relay messages from auth page - broadcast to runtime (reaches popup)
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  console.log('📨 EXTERNAL MESSAGE RECEIVED!');
  console.log('📨 Message:', JSON.stringify(msg, null, 2));
  console.log('📨 Sender:', sender);
  console.log('📨 Sender URL:', sender?.url);
  console.log('📨 Sender ID:', sender?.id);
  console.log('📨 Sender tab:', sender?.tab);
  
  if (msg?.type === 'privy_authenticated' || msg?.type === 'privy_logged_out') {
    console.log('✅ Privy message type matched:', msg.type);
    console.log('🔄 Broadcasting message:', msg.type);
    
    // Store in chrome.storage for popup to access
    if (msg.type === 'privy_authenticated') {
      console.log('💾 Storing privy session:', JSON.stringify(msg.payload, null, 2));
      chrome.storage.local.set({ privy_session: msg.payload }, async () => {
        console.log('✅ Privy session stored in background');
        
        // Verify it was stored
        chrome.storage.local.get(['privy_session'], (result) => {
          console.log('🔍 Verified storage after save:', JSON.stringify(result, null, 2));
        });
        
        // IMPORTANT: Immediately fetch rewards after authentication
        console.log('🔄 [BG] Fetching rewards immediately after authentication...');
        await loadRewardsFromBackend();
      });
    } else if (msg.type === 'privy_logged_out') {
      console.log('🗑️ Removing privy session from storage');
      chrome.storage.local.remove('privy_session', () => {
        console.log('✅ Privy session cleared in background');
        
        // Verify it was removed
        chrome.storage.local.get(['privy_session'], (result) => {
          console.log('🔍 Verified storage after removal:', JSON.stringify(result, null, 2));
        });
      });
    }
    
    // Send response back to sender
    if (sendResponse) {
      sendResponse({ success: true, received: true });
    }
    
    // CRITICAL FIX: Broadcast internally so popup receives the message
    // External messages (onMessageExternal) don't automatically reach internal listeners (onMessage)
    chrome.runtime.sendMessage(msg).catch(err => {
      console.log('[BG] No popup listening for internal broadcast (normal if popup is closed):', err.message);
    });
    
    return true;
  } else {
    console.log('❌ Message type did not match expected types');
    console.log('❌ Expected: privy_authenticated or privy_logged_out');
    console.log('❌ Received type:', msg?.type);
    return false;
  }
});

// Also log all storage changes for debugging
chrome.storage.onChanged.addListener((changes, areaName) => {
  console.log('💾 Storage changed in', areaName);
  for (let key in changes) {
    console.log(`💾 ${key}:`, {
      oldValue: changes[key].oldValue,
      newValue: changes[key].newValue
    });
  }
});
