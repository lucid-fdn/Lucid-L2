# Sidebar & Popup Data Synchronization Fix

## Problem Discovered

The sidebar and popup were displaying different reward balances due to inconsistent data loading and calculation logic:

### Issues
1. **Popup**: Fetched from backend API AND added local session stats to the balance
2. **Sidebar**: Only read from local storage without fetching from backend
3. **Result**: Different numbers shown in each interface, confusing users

## Root Cause

**Double-Counting Issue:**
```javascript
// OLD POPUP CODE (WRONG):
const totalMGas = this.balance.mGas + (this.chatgptSessionStats.mGasEarned || 0);
// This added session stats to backend balance, causing double-counting

// OLD SIDEBAR CODE (INCOMPLETE):
const balance = result.balance || { mGas: 0, lucid: 0 };
// This didn't fetch from backend at all
```

**Backend Already Includes Session Stats:**
- The backend's `/api/rewards/balance` endpoint returns cumulative totals
- Session stats tracked in `chatgpt_session_stats` are local tracking only
- Adding them together resulted in double-counting

## Solution Implemented

### 1. Popup Enhancement
- Saves backend balance to storage after fetching
- Removes double-counting logic
```javascript
async loadRewardsFromBackend() {
    const response = await fetch(`http://13.221.253.195:3001/api/rewards/balance/${userId}`);
    const data = await response.json();
    
    if (data.success && data.rewards) {
        this.balance.mGas = data.rewards.balance.mGas || 0;
        this.balance.lucid = data.rewards.balance.lucid || 0;
        
        // CRITICAL: Save to storage so sidebar can access it
        await chrome.storage.local.set({ 
            balance: this.balance,
            backend_balance_timestamp: Date.now()
        });
    }
}

async updateUI() {
    // IMPORTANT: Don't add session stats - backend balance already includes all earnings
    const totalMGas = this.balance.mGas || 0;
    const totalLUCID = this.balance.lucid || 0;
}
```

### 2. Sidebar Enhancement
- Converted to async/await for proper data fetching
- Added backend API fetch (matching popup behavior)
- Added real-time sync listener for `rewards_updated` messages
```javascript
async function updateSidebarData() {
    // Promisify chrome.storage.local.get to work with async/await
    const storageData = await new Promise((resolve) => {
        chrome.storage.local.get([...], resolve);
    });
    
    // Fetch from backend if authenticated
    let backendBalance = null;
    if (storageData.privy_session?.userId) {
        const response = await fetch(`http://13.221.253.195:3001/api/rewards/balance/${userId}`);
        const data = await response.json();
        if (data.success && data.rewards) {
            backendBalance = data.rewards.balance;
        }
    }
    
    // Use backend balance if available, otherwise use local
    const balance = backendBalance || storageData.balance || { mGas: 0, lucid: 0 };
    
    // Use backend balance directly, don't add session stats
    const totalMGas = balance.mGas || 0;
}

// Listen for real-time updates
chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'rewards_updated') {
        updateSidebarData(); // Refresh from backend
    }
});
```

## Data Flow Architecture

### Backend Balance (Source of Truth)
- Stored in database
- Cumulative total of all earnings
- Retrieved via API: `GET /api/rewards/balance/:userId`
- Updated when new rewards are earned

### Local Session Stats (Informational Only)
- Stored in chrome.storage.local as `chatgpt_session_stats`
- Tracks current browser session activity
- Includes: messages, tokens, points for current session
- **NOT** added to totals (backend already has this data)

### Display Logic
1. **Popup** fetches backend balance on `init()` via `loadRewardsFromBackend()`
2. **Sidebar** fetches backend balance on `updateSidebarData()`
3. Both display:
   - **Total Balance**: From backend API (cumulative)
   - **Session Stats**: From local storage (informational only)

## Files Modified

1. **sidebar.js**
   - Changed `updateSidebarData()` from sync to async
   - Added backend API fetch logic
   - Fixed balance calculation to use backend data directly
   - Added proper error handling

2. **popup.js**
   - Removed double-counting in `updateUI()`
   - Changed from `balance.mGas + sessionStats.mGasEarned` to just `balance.mGas`
   - Backend balance already includes session earnings

## Testing Checklist

### Step 1: Clear Data and Reload
- [ ] Go to chrome://extensions/
- [ ] Click "Reload" on Lucid-Extension
- [ ] Open the extension popup
- [ ] Click "Reset Data" in Settings tab to start fresh
- [ ] Reload the extension again

### Step 2: Connect Wallet
- [ ] Click "Connect Wallet" in popup
- [ ] Complete Privy authentication
- [ ] Verify wallet shows as connected

### Step 3: Test ChatGPT Capture
- [ ] Open https://chatgpt.com in a new tab
- [ ] Open browser console (F12)
- [ ] Verify you see initialization logs
- [ ] Send a test message in ChatGPT
- [ ] Check console for capture logs

### Step 4: Verify Popup Display
- [ ] Open extension popup
- [ ] Note the mGas balance shown at top
- [ ] Check ChatGPT Session Stats tab
- [ ] Note session mGas earned

### Step 5: Verify Sidebar Display
- [ ] Click "Pin" button in popup to open sidebar
- [ ] Verify sidebar mGas balance matches popup top banner
- [ ] Session mGas in sidebar should match session tab in popup
- [ ] Both total balances should be identical

### Step 6: Send More Messages
- [ ] Send 2-3 more messages in ChatGPT
- [ ] Watch console logs for backend processing
- [ ] Popup should auto-update (if open)
- [ ] Sidebar should auto-update
- [ ] Both should show same totals

### Debug Checklist (If Still Different)
- [ ] Open browser console on ChatGPT tab
- [ ] Look for "Backend rewards loaded" log
- [ ] Open popup and check console
- [ ] Look for "Popup: Backend rewards loaded"  
- [ ] Open sidebar and check page console
- [ ] Look for "Sidebar: Backend rewards loaded"
- [ ] All three should show same balance object

## Expected Behavior

### Before Fix
```
Popup:    mGas: 150 (100 from backend + 50 from session)
Sidebar:  mGas: 50  (only local session stats)
❌ Different numbers = confused users
```

### After Fix
```
Popup:    mGas: 100 (from backend)
Sidebar:  mGas: 100 (from backend)
Session:  mGas: 50  (informational, shown separately)
✅ Same numbers = consistent experience
```

## Key Points

1. **Backend is Source of Truth**: Always trust backend balance over local calculations
2. **Session Stats are Informational**: They show current session activity, not total balance
3. **No Double-Counting**: Never add session stats to backend balance
4. **Both Fetch from Backend**: Popup and sidebar both call the API for fresh data
5. **Fallback to Local**: If backend unavailable, fall back to local storage

## Future Improvements

1. Add visual distinction between "Total Balance" and "Session Earnings"
2. Implement real-time sync when rewards are earned
3. Add refresh button for manual sync
4. Show "last updated" timestamp
5. Indicate when displaying cached vs fresh data

## Related Files

- `content.js` - Captures ChatGPT messages, sends to backend
- `background.js` - Relays messages between content script and backend
- `popup.js` - Main UI, fetches from backend
- `sidebar.js` - Persistent UI, now also fetches from backend
- Backend: `/api/rewards/balance/:userId` - Returns cumulative balance
- Backend: `/api/rewards/process-conversation` - Processes new rewards
