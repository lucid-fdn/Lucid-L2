// Content script for ChatGPT integration
// Captures conversations and sends them to Lucid backend for processing

import config from './config';
import { errorHandler } from './error-handler';

console.log('[Lucid Extension] Content script loaded on:', window.location.href);

// Check if we're on ChatGPT
const isChatGPT = 
  window.location.hostname === 'chatgpt.com' || 
  window.location.hostname === 'chat.openai.com';

if (!isChatGPT) {
  console.log('[Lucid Extension] Not on ChatGPT, content script inactive');
}

// Track processed messages to avoid duplicates
const processedMessages = new Set<string>();

/**
 * Extract conversation messages from ChatGPT DOM
 */
function extractMessages(): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  
  // ChatGPT message selectors (may need updating if UI changes)
  const messageElements = document.querySelectorAll('[data-message-author-role]');
  
  messageElements.forEach((element) => {
    const role = element.getAttribute('data-message-author-role');
    const contentElement = element.querySelector('.markdown, .whitespace-pre-wrap');
    
    if (role && contentElement && (role === 'user' || role === 'assistant')) {
      const content = contentElement.textContent?.trim() || '';
      if (content) {
        messages.push({
          role: role as 'user' | 'assistant',
          content,
        });
      }
    }
  });
  
  return messages;
}

/**
 * Process a thought through Lucid backend
 */
async function processThought(text: string): Promise<void> {
  // Create unique hash for this message
  const messageHash = btoa(text.substring(0, 100));
  
  // Skip if already processed
  if (processedMessages.has(messageHash)) {
    return;
  }
  
  try {
    // Get wallet address from storage
    const result = await chrome.storage.local.get(['wallet']);
    const walletAddress = result.wallet?.address;
    
    if (!walletAddress) {
      console.log('[Lucid Extension] No wallet connected, skipping thought processing');
      return;
    }
    
    // Send to background script for API call
    const response = await chrome.runtime.sendMessage({
      type: 'process_thought',
      payload: {
        text,
        walletAddress,
      },
    });
    
    if (response.success) {
      processedMessages.add(messageHash);
      console.log('[Lucid Extension] Thought processed, earned:', response.data.earned, 'mGas');
      
      // Update storage with new balance
      await chrome.storage.local.get(['balance', 'dailyProgress', 'history'], async (data) => {
        const balance = data.balance || { mGas: 0, lucid: 0, sol: 0 };
        const dailyProgress = data.dailyProgress || { completed: 0, total: 10 };
        const history = data.history || [];
        
        // Update balance
        balance.mGas += response.data.earned || 0;
        
        // Update daily progress
        dailyProgress.completed += 1;
        
        // Add to history
        history.unshift({
          text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          earned: response.data.earned || 0,
          timestamp: Date.now(),
          qualityScore: response.data.qualityScore,
          qualityTier: response.data.qualityTier,
        });
        
        // Keep only last 50 items
        if (history.length > 50) {
          history.length = 50;
        }
        
        // Save updated data
        await chrome.storage.local.set({
          balance,
          dailyProgress,
          history,
        });
      });
      
      // Show notification
      showNotification(`+${response.data.earned} mGas earned!`);
    }
  } catch (error) {
    errorHandler.handle(error as Error, 'Process Thought');
  }
}

/**
 * Show in-page notification
 */
function showNotification(message: string): void {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #667eea;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Monitor for new messages
 */
function startMonitoring(): void {
  if (!isChatGPT) return;
  
  console.log('[Lucid Extension] Starting conversation monitoring');
  
  let lastMessageCount = 0;
  
  // Check for new messages every 2 seconds
  setInterval(() => {
    const messages = extractMessages();
    
    if (messages.length > lastMessageCount) {
      // New messages detected
      const newMessages = messages.slice(lastMessageCount);
      lastMessageCount = messages.length;
      
      // Process user messages
      newMessages.forEach((msg) => {
        if (msg.role === 'user' && msg.content.length > 10) {
          processThought(msg.content);
        }
      });
    }
  }, 2000);
}

// Start monitoring when page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startMonitoring);
} else {
  startMonitoring();
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
