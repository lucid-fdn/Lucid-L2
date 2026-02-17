// Lucid AI — Multi-Platform AI Conversation Capture
// Supports: ChatGPT, Claude, Gemini, Perplexity, Grok, Copilot
(() => {
  // ============================================
  // DEBUG FLAG — set to false for production
  // ============================================
  const LUCID_DEBUG = false;
  function log(...args) { if (LUCID_DEBUG) console.log('[Lucid]', ...args); }
  function warn(...args) { if (LUCID_DEBUG) console.warn('[Lucid]', ...args); }

  // ============================================
  // PLATFORM ADAPTERS
  // ============================================
  const PLATFORM_ADAPTERS = {
    chatgpt: {
      name: 'ChatGPT',
      hostnames: ['chatgpt.com', 'chat.openai.com'],
      containerSelectors: ['main', '#__next', "[role='main']", 'body'],
      getMessages() {
        const messages = [];
        const selectors = [
          'div[data-message-author-role]',
          "article[data-testid^='conversation-turn']",
          '.min-h-\\[20px\\]',
          "[class*='markdown']"
        ];
        let foundElements = [];
        for (const selector of selectors) {
          foundElements = document.querySelectorAll(selector);
          if (foundElements.length > 0) break;
        }
        foundElements.forEach((el, index) => {
          let role = el.getAttribute('data-message-author-role');
          if (!role) {
            const testId = el.getAttribute('data-testid');
            if (testId) role = testId.includes('user') ? 'user' : 'assistant';
          }
          if (!role) role = index % 2 === 0 ? 'user' : 'assistant';
          const text = el.innerText.trim();
          if (text && text.length > 0) {
            messages.push({ type: role, content: text, timestamp: new Date().toISOString() });
          }
        });
        return messages;
      }
    },

    claude: {
      name: 'Claude',
      hostnames: ['claude.ai'],
      containerSelectors: ['main', '#__next', "[role='main']", 'body'],
      getMessages() {
        const messages = [];
        // Claude uses data-testid="human-turn" and data-testid="ai-turn" or similar
        const selectors = [
          '[data-testid="human-turn"]',
          '[data-testid="ai-turn"]',
          '.font-claude-message',
          '.font-user-message',
          '[class*="ConversationTurn"]',
          '[class*="Message"]'
        ];
        // Try paired selectors first
        const humanTurns = document.querySelectorAll('[data-testid="human-turn"], .font-user-message');
        const aiTurns = document.querySelectorAll('[data-testid="ai-turn"], .font-claude-message');
        if (humanTurns.length > 0 || aiTurns.length > 0) {
          // Collect all turns with position info
          const allTurns = [];
          humanTurns.forEach(el => {
            const text = el.innerText.trim();
            if (text) allTurns.push({ type: 'user', content: text, el });
          });
          aiTurns.forEach(el => {
            const text = el.innerText.trim();
            if (text) allTurns.push({ type: 'assistant', content: text, el });
          });
          // Sort by DOM position
          allTurns.sort((a, b) => {
            const pos = a.el.compareDocumentPosition(b.el);
            return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
          });
          allTurns.forEach(t => messages.push({ type: t.type, content: t.content, timestamp: new Date().toISOString() }));
        } else {
          // Fallback: generic message containers
          const genericTurns = document.querySelectorAll('[class*="ConversationTurn"], [class*="message-row"]');
          genericTurns.forEach((el, index) => {
            const text = el.innerText.trim();
            if (text && text.length > 0) {
              messages.push({
                type: index % 2 === 0 ? 'user' : 'assistant',
                content: text,
                timestamp: new Date().toISOString()
              });
            }
          });
        }
        return messages;
      }
    },

    gemini: {
      name: 'Gemini',
      hostnames: ['gemini.google.com'],
      containerSelectors: ['main', '.conversation-container', 'body'],
      getMessages() {
        const messages = [];
        // Gemini uses query-text for user and model-response for AI
        const userMessages = document.querySelectorAll('.query-text, [data-query-text], .user-query, .query-content');
        const aiMessages = document.querySelectorAll('.model-response-text, .response-content, .markdown-main-panel');
        const allTurns = [];
        userMessages.forEach(el => {
          const text = el.innerText.trim();
          if (text) allTurns.push({ type: 'user', content: text, el });
        });
        aiMessages.forEach(el => {
          const text = el.innerText.trim();
          if (text) allTurns.push({ type: 'assistant', content: text, el });
        });
        allTurns.sort((a, b) => {
          const pos = a.el.compareDocumentPosition(b.el);
          return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });
        allTurns.forEach(t => messages.push({ type: t.type, content: t.content, timestamp: new Date().toISOString() }));

        // Fallback
        if (messages.length === 0) {
          const turns = document.querySelectorAll('[class*="turn"], [class*="message"]');
          turns.forEach((el, index) => {
            const text = el.innerText.trim();
            if (text && text.length > 10) {
              messages.push({
                type: index % 2 === 0 ? 'user' : 'assistant',
                content: text,
                timestamp: new Date().toISOString()
              });
            }
          });
        }
        return messages;
      }
    },

    perplexity: {
      name: 'Perplexity',
      hostnames: ['perplexity.ai', 'www.perplexity.ai'],
      containerSelectors: ['main', '#__next', 'body'],
      getMessages() {
        const messages = [];
        // Perplexity uses specific query/answer structure
        const queries = document.querySelectorAll('[class*="Query"], [class*="query-text"], .prose-query');
        const answers = document.querySelectorAll('[class*="Answer"], [class*="answer-text"], .prose-answer, .prose');
        const allTurns = [];
        queries.forEach(el => {
          const text = el.innerText.trim();
          if (text) allTurns.push({ type: 'user', content: text, el });
        });
        answers.forEach(el => {
          const text = el.innerText.trim();
          if (text && text.length > 20) allTurns.push({ type: 'assistant', content: text, el });
        });
        allTurns.sort((a, b) => {
          const pos = a.el.compareDocumentPosition(b.el);
          return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });
        allTurns.forEach(t => messages.push({ type: t.type, content: t.content, timestamp: new Date().toISOString() }));
        return messages;
      }
    },

    grok: {
      name: 'Grok',
      hostnames: ['x.com', 'twitter.com'],
      pathMatch: /\/i\/grok/,
      containerSelectors: ['main', '[role="main"]', 'body'],
      getMessages() {
        const messages = [];
        // Grok messages within X/Twitter interface
        const userMsgs = document.querySelectorAll('[data-testid="grok-user-message"], [class*="userMessage"]');
        const aiMsgs = document.querySelectorAll('[data-testid="grok-ai-message"], [class*="grokMessage"], [class*="aiMessage"]');
        const allTurns = [];
        userMsgs.forEach(el => {
          const text = el.innerText.trim();
          if (text) allTurns.push({ type: 'user', content: text, el });
        });
        aiMsgs.forEach(el => {
          const text = el.innerText.trim();
          if (text) allTurns.push({ type: 'assistant', content: text, el });
        });
        allTurns.sort((a, b) => {
          const pos = a.el.compareDocumentPosition(b.el);
          return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });
        allTurns.forEach(t => messages.push({ type: t.type, content: t.content, timestamp: new Date().toISOString() }));
        return messages;
      }
    },

    copilot: {
      name: 'Copilot',
      hostnames: ['copilot.microsoft.com', 'www.bing.com'],
      pathMatch: /\/chat|\/copilot/,
      containerSelectors: ['main', '#b_content', 'body'],
      getMessages() {
        const messages = [];
        const userMsgs = document.querySelectorAll('[class*="user-message"], [class*="UserMessage"], .cib-message-text[data-content="user"]');
        const aiMsgs = document.querySelectorAll('[class*="bot-message"], [class*="BotMessage"], .cib-message-text[data-content="bot"]');
        const allTurns = [];
        userMsgs.forEach(el => {
          const text = el.innerText.trim();
          if (text) allTurns.push({ type: 'user', content: text, el });
        });
        aiMsgs.forEach(el => {
          const text = el.innerText.trim();
          if (text) allTurns.push({ type: 'assistant', content: text, el });
        });
        allTurns.sort((a, b) => {
          const pos = a.el.compareDocumentPosition(b.el);
          return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });
        allTurns.forEach(t => messages.push({ type: t.type, content: t.content, timestamp: new Date().toISOString() }));
        return messages;
      }
    }
  };

  // ============================================
  // DETECT CURRENT PLATFORM
  // ============================================
  function detectPlatform() {
    const hostname = window.location.hostname;
    const path = window.location.pathname;

    for (const [key, adapter] of Object.entries(PLATFORM_ADAPTERS)) {
      const hostnameMatch = adapter.hostnames.some(h => hostname.includes(h));
      if (hostnameMatch) {
        // Check path match if required
        if (adapter.pathMatch && !adapter.pathMatch.test(path)) continue;
        return { key, adapter };
      }
    }
    return null;
  }

  const platform = detectPlatform();
  if (!platform) {
    log('Not on a supported AI platform, skipping capture');
    return;
  }

  log(`Lucid AI Capture initialized on ${platform.adapter.name}`);

  // ============================================
  // SHARED CAPTURE ENGINE
  // ============================================
  let conversationHistory = [];
  let messageObserver = null;
  let sessionStats = {
    inputTokens: 0,
    outputTokens: 0,
    totalMessages: 0,
    pointsEarned: 0,
    mGasEarned: 0,
    lucidTokensEarned: 0
  };

  let userAgent = null;
  let lastProcessedMessageKey = null;

  // Load environment from storage
  let LUCID_ENV = 'devnet';
  try {
    chrome.storage.local.get(['lucid_env', 'lucid_network'], (res) => {
      LUCID_ENV = res.lucid_env || res.lucid_network || 'devnet';
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.lucid_env || changes.lucid_network)) {
        LUCID_ENV = (changes.lucid_env?.newValue) || (changes.lucid_network?.newValue) || LUCID_ENV;
      }
    });
  } catch (e) {}

  async function initializeUserAgent(walletAddress) {
    if (!walletAddress) return;
    userAgent = {
      agentId: `${platform.key}-user-${walletAddress.slice(-8)}`,
      name: `${platform.adapter.name} User ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
      walletAddress: walletAddress
    };
    log('User agent initialized:', userAgent);
  }

  async function processMessageThroughLucid(message) {
    if (!userAgent || !message.content) return;
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'lucid_run',
          payload: {
            text: message.content,
            wallet: userAgent.walletAddress || 'test-wallet'
          }
        },
        (resp) => {
          if (chrome.runtime.lastError) {
            warn('Failed to process through Lucid L2:', chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          if (resp?.ok) {
            const result = resp.data;
            if (result?.gasUsed) {
              sessionStats.mGasEarned += result.gasUsed.mGas || 0;
              sessionStats.lucidTokensEarned = Math.floor(sessionStats.mGasEarned / 100);
            }
            chrome.storage.local.set({
              chatgpt_session_stats: sessionStats,
              last_chatgpt_capture: Date.now()
            });
            resolve(result);
          } else {
            warn('Lucid L2 backend error:', resp?.status, resp?.error || resp?.data);
            resolve(null);
          }
        }
      );
    });
  }

  function estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  function convertTokensToPoints(inputTokens, outputTokens) {
    const INPUT_TOKEN_RATE = 0.1;
    const OUTPUT_TOKEN_RATE = 0.2;
    return {
      inputPoints: Math.round(inputTokens * INPUT_TOKEN_RATE * 10) / 10,
      outputPoints: Math.round(outputTokens * OUTPUT_TOKEN_RATE * 10) / 10,
      totalPoints: Math.round((inputTokens * INPUT_TOKEN_RATE + outputTokens * OUTPUT_TOKEN_RATE) * 10) / 10
    };
  }

  function updateTokenStats() {
    let inputTokens = 0;
    let outputTokens = 0;
    let messageCount = 0;

    conversationHistory.forEach(msg => {
      const tokens = estimateTokens(msg.content);
      if (msg.type === 'user') inputTokens += tokens;
      else if (msg.type === 'assistant') outputTokens += tokens;
      messageCount++;
    });

    const points = convertTokensToPoints(inputTokens, outputTokens);
    sessionStats = {
      inputTokens,
      outputTokens,
      totalMessages: messageCount,
      pointsEarned: points.totalPoints,
      mGasEarned: sessionStats.mGasEarned,
      lucidTokensEarned: sessionStats.lucidTokensEarned
    };

    chrome.storage.local.get(['totalLifetimePoints'], (result) => {
      const previousLifetime = result.totalLifetimePoints || 0;
      const newLifetimePoints = previousLifetime + points.totalPoints;
      chrome.storage.local.set({
        chatgpt_session_stats: sessionStats,
        totalLifetimePoints: newLifetimePoints,
        conversationHistory: conversationHistory,
        active_platform: platform.adapter.name
      });
      checkAchievements(previousLifetime, newLifetimePoints, messageCount);
    });
  }

  function checkAchievements(oldPoints, newPoints, messageCount) {
    const achievements = [
      { threshold: 10, message: "🌟 First Steps! You've earned 10 points!", emoji: '🌟' },
      { threshold: 50, message: '🔥 Getting Warmed Up! 50 points earned!', emoji: '🔥' },
      { threshold: 100, message: '💎 Century Club! 100 points milestone!', emoji: '💎' },
      { threshold: 250, message: '🚀 Rising Star! 250 points achieved!', emoji: '🚀' },
      { threshold: 500, message: '⚡ Power User! 500 points unlocked!', emoji: '⚡' },
      { threshold: 1000, message: '👑 Elite Status! 1000+ points!', emoji: '👑' }
    ];
    achievements.forEach(achievement => {
      if (oldPoints < achievement.threshold && newPoints >= achievement.threshold) {
        chrome.storage.local.get(['pendingAchievements'], (result) => {
          const pending = result.pendingAchievements || [];
          pending.push(achievement);
          chrome.storage.local.set({ pendingAchievements: pending });
        });
      }
    });
    if (messageCount === 10 || messageCount === 25) {
      const milestone = messageCount === 10
        ? { message: '💬 Chatty! 10 messages in this session!', emoji: '💬' }
        : { message: '🗣️ Conversationalist! 25 messages!', emoji: '🗣️' };
      chrome.storage.local.get(['pendingAchievements'], (result) => {
        const pending = result.pendingAchievements || [];
        pending.push(milestone);
        chrome.storage.local.set({ pendingAchievements: pending });
      });
    }
  }

  // ============================================
  // IN-PAGE EARNING TOAST NOTIFICATION
  // ============================================
  function showEarningToast(mGasEarned, platformName) {
    // Remove existing toast if any
    const existing = document.getElementById('lucid-earning-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'lucid-earning-toast';
    toast.style.cssText = `
      position: fixed !important;
      bottom: 24px !important;
      right: 24px !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      padding: 12px 20px !important;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%) !important;
      border: 1px solid rgba(99, 102, 241, 0.4) !important;
      border-radius: 12px !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(99, 102, 241, 0.15) !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      animation: lucidToastSlideIn 0.4s ease-out !important;
      pointer-events: none !important;
      color: #e2e8f0 !important;
    `;
    toast.innerHTML = `
      <div style="font-size: 24px; line-height: 1;">⚡</div>
      <div>
        <div style="font-size: 14px; font-weight: 600; color: #a78bfa;">+${mGasEarned} mGas</div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Earned on ${platformName}</div>
      </div>
    `;

    // Add animation keyframes if not already added
    if (!document.getElementById('lucid-toast-styles')) {
      const style = document.createElement('style');
      style.id = 'lucid-toast-styles';
      style.textContent = `
        @keyframes lucidToastSlideIn {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes lucidToastSlideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(120%); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      toast.style.animation = 'lucidToastSlideOut 0.3s ease-in forwards';
      setTimeout(() => toast.remove(), 350);
    }, 3000);
  }

  // ============================================
  // CONVERSATION CAPTURE LOOP
  // ============================================
  function startConversationCapture() {
    log(`Starting ${platform.adapter.name} conversation capture...`);

    let updateTimeout;
    messageObserver = new MutationObserver(() => {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        try {
          const messages = platform.adapter.getMessages();
          if (messages.length > 0) {
            conversationHistory = messages;
            updateTokenStats();

            const latest = messages[messages.length - 1];
            const key = latest ? `${latest.type}:${latest.content.substring(0, 100)}` : null;
            if (latest && key !== lastProcessedMessageKey) {
              lastProcessedMessageKey = key;
              log(`Processing new ${latest.type} message (${latest.content.length} chars)`);
              processMessageThroughLucid(latest);

              // Send to reward system via background
              chrome.runtime.sendMessage({
                type: 'chatgpt_message',
                data: {
                  messageType: latest.type,
                  content: latest.content,
                  platform: platform.adapter.name,
                  inputTokens: estimateTokens(latest.content),
                  outputTokens: latest.type === 'assistant' ? estimateTokens(latest.content) : 0
                }
              }).catch(() => {});

              // Also send the user message if we captured an assistant response
              if (latest.type === 'assistant' && messages.length >= 2) {
                const userMessage = messages[messages.length - 2];
                if (userMessage && userMessage.type === 'user') {
                  chrome.runtime.sendMessage({
                    type: 'chatgpt_message',
                    data: {
                      messageType: 'user',
                      content: userMessage.content,
                      platform: platform.adapter.name,
                      inputTokens: estimateTokens(userMessage.content),
                      outputTokens: 0
                    }
                  }).catch(() => {});
                }
              }
            }
          }
        } catch (error) {
          warn('Error in message capture:', error);
        }
      }, 500);
    });

    function startObserving() {
      let chatContainer = null;
      for (const selector of platform.adapter.containerSelectors) {
        chatContainer = document.querySelector(selector);
        if (chatContainer) break;
      }

      if (chatContainer) {
        messageObserver.observe(chatContainer, {
          childList: true,
          subtree: true,
          attributes: false,
          characterData: false
        });
        log(`Observing ${platform.adapter.name} container: ${chatContainer.tagName}`);

        // Initial capture
        setTimeout(() => {
          try {
            const initialMessages = platform.adapter.getMessages();
            if (initialMessages.length > 0) {
              conversationHistory = initialMessages;
              updateTokenStats();
              const latest = initialMessages[initialMessages.length - 1];
              const key = latest ? `${latest.type}:${latest.content.substring(0, 100)}` : null;
              if (latest && key !== lastProcessedMessageKey) {
                lastProcessedMessageKey = key;
                processMessageThroughLucid(latest);
              }
            }
          } catch (error) {
            warn('Error in initial capture:', error);
          }
        }, 1000);
      } else {
        setTimeout(startObserving, 2000);
      }
    }

    startObserving();
  }

  // Start capture on page load
  if (document.readyState === 'complete') {
    setTimeout(startConversationCapture, 1000);
  } else {
    window.addEventListener('load', () => setTimeout(startConversationCapture, 1000));
  }

  // ============================================
  // LISTEN FOR EARNING NOTIFICATIONS FROM BACKGROUND
  // ============================================
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'privy_authenticated') {
      const walletAddress = msg.payload.solanaAddress || msg.payload.address;
      if (walletAddress && !userAgent) initializeUserAgent(walletAddress);
    }
    if (msg?.type === 'show_earning_toast') {
      showEarningToast(msg.mGasEarned || 0, msg.platform || platform.adapter.name);
    }
  });

  // Check for existing wallet connection
  chrome.storage.local.get(['privy_session'], (result) => {
    if (result.privy_session) {
      const walletAddress = result.privy_session.solanaAddress || result.privy_session.address;
      if (walletAddress) initializeUserAgent(walletAddress);
    }
  });
})();