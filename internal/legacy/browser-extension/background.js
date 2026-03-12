// Lucid AI — Background Service Worker
// Debug: Log when background script loads
const LUCID_DEBUG = false;
function log(...args) { if (LUCID_DEBUG) console.log('[Lucid BG]', ...args); }
function warn(...args) { if (LUCID_DEBUG) console.warn('[Lucid BG]', ...args); }

log('Background script loaded, extension ID:', chrome.runtime.id);

// ============================================
// CONFIGURATION (replaces hardcoded URL)
// ============================================
const LUCID_ENVIRONMENTS = {
  localnet: { apiUrl: 'http://localhost:3001' },
  devnet: { apiUrl: 'https://api.lucid.foundation' },
  testnet: { apiUrl: 'https://api.lucid.foundation' }
};
let currentEnv = 'testnet';

function getApiUrl() {
  return LUCID_ENVIRONMENTS[currentEnv]?.apiUrl || 'https://api.lucid.foundation';
}

// Load environment from storage
try {
  chrome.storage.local.get(['lucid_env'], (res) => {
    if (res.lucid_env && LUCID_ENVIRONMENTS[res.lucid_env]) {
      currentEnv = res.lucid_env;
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.lucid_env) {
      const newEnv = changes.lucid_env.newValue;
      if (LUCID_ENVIRONMENTS[newEnv]) currentEnv = newEnv;
    }
  });
} catch (e) {}

// ============================================
// BADGE TEXT — show mGas on toolbar icon
// ============================================
function updateBadge(mGas) {
  try {
    let badgeText = '';
    if (mGas > 0) {
      if (mGas >= 10000) badgeText = `${Math.floor(mGas / 1000)}k`;
      else if (mGas >= 1000) badgeText = `${(mGas / 1000).toFixed(1)}k`;
      else badgeText = `${mGas}`;
    }
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' }); // Indigo
    chrome.action.setBadgeTextColor({ color: '#ffffff' });
  } catch (e) {
    // setBadgeTextColor may not be available in all Chrome versions
  }
}

// ============================================
// STARTUP REWARDS FETCHING
// ============================================
const REWARD_REFRESH_INTERVAL_MINUTES = 5;

function getUserIdFromSession(session) {
  return session?.userId || session?.solanaAddress || session?.address || session?.wallet?.address;
}

async function loadRewardsFromBackend() {
  try {
    const result = await chrome.storage.local.get(['privy_session']);
    const session = result.privy_session;
    const userId = getUserIdFromSession(session);

    if (!userId) {
      log('No userId found in session, skipping reward fetch');
      return null;
    }

    log('Fetching rewards for user:', userId);

    const response = await fetch(`${getApiUrl()}/api/rewards/balance/${userId}`);
    const data = await response.json();

    if (data.success && data.rewards) {
      log('Backend rewards loaded:', data.rewards);

      const balance = {
        mGas: data.rewards.balance?.mGas || 0,
        lucid: data.rewards.balance?.lucid || 0,
        sol: 0
      };

      await chrome.storage.local.set({
        balance,
        backend_balance_timestamp: Date.now(),
        streakDays: data.rewards.streakDays || 0,
        totalThoughts: data.rewards.totalThoughts || 0
      });

      // Update toolbar badge with mGas count
      updateBadge(balance.mGas);

      // Notify popup if it's open
      chrome.runtime.sendMessage({
        type: 'rewards_updated',
        data: balance
      }).catch(() => {});

      return balance;
    } else {
      log('Backend response not successful:', data);
    }
  } catch (error) {
    warn('Error fetching rewards from backend:', error);
  }
  return null;
}

async function setupRewardRefreshAlarm() {
  await chrome.alarms.clear('rewardRefresh');
  chrome.alarms.create('rewardRefresh', {
    periodInMinutes: REWARD_REFRESH_INTERVAL_MINUTES
  });
  log(`Reward refresh alarm set for every ${REWARD_REFRESH_INTERVAL_MINUTES} minutes`);
}

// ============================================
// DAILY STREAK REMINDER
// ============================================
async function setupStreakReminderAlarm() {
  await chrome.alarms.clear('streakReminder');
  // Check once per hour if user hasn't hit daily goal
  chrome.alarms.create('streakReminder', {
    periodInMinutes: 60
  });
}

async function checkAndSendStreakReminder() {
  try {
    const data = await chrome.storage.local.get(['privy_session', 'totalThoughts', 'streakDays', 'lastStreakReminderDate']);
    const userId = getUserIdFromSession(data.privy_session);
    if (!userId) return;

    const today = new Date().toDateString();
    // Only send one reminder per day
    if (data.lastStreakReminderDate === today) return;

    const totalThoughts = data.totalThoughts || 0;
    const streakDays = data.streakDays || 0;

    // If user has a streak going but hasn't reached daily goal today
    if (streakDays > 0 && totalThoughts < 5) {
      // Only remind in the afternoon/evening (12-21 UTC)
      const hour = new Date().getUTCHours();
      if (hour >= 12 && hour <= 21) {
        await chrome.storage.local.set({ lastStreakReminderDate: today });
        // Note: chrome.notifications requires "notifications" permission
        // For now, update badge to indicate action needed
        chrome.action.setBadgeText({ text: '🔥' });
        chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
      }
    }
  } catch (e) {
    warn('Streak reminder error:', e);
  }
}

