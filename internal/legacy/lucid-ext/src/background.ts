// Background service worker for Lucid Extension
// Handles API calls and message routing

import config from './config';
import { errorHandler } from './error-handler';

console.log('[Lucid Extension] Background service worker started');
console.log('[Lucid Extension] Config:', {
  apiUrl: config.apiUrl,
  network: config.network,
  environment: config.environment,
});

/**
 * Handle messages from content script and popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Lucid Extension] Message received:', message.type);
  
  if (message.type === 'process_thought') {
    handleProcessThought(message.payload)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => {
        console.error('[Lucid Extension] Error processing thought:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'api_request') {
    handleApiRequest(message.payload)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => {
        console.error('[Lucid Extension] API request failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  return false;
});

/**
 * Process a thought through Lucid backend
 */
async function handleProcessThought(payload: {
  text: string;
  walletAddress: string;
}): Promise<any> {
  try {
    const response = await fetch(`${config.apiUrl}/api/thoughts/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: payload.text,
        wallet: payload.walletAddress,
        source: 'chatgpt',
        timestamp: Date.now(),
      }),
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('[Lucid Extension] Thought processed successfully:', data);
    
    return {
      earned: data.reward || data.mGasEarned || 0,
      qualityScore: data.qualityScore || 0,
      qualityTier: data.qualityTier || 'basic',
      signature: data.signature,
      ...data,
    };
  } catch (error) {
    console.error('[Lucid Extension] Failed to process thought:', error);
    errorHandler.handle(error as Error, 'Process Thought API');
    throw error;
  }
}

/**
 * Generic API request handler
 */
async function handleApiRequest(payload: {
  endpoint: string;
  method?: string;
  body?: any;
}): Promise<any> {
  const { endpoint, method = 'GET', body } = payload;
  
  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${config.apiUrl}${endpoint}`, options);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Lucid Extension] API request failed:', error);
    errorHandler.handle(error as Error, 'API Request');
    throw error;
  }
}

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Lucid Extension] Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // Initialize storage on first install
    chrome.storage.local.set({
      version: 1,
      wallet: null,
      balance: { mGas: 0, lucid: 0, sol: 0 },
      dailyProgress: { completed: 0, total: 10 },
      streak: 0,
      tasks: [],
      history: [],
      settings: {
        notifications: true,
        autoProcess: false,
      },
    });
    
    console.log('[Lucid Extension] Storage initialized');
  }
});

/**
 * Daily reset alarm
 */
chrome.alarms.create('dailyReset', {
  when: getNextMidnight(),
  periodInMinutes: 1440, // 24 hours
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyReset') {
    console.log('[Lucid Extension] Daily reset triggered');
    
    chrome.storage.local.get(['dailyProgress', 'streak'], (data) => {
      const dailyProgress = data.dailyProgress || { completed: 0, total: 10 };
      const currentStreak = data.streak || 0;
      
      // Check if user completed daily goal
      const completedGoal = dailyProgress.completed >= dailyProgress.total;
      
      // Update streak
      const newStreak = completedGoal ? currentStreak + 1 : 0;
      
      // Reset daily progress
      chrome.storage.local.set({
        dailyProgress: { completed: 0, total: 10 },
        streak: newStreak,
        lastDailyReset: new Date().toISOString(),
      });
      
      console.log('[Lucid Extension] Daily reset complete, new streak:', newStreak);
    });
  }
});

/**
 * Get timestamp for next midnight
 */
function getNextMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.getTime();
}

// Export for potential use in tests
export { handleProcessThought, handleApiRequest };
