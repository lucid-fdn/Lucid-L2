(() => {
  console.log('✅ Lucid L2 ChatGPT Capture initialized (background mode)');
  console.log('🔍 Current URL:', window.location.href);
  console.log('🔍 Document ready state:', document.readyState);

  // Check if we're on ChatGPT
  const isChatGPT = window.location.hostname.includes('chatgpt.com') || 
                    window.location.hostname.includes('chat.openai.com');
  
  if (!isChatGPT) {
    console.log('⚠️ Not on ChatGPT domain, skipping capture');
    return;
  }

  // ChatGPT conversation capture - runs silently in background
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

  // Lucid L2 API Configuration  
  const LUCID_API_BASE = 'https://api.lucid.foundation';
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

  let userAgent = null;
  let lastProcessedMessageKey = null;

  // Initialize user agent for Lucid L2 system
  async function initializeUserAgent(walletAddress) {
    if (!walletAddress) return;
    
    userAgent = {
      agentId: `chatgpt-user-${walletAddress.slice(-8)}`,
      name: `ChatGPT User ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
      walletAddress: walletAddress
    };
    
    console.log('✅ Lucid L2 user agent initialized:', userAgent);
  }

  // Process new messages through Lucid L2 inference
  async function processMessageThroughLucid(message) {
    if (!userAgent || !message.content) return;

    return new Promise((resolve) => {
      try {
        console.log('➡️ Sending message to Lucid backend via background', { 
          len: (message.content || '').length, 
          wallet: userAgent.walletAddress 
        });
      } catch (_) {}
      
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
            console.warn('❌ Failed to process through Lucid L2:', chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          
          console.log('⬅️ Background response:', resp);
          if (resp?.ok) {
            const result = resp.data;
            console.log('✅ Processed through Lucid L2:', result);
            
            // Update session stats with Lucid data
            if (result?.gasUsed) {
              sessionStats.mGasEarned += result.gasUsed.mGas || 0;
              sessionStats.lucidTokensEarned = Math.floor(sessionStats.mGasEarned / 100);
            }
            
            // Save stats to storage
            chrome.storage.local.set({ 
              chatgpt_session_stats: sessionStats,
              last_chatgpt_capture: Date.now()
            });
            
            resolve(result);
          } else {
            console.warn('❌ Lucid L2 backend error:', resp?.status, resp?.error || resp?.data);
            resolve(null);
          }
        }
      );
    });
  }

  // Token counting and point conversion
  function estimateTokens(text) {
    const chars = text.length;
    return Math.ceil(chars / 4);
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
      if (msg.type === 'user') {
        inputTokens += tokens;
      } else if (msg.type === 'assistant') {
        outputTokens += tokens;
      }
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

    // Save to storage and check for achievements
    chrome.storage.local.get(['totalLifetimePoints'], (result) => {
      const previousLifetime = result.totalLifetimePoints || 0;
      const newLifetimePoints = previousLifetime + points.totalPoints;
      
      chrome.storage.local.set({ 
        chatgpt_session_stats: sessionStats,
        totalLifetimePoints: newLifetimePoints,
        conversationHistory: conversationHistory
      });

      // Check for achievements
      checkAchievements(previousLifetime, newLifetimePoints, messageCount);
    });
  }

  function checkAchievements(oldPoints, newPoints, messageCount) {
    const achievements = [
      { threshold: 10, message: "🌟 First Steps! You've earned 10 points!", emoji: "🌟" },
      { threshold: 50, message: "🔥 Getting Warmed Up! 50 points earned!", emoji: "🔥" },
      { threshold: 100, message: "💎 Century Club! 100 points milestone!", emoji: "💎" },
      { threshold: 250, message: "🚀 Rising Star! 250 points achieved!", emoji: "🚀" },
      { threshold: 500, message: "⚡ Power User! 500 points unlocked!", emoji: "⚡" },
      { threshold: 1000, message: "👑 Elite Status! 1000+ points!", emoji: "👑" }
    ];

    achievements.forEach(achievement => {
      if (oldPoints < achievement.threshold && newPoints >= achievement.threshold) {
        // Store achievement notification for popup
        chrome.storage.local.get(['pendingAchievements'], (result) => {
          const pending = result.pendingAchievements || [];
          pending.push(achievement);
          chrome.storage.local.set({ pendingAchievements: pending });
        });
        
        console.log('🏆 Achievement unlocked:', achievement.message);
      }
    });

    // Message milestones
    if (messageCount === 10 || messageCount === 25) {
      const milestone = messageCount === 10 
        ? { message: "💬 Chatty! 10 messages in this session!", emoji: "💬" }
        : { message: "🗣️ Conversationalist! 25 messages!", emoji: "🗣️" };
      
      chrome.storage.local.get(['pendingAchievements'], (result) => {
        const pending = result.pendingAchievements || [];
        pending.push(milestone);
        chrome.storage.local.set({ pendingAchievements: pending });
      });
    }
  }

  function getAllMessages() {
    const messages = [];
    
    // Try multiple selectors for different ChatGPT versions
    const selectors = [
      "div[data-message-author-role]",  // Original selector
      "article[data-testid^='conversation-turn']",  // Newer ChatGPT format
      ".min-h-\\[20px\\]",  // Another possible selector
      "[class*='markdown']"  // Fallback to markdown content
    ];
    
    let foundElements = [];
    for (const selector of selectors) {
      foundElements = document.querySelectorAll(selector);
      if (foundElements.length > 0) {
        console.log(`✅ Found ${foundElements.length} messages using selector: ${selector}`);
        break;
      }
    }
    
    if (foundElements.length === 0) {
      console.warn('⚠️ No messages found with any selector');
      return messages;
    }
    
    foundElements.forEach((el, index) => {
      // Try to determine role from various attributes
      let role = el.getAttribute("data-message-author-role");
      
      if (!role) {
        // Check data-testid
        const testId = el.getAttribute("data-testid");
        if (testId) {
          role = testId.includes("user") ? "user" : "assistant";
        }
      }
      
      if (!role) {
        // Alternate between user and assistant based on index
        role = index % 2 === 0 ? "user" : "assistant";
      }
      
      const text = el.innerText.trim();
      if (text && text.length > 0) {
        messages.push({ 
          type: role, 
          content: text, 
          timestamp: new Date().toISOString(),
          id: `${role}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
        });
      }
    });
    
    console.log(`📊 Captured ${messages.length} messages`);
    return messages;
  }

  function startConversationCapture() {
    console.log('✅ Starting ChatGPT conversation capture (background mode)...');
    
    let updateTimeout;
    messageObserver = new MutationObserver((mutations) => {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        try {
          const messages = getAllMessages();
          if (messages.length > 0) {
            conversationHistory = messages;
            updateTokenStats();

            // Send the latest message to the offchain backend once per unique content
            const latest = messages[messages.length - 1];
            const key = latest ? `${latest.type}:${latest.content.substring(0, 100)}` : null;
            if (latest && key !== lastProcessedMessageKey) {
              lastProcessedMessageKey = key;
              console.log(`📤 Processing new ${latest.type} message (${latest.content.length} chars)`);
              processMessageThroughLucid(latest);
              
              // Also send to reward system
              chrome.runtime.sendMessage({
                type: 'chatgpt_message',
                data: {
                  messageType: latest.type,
                  content: latest.content,
                  inputTokens: estimateTokens(latest.content),
                  outputTokens: latest.type === 'assistant' ? estimateTokens(latest.content) : 0
                }
              }).catch(err => console.log('⚠️ Could not send to reward system:', err.message));
              
              // IMPORTANT: If we just captured an assistant message, also send the user message that triggered it
              // Backend only awards mGas for 'user' messages, not 'assistant' messages
              if (latest.type === 'assistant' && messages.length >= 2) {
                const userMessage = messages[messages.length - 2];
                if (userMessage && userMessage.type === 'user') {
                  console.log(`📤 Also sending user message for rewards (${userMessage.content.length} chars)`);
                  chrome.runtime.sendMessage({
                    type: 'chatgpt_message',
                    data: {
                      messageType: 'user',
                      content: userMessage.content,
                      inputTokens: estimateTokens(userMessage.content),
                      outputTokens: 0
                    }
                  }).catch(err => console.log('⚠️ Could not send user message to reward system:', err.message));
                }
              }
            }

            console.log(`✅ Captured ${messages.length} messages (background mode)`);
          } else {
            console.log('⚠️ No messages found in this update');
          }
        } catch (error) {
          console.error('❌ Error in message capture:', error);
        }
      }, 500);
    });

    function startObserving() {
      // Try multiple container selectors
      const containerSelectors = ["main", "#__next", "[role='main']", "body"];
      let chatContainer = null;
      
      for (const selector of containerSelectors) {
        chatContainer = document.querySelector(selector);
        if (chatContainer) {
          console.log(`✅ Found chat container using: ${selector}`);
          break;
        }
      }
      
      if (chatContainer) {
        try {
          messageObserver.observe(chatContainer, { 
            childList: true, 
            subtree: true,
            attributes: false,
            characterData: false
          });
          console.log("✅ ChatGPT conversation capture is active (background mode)");
          console.log(`🔍 Observing: ${chatContainer.tagName}`);
          
          // Initial capture
          setTimeout(() => {
            try {
              const initialMessages = getAllMessages();
              if (initialMessages.length > 0) {
                conversationHistory = initialMessages;
                updateTokenStats();

                const latest = initialMessages[initialMessages.length - 1];
                const key = latest ? `${latest.type}:${latest.content.substring(0, 100)}` : null;
                if (latest && key !== lastProcessedMessageKey) {
                  lastProcessedMessageKey = key;
                  console.log(`📤 Processing initial ${latest.type} message`);
                  processMessageThroughLucid(latest);
                }

                console.log(`✅ Initial capture: ${initialMessages.length} messages`);
              } else {
                console.log('ℹ️ No messages found yet, will capture when they appear');
              }
            } catch (error) {
              console.error('❌ Error in initial capture:', error);
            }
          }, 1000);
        } catch (error) {
          console.error('❌ Error setting up observer:', error);
        }
      } else {
        console.warn("⏳ Waiting for chat container...");
        setTimeout(startObserving, 2000);
      }
    }

    startObserving();
  }

  // Start capturing when page is fully loaded
  if (document.readyState === 'complete') {
    setTimeout(startConversationCapture, 1000);
  } else {
    window.addEventListener('load', () => {
      setTimeout(startConversationCapture, 1000);
    });
  }

  // Listen for wallet connection to initialize user agent
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'privy_authenticated') {
      const walletAddress = msg.payload.solanaAddress || msg.payload.address;
      if (walletAddress && !userAgent) {
        initializeUserAgent(walletAddress);
      }
    }
  });

  // Check for existing wallet connection
  chrome.storage.local.get(['privy_session'], (result) => {
    if (result.privy_session) {
      const walletAddress = result.privy_session.solanaAddress || result.privy_session.address;
      if (walletAddress) {
        initializeUserAgent(walletAddress);
      }
    }
  });
})();
