// Opens the Privy auth/logout popup windows and relays results to the active tab
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'open_privy_auth') {
    // Capture the opener tab id so auth.html can act on the correct page (for Phantom direct connect)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const openerTabId = tabs?.[0]?.id;
      if (openerTabId) {
        chrome.storage.local.set({ opener_tab_id: openerTabId });
      }
      chrome.windows.create({
        url: chrome.runtime.getURL('auth.html'),
        type: 'popup', 
        width: 420, 
        height: 640
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
  if (msg?.type === 'lucid_run') {
    // Perform backend fetch from the service worker to avoid mixed-content/CORS issues
    const LUCID_API_BASE = 'http://172.28.35.139:3001';
    try {
      console.log('[BG] lucid_run received. text length:', (msg.payload?.text || '').length);
      fetch(`${LUCID_API_BASE}/run`, {
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

// Relay messages from popup/auth to content script
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'privy_authenticated' || msg?.type === 'privy_logged_out') {
    console.log('🔄 Relaying message to content script:', msg.type);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, msg);
        console.log('✅ Message sent to tab:', tabs[0].id);
      } else {
        console.warn('⚠️ No active tab found to relay message');
      }
    });
  }
});
