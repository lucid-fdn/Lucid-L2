(() => {
  const SHADOW_HOST_ID = 'cwm-shadow-host';
  if (document.getElementById(SHADOW_HOST_ID)) return;

  // Inject bridge script for in-page Privy integration
  function injectBridge() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('dist/bridge.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  }
  injectBridge();

  const host = document.createElement('div');
  host.id = SHADOW_HOST_ID; 
  host.style.all='initial'; 
  host.style.position='fixed'; 
  host.style.pointerEvents='none';
  host.style.inset='0'; 
  host.style.zIndex=2147483647;
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });

  const link = document.createElement('link'); 
  link.rel='stylesheet'; 
  link.href=chrome.runtime.getURL('styles.css'); 
  root.appendChild(link);

  // Create integrated sidebar instead of modal
  const sidebar = el('div','cwm-sidebar');
  const header = el('div','cwm-header');
  const logoImg = document.createElement('img');
  logoImg.src = chrome.runtime.getURL('icons/lucid-logo.png');
  logoImg.className = 'cwm-logo';
  logoImg.alt = 'LUCID';
  
  // Remove black background dynamically
  logoImg.onload = function() {
    removeBlackBackground(logoImg);
  };
  
  const titleDiv = el('div','cwm-title');
  titleDiv.appendChild(logoImg);
  header.append(titleDiv, el('div','cwm-close','✕'));
  const body = el('div','cwm-body');
  const hintDiv = el('div','cwm-hint','Connect your wallet to get started');
  body.append(hintDiv);

  const statusBox = el('div','cwm-status'); 
  statusBox.style.display='none';
  const errorBox = el('div','cwm-error'); 
  errorBox.style.display='none';

  const actions = el('div','cwm-actions');
  const connectBtn = el('button','cwm-btn','🔗 Connect Wallet');
  const logoutBtn = el('button','cwm-btn','Disconnect'); 
  logoutBtn.style.display='none';
  actions.append(connectBtn, logoutBtn);

  sidebar.append(header, body, statusBox, errorBox, actions);
  root.append(sidebar);
  
  const launcher = el('button','cwm-launcher','💼'); 
  root.append(launcher);

  function open(){ sidebar.classList.add('open'); }
  function close(){ sidebar.classList.remove('open'); }
  launcher.addEventListener('click', open);
  header.querySelector('.cwm-close').addEventListener('click', close);

  // Load session on start
  chrome.storage.local.get(['privy_session'], ({ privy_session }) => {
    if (privy_session) paintStatus(privy_session);
  });

  // ChatGPT conversation capture - Simple and reliable approach
  let conversationHistory = [];
  let messageObserver = null;
  let totalPoints = 0;
  let sessionStats = {
    inputTokens: 0,
    outputTokens: 0,
    totalMessages: 0,
    pointsEarned: 0,
    mGasEarned: 0,
    lucidTokensEarned: 0
  };

  // Lucid L2 API Configuration
  const LUCID_API_BASE = 'http://172.28.35.139:3001';
  // Network environment used for display and routing hints in the sidebar UI.
  // Defaults to devnet but can be overridden by the popup's ConfigurationManager.
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
    
    // Simple initialization without complex agent system
    userAgent = {
      agentId: `chatgpt-user-${walletAddress.slice(-8)}`,
      name: `ChatGPT User ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
      walletAddress: walletAddress
    };
    
    console.log('✅ Lucid L2 user agent initialized (simple mode):', userAgent);
  }

  // Process new messages through Lucid L2 inference
  async function processMessageThroughLucid(message) {
    if (!userAgent || !message.content) return;

    // Route the network call through the background service worker to avoid
    // mixed-content and page CSP restrictions on https pages (e.g. chat.openai.com)
    return new Promise((resolve) => {
      // Debug log to verify we attempt to call the backend from the content script
      try {
        console.log('➡️ Sending message to Lucid backend via background', { len: (message.content || '').length, wallet: userAgent.walletAddress });
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
            console.warn('❌ Failed to process through Lucid L2 (messaging error):', chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          console.log('⬅️ Background response:', resp);
          if (resp?.ok) {
            const result = resp.data;
            console.log('✅ Processed through Lucid L2 (via background):', result);
            // Update session stats with Lucid data
            if (result?.gasUsed) {
              sessionStats.mGasEarned += result.gasUsed.mGas || 0;
              sessionStats.lucidTokensEarned = Math.floor(sessionStats.mGasEarned / 100); // 100 mGas = 1 LUCID
            }
            resolve(result);
          } else {
            console.warn('❌ Lucid L2 backend error:', resp?.status, resp?.error || resp?.data);
            resolve(null);
          }
        }
      );
    });
  }

  // Convert conversation data to Lucid format
  function convertToLucidFormat(messages) {
    return messages.map(msg => ({
      role: msg.type,
      content: msg.content,
      timestamp: msg.timestamp,
      id: msg.id,
      tokens: estimateTokens(msg.content)
    }));
  }

  // Token counting and point conversion
  function estimateTokens(text) {
    // Rough estimation: ~4 characters per token for English text
    // More accurate for ChatGPT context
    const chars = text.length;
    return Math.ceil(chars / 4);
  }

  function convertTokensToPoints(inputTokens, outputTokens) {
    // Point conversion rates (you can adjust these)
    const INPUT_TOKEN_RATE = 0.1;  // 0.1 points per input token
    const OUTPUT_TOKEN_RATE = 0.2; // 0.2 points per output token (higher value for responses)
    
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
      pointsEarned: points.totalPoints
    };

    // Save to storage and check for achievements
    chrome.storage.local.get(['totalLifetimePoints', 'lastAchievement'], (result) => {
      const previousLifetime = result.totalLifetimePoints || 0;
      const newLifetimePoints = previousLifetime + points.totalPoints;
      
      chrome.storage.local.set({ 
        sessionStats, 
        totalLifetimePoints: newLifetimePoints 
      });

      // Check for new achievements
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
        showAchievementNotification(achievement);
      }
    });

    // Message milestones
    if (messageCount === 10) {
      showAchievementNotification({
        message: "💬 Chatty! 10 messages in this session!",
        emoji: "💬"
      });
    } else if (messageCount === 25) {
      showAchievementNotification({
        message: "🗣️ Conversationalist! 25 messages!",
        emoji: "🗣️"
      });
    }
  }

  function showAchievementNotification(achievement) {
    // Create floating notification
    const notification = el('div', 'cwm-achievement-notification');
    notification.innerHTML = `
      <div class="cwm-achievement-icon">${achievement.emoji}</div>
      <div class="cwm-achievement-text">${achievement.message}</div>
    `;
    
    root.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Remove after 4 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 500);
    }, 4000);

    // Play a subtle sound effect (if supported)
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IAAAAABAAAgAIgAkAgEAEAAAAABkYXRhAAAAAA==');
      audio.play().catch(() => {}); // Ignore if audio fails
    } catch (e) {}
  }

  function getMotivationalMessage(points, messages) {
    const messages_motivational = [
      "Keep the conversation flowing! 💬",
      "You're earning points with every message! 🎯",
      "The more you chat, the more you earn! 💰",
      "Your AI companion is ready for more! 🤖",
      "Every question makes you stronger! 💪",
      "Unlock new achievements by chatting! 🏆",
      "Your curiosity is your superpower! ✨",
      "Ask me anything - points await! 🌟"
    ];

    if (points === 0) {
      return "Start chatting to earn your first points! 🚀";
    } else if (points < 10) {
      return "Great start! Keep asking questions! 🌱";
    } else if (points < 50) {
      return messages_motivational[Math.floor(Math.random() * messages_motivational.length)];
    } else {
      return "You're on fire! 🔥 Keep up the amazing conversation!";
    }
  }

  function getAllMessages() {
    const messages = [];
    document.querySelectorAll("div[data-message-author-role]").forEach(el => {
      const role = el.getAttribute("data-message-author-role"); // "user" or "assistant"  
      const text = el.innerText.trim();
      if (text) {
        messages.push({ 
          type: role, 
          content: text, 
          timestamp: new Date().toISOString(),
          id: `${role}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
        });
      }
    });
    return messages;
  }

  function startConversationCapture() {
    console.log('✅ Starting ChatGPT conversation capture...');
    
    // Throttle the observer to prevent excessive updates
    let updateTimeout;
    messageObserver = new MutationObserver(() => {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        const messages = getAllMessages();
        if (messages.length > 0) {
          conversationHistory = messages;
          updateConversationDisplay();

          // Send the latest message to the offchain backend once per unique content
          const latest = messages[messages.length - 1];
          const key = latest ? `${latest.type}:${latest.content}` : null;
          if (latest && key !== lastProcessedMessageKey) {
            lastProcessedMessageKey = key;
            processMessageThroughLucid(latest);
          }

          console.log(`✅ Captured ${messages.length} messages`);
        }
      }, 500); // Wait 500ms before updating
    });

    function startObserving() {
      const chatContainer = document.querySelector("main");
      if (chatContainer) {
        messageObserver.observe(chatContainer, { 
          childList: true, 
          subtree: true,
          // Reduce the scope of observation
          attributes: false,
          characterData: false
        });
        console.log("✅ ChatGPT conversation capture is observing...");
        
        // Initial capture with delay
        setTimeout(() => {
          const initialMessages = getAllMessages();
          if (initialMessages.length > 0) {
            conversationHistory = initialMessages;
            updateConversationDisplay();

            // Process latest message on initial capture
            const latest = initialMessages[initialMessages.length - 1];
            const key = latest ? `${latest.type}:${latest.content}` : null;
            if (latest && key !== lastProcessedMessageKey) {
              lastProcessedMessageKey = key;
              processMessageThroughLucid(latest);
            }

            console.log(`✅ Initial capture: ${initialMessages.length} messages`);
          }
        }, 100);
      } else {
        console.warn("⏳ Waiting for chat container...");
        setTimeout(startObserving, 2000);
      }
    }

    startObserving();
  }


  function updateConversationDisplay() {
    // Remove existing sections
    const existingConversation = sidebar.querySelector('.cwm-conversation');
    if (existingConversation) {
      existingConversation.remove();
    }
    const existingPoints = sidebar.querySelector('.cwm-points');
    if (existingPoints) {
      existingPoints.remove();
    }

    if (conversationHistory.length === 0) return;

    // Update token statistics
    updateTokenStats();

    // Create points section
    const pointsSection = el('div', 'cwm-points');
    const pointsTitle = el('div', 'cwm-section-title', '🎯 Earned Points');
    pointsSection.appendChild(pointsTitle);

    const pointsGrid = el('div', 'cwm-points-grid');
    
    // Session stats
    pointsGrid.appendChild(row([badge('Session Points'), el('span', 'cwm-points-value', sessionStats.pointsEarned.toString())]));
    pointsGrid.appendChild(row([badge('Input Tokens'), mono(sessionStats.inputTokens.toString())]));
    pointsGrid.appendChild(row([badge('Output Tokens'), mono(sessionStats.outputTokens.toString())]));
    pointsGrid.appendChild(row([badge('Messages'), mono(sessionStats.totalMessages.toString())]));

    // Load and display lifetime points
    chrome.storage.local.get(['totalLifetimePoints'], (result) => {
      const lifetimePoints = result.totalLifetimePoints || 0;
      const lifetimeRow = row([badge('Lifetime Points'), el('span', 'cwm-lifetime-points', lifetimePoints.toFixed(1))]);
      pointsGrid.appendChild(lifetimeRow);
    });

    pointsSection.appendChild(pointsGrid);

    // Add motivational message
    const motivationalMsg = el('div', 'cwm-motivational-message', getMotivationalMessage(sessionStats.pointsEarned, sessionStats.totalMessages));
    pointsSection.appendChild(motivationalMsg);

    // Create conversation section
    const conversationSection = el('div', 'cwm-conversation');
    const conversationTitle = el('div', 'cwm-section-title', '💬 Conversation');
    conversationSection.appendChild(conversationTitle);

    const messagesList = el('div', 'cwm-messages');
    
    // Show last 8 messages (or all if less than 8)
    const recentMessages = conversationHistory.slice(-8);
    recentMessages.forEach(msg => {
      const messageEl = el('div', `cwm-message cwm-message-${msg.type}`);
      const avatar = el('span', 'cwm-message-avatar', msg.type === 'user' ? '👤' : '🤖');
      const content = el('div', 'cwm-message-content', msg.content.slice(0, 100) + (msg.content.length > 100 ? '...' : ''));
      
      messageEl.appendChild(avatar);
      messageEl.appendChild(content);
      messagesList.appendChild(messageEl);
    });

    conversationSection.appendChild(messagesList);
    
    // Add count badge
    const countBadge = el('div', 'cwm-count-badge', `${conversationHistory.length} messages`);
    conversationSection.appendChild(countBadge);

    // Insert sections after status box or at the end of body
    const insertAfter = statusBox.parentElement === body ? statusBox : body.lastChild;
    insertAfter.after(pointsSection);
    pointsSection.after(conversationSection);
  }

  // Privy in-page injection helpers (Phantom only injects into http/https pages, not chrome-extension://)
  function injectPrivyRootIfMissing() {
    if (!document.getElementById('lucid-privy-root')) {
      const div = document.createElement('div');
      div.id = 'lucid-privy-root';
      div.style.position = 'fixed';
      div.style.top = '0';
      div.style.left = '0';
      div.style.width = '100%';
      div.style.height = '100%';
      div.style.zIndex = '2147483647';
      document.body.appendChild(div);
    }
  }

  function injectPrivyBundleInPage() {
    return new Promise((resolve, reject) => {
      try {
        injectPrivyRootIfMissing();
        if (document.querySelector('script[data-lucid-privy="1"]')) {
          resolve(true);
          return;
        }
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL('dist/auth.js');
        s.dataset.lucidPrivy = '1';
        s.onload = () => resolve(true);
        s.onerror = () => reject(new Error('Failed to load Privy bundle in page'));
        (document.head || document.documentElement).appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
  }

  // Cleanup any previously injected in-page Privy UI/scripts
  function cleanupInPagePrivy() {
    try {
      const root = document.getElementById('lucid-privy-root');
      if (root) root.remove();
      document.querySelectorAll('script[data-lucid-privy="1"]').forEach((s) => s.remove());
    } catch {}
  }

  // Start capturing when page is fully loaded
  if (document.readyState === 'complete') {
    setTimeout(startConversationCapture, 1000);
  } else {
    window.addEventListener('load', () => {
      setTimeout(startConversationCapture, 1000);
    });
  }

  connectBtn.addEventListener('click', () => {
    // Ensure any old in-page Privy overlay is removed
    cleanupInPagePrivy();

    // Open the extension popup only (no in-page Privy injection)
    chrome.runtime.sendMessage({ type: 'open_privy_auth' }, (res) => {
      if (chrome.runtime.lastError) showErr(chrome.runtime.lastError.message);
    });
  });

  logoutBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'open_privy_logout' }, (res) => {
      if (chrome.runtime.lastError) showErr(chrome.runtime.lastError.message);
    });
  });

  // Listen for messages from bridge
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data?.type === 'METAMASK_CONNECTED') {
      const payload = e.data.payload;
      // MetaMask connected directly, now authenticate with Privy
      chrome.runtime.sendMessage({ type: 'authenticate_with_metamask', payload }, (res) => {
        if (chrome.runtime.lastError) {
          showErr(chrome.runtime.lastError.message);
        }
      });
    }
    if (e.data?.type === 'PRIVY_CONNECTED') {
      const payload = e.data.payload;
      chrome.storage.local.set({ privy_session: payload });
      paintStatus(payload);
      errorBox.style.display = 'none';
    }
    if (e.data?.type === 'PRIVY_ERROR') {
      showErr(e.data.error || 'Connection failed');
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'privy_authenticated') {
      chrome.storage.local.set({ privy_session: msg.payload });
      paintStatus(msg.payload);
      errorBox.style.display = 'none';
    }
    if (msg?.type === 'privy_logged_out') {
      chrome.storage.local.remove('privy_session');
      statusBox.style.display = 'none';
      logoutBtn.style.display = 'none';
      connectBtn.style.display = 'inline-flex';
      errorBox.style.display = 'none';
      // Reset hint message when disconnected
      hintDiv.textContent = 'Connect your wallet to get started';
    }
  });

  function paintStatus(p){
    statusBox.innerHTML='';
    
    // Update hint message to show "Connected" when wallet is connected
    hintDiv.textContent = 'Connected';
    
    // Initialize Lucid L2 user agent with connected wallet
    const walletAddress = p.solanaAddress || p.address;
    if (walletAddress && !userAgent) {
      initializeUserAgent(walletAddress);
    }
    
    // Always show user info
    statusBox.append(row([badge('Privy User'), txt(p.userId || '—')]));
    
    // Show EVM wallet if available
    if (p.address) {
      statusBox.append(
        row([badge('EVM Address'), mono(short(p.address))]),
        row([badge('Chain ID'), mono(String(p.chainId || 'Unknown'))])
      );
    }
    
    // Show Solana wallet if available
    if (p.solanaAddress) {
      statusBox.append(
        row([badge('Solana Address'), mono(short(p.solanaAddress))]),
        row([badge('Network'), txt(LUCID_ENV === 'testnet' ? 'Solana Testnet' : (LUCID_ENV === 'devnet' ? 'Solana Devnet' : 'Solana Mainnet'))])
      );
    }
    
    // Show wallet count if multiple wallets
    if (p.walletCount > 1) {
      statusBox.append(row([badge('Wallets'), txt(String(p.walletCount))]));
    }
    
    statusBox.style.display='block';
    logoutBtn.style.display='inline-flex';
    connectBtn.style.display='none';
  }

  function showErr(m){ 
    errorBox.textContent=m; 
    errorBox.style.display='block'; 
  }

  // utils
  function el(t,c,tx){ 
    const n=document.createElement(t); 
    if(c) n.className=c; 
    if(tx!=null) n.textContent=String(tx); 
    return n; 
  }
  function row(cs){ 
    const r=el('div','cwm-row'); 
    cs.forEach(c=>r.append(c)); 
    return r; 
  }
  function badge(t){ 
    return el('span','cwm-badge',t); 
  }
  function txt(t){ 
    return document.createTextNode(String(t)); 
  }
  function mono(t){ 
    return el('span','cwm-mono',t); 
  }
  function short(a){ 
    return a? a.slice(0,6)+'…'+a.slice(-4):''; 
  }

  // Function to remove black background from logo
  function removeBlackBackground(img) {
    // Use requestAnimationFrame to avoid blocking the main thread
    requestAnimationFrame(() => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        // Draw the original image
        ctx.drawImage(img, 0, 0);
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Process pixels to make black/dark pixels transparent
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1]; 
          const b = data[i + 2];
          
          // If pixel is very dark (close to black), make it transparent
          if (r < 50 && g < 50 && b < 50) {
            data[i + 3] = 0; // Set alpha to 0 (transparent)
          }
          // If pixel is dark but not completely black, reduce its opacity
          else if (r < 100 && g < 100 && b < 100) {
            data[i + 3] = data[i + 3] * 0.3; // Reduce opacity
          }
        }
        
        // Put the modified image data back
        ctx.putImageData(imageData, 0, 0);
        
        // Replace the original image with the processed one
        img.src = canvas.toDataURL('image/png');
      } catch (error) {
        console.log('Could not process logo background:', error);
      }
    });
  }
})();