// ============================================
// ALARM HANDLERS
// ============================================
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'rewardRefresh') {
    loadRewardsFromBackend();
  }
  if (alarm.name === 'streakReminder') {
    checkAndSendStreakReminder();
  }
});

// ============================================
// LIFECYCLE EVENTS
// ============================================
chrome.runtime.onStartup.addListener(async () => {
  log('Extension startup triggered');
  await loadRewardsFromBackend();
  await setupRewardRefreshAlarm();
  await setupStreakReminderAlarm();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  log('Extension installed/updated:', details.reason);
  await loadRewardsFromBackend();
  await setupRewardRefreshAlarm();
  await setupStreakReminderAlarm();
});

// Initial load on script start
setTimeout(async () => {
  await loadRewardsFromBackend();
  await setupRewardRefreshAlarm();
  await setupStreakReminderAlarm();
}, 1000);

// ============================================
// MESSAGE HANDLERS
// ============================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'open_privy_auth') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const openerTabId = tabs?.[0]?.id;
      if (openerTabId) {
        chrome.storage.local.set({ opener_tab_id: openerTabId });
      }
      const extensionId = chrome.runtime.id;
      chrome.tabs.create({
        url: `https://www.lucid.foundation/test/auth?extension_id=${extensionId}`,
        active: true
      });
      sendResponse?.({ ok: true });
    });
    return true;
  }

  if (msg?.type === 'open_privy_logout') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const openerTabId = tabs?.[0]?.id;
      if (openerTabId) {
        chrome.storage.local.set({ opener_tab_id: openerTabId });
      }
      const extensionId = chrome.runtime.id;
      chrome.tabs.create({
        url: `https://www.lucid.foundation/test/auth?extension_id=${extensionId}&logout=1`,
        active: true
      });
      sendResponse?.({ ok: true });
    });
    return true;
  }

  if (msg?.type === 'chatgpt_message') {
    log('chatgpt_message received:', msg.data?.messageType, 'platform:', msg.data?.platform);

    chrome.storage.local.get(['privy_session'], async (result) => {
      const session = result.privy_session;
      const userId = getUserIdFromSession(session);

      if (!userId) {
        log('No userId found, skipping reward processing');
        sendResponse?.({ ok: false, error: 'Not authenticated' });
        return;
      }

      try {
        const response = await fetch(`${getApiUrl()}/api/rewards/process-conversation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            messageType: msg.data?.messageType || 'user',
            content: msg.data?.content || '',
            platform: msg.data?.platform || 'ChatGPT',
            inputTokens: msg.data?.inputTokens,
            outputTokens: msg.data?.outputTokens
          })
        });

        const data = await response.json();
        log('Reward processing result:', data);

        if (data.success) {
          if (data.balance) {
            chrome.storage.local.set({ balance: data.balance }, () => {
              log('Balance stored:', data.balance);
            });
            // Update badge
            updateBadge(data.balance.mGas || 0);
          }

          if (data.earned > 0) {
            // Notify popup
            chrome.runtime.sendMessage({
              type: 'rewards_updated',
              data: data.balance
            }).catch(() => {});

            // Send earning toast to the content script tab
            if (sender?.tab?.id) {
              chrome.tabs.sendMessage(sender.tab.id, {
                type: 'show_earning_toast',
                mGasEarned: data.earned,
                platform: msg.data?.platform || 'ChatGPT'
              }).catch(() => {});
            }
          }
        }

        sendResponse?.({ ok: true, data });
      } catch (err) {
        warn('Error processing conversation:', err);
        sendResponse?.({ ok: false, error: err.message });
      }
    });

    return true;
  }

  if (msg?.type === 'lucid_run') {
    try {
      log('lucid_run received. text length:', (msg.payload?.text || '').length);
      fetch(`${getApiUrl()}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: msg.payload?.text,
          wallet: msg.payload?.wallet || 'test-wallet'
        })
      })
        .then(async (r) => {
          const data = await r.json().catch(() => null);
          sendResponse?.({ ok: r.ok, status: r.status, data });
        })
        .catch((err) => {
          warn('lucid_run fetch error:', err);
          sendResponse?.({ ok: false, error: err?.message || String(err) });
        });
    } catch (e) {
      warn('lucid_run exception:', e);
      sendResponse?.({ ok: false, error: e?.message || String(e) });
    }
    return true;
  }
});

// ============================================
// EXTERNAL MESSAGE HANDLER (from auth page)
// ============================================
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  log('External message received:', msg?.type, 'from:', sender?.url);

  if (msg?.type === 'privy_authenticated' || msg?.type === 'privy_logged_out') {
    if (msg.type === 'privy_authenticated') {
      chrome.storage.local.set({ privy_session: msg.payload }, async () => {
        log('Privy session stored');
        await loadRewardsFromBackend();
      });
    } else if (msg.type === 'privy_logged_out') {
      chrome.storage.local.remove('privy_session', () => {
        log('Privy session cleared');
        updateBadge(0);
      });
    }

    if (sendResponse) sendResponse({ success: true, received: true });

    // Broadcast internally so popup receives the message
    chrome.runtime.sendMessage(msg).catch(() => {});

    return true;
  }
  return false;
});

// Listen for balance changes to update badge
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.balance) {
    const newBalance = changes.balance.newValue;
    if (newBalance?.mGas !== undefined) {
      updateBadge(newBalance.mGas);
    }
  }
});