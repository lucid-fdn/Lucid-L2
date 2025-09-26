# 🔍 Real Browser Debug Guide - Wallet Connection Issues

## 🎯 Purpose

This guide helps debug wallet connection issues in the actual Chrome browser, not just passing static tests.

## 📋 Step-by-Step Debugging Process

### Step 1: Load Extension Properly

1. **Open Chrome Extensions page:**
   ```
   chrome://extensions/
   ```

2. **Enable Developer Mode** (toggle in top-right)

3. **Remove existing extension** (if any) and **Load unpacked**
   - Select the `browser-extension` folder
   - Note the extension ID that appears

4. **Check for errors:**
   - Look for any red error messages
   - Click "Errors" if there are any
   - Fix any manifest or script errors before proceeding

### Step 2: Test on Compatible Website

1. **Navigate to a test website:**
   ```
   https://google.com
   OR
   https://example.com
   ```

2. **Avoid these incompatible pages:**
   - `chrome://` pages
   - `chrome-extension://` pages
   - `file://` local files
   - `about:` pages

### Step 3: Check Content Script Injection

1. **Open Chrome DevTools** (F12)

2. **Go to Console tab**

3. **Check for content script logs:**
   ```javascript
   // Should see these messages:
   "🚀 Lucid L2™ Content Script initializing..."
   "✅ Lucid L2™ Content Script initialized successfully"
   ```

4. **If content script NOT loading:**
   - Refresh the page
   - Check if extension is enabled
   - Look for script injection errors in console

5. **Manual content script test:**
   ```javascript
   // Paste in DevTools console:
   console.log('Content script available:', typeof window.lucidContentScript);
   ```

### Step 4: Check Phantom Wallet Detection

1. **In DevTools Console, test Phantom detection:**
   ```javascript
   // Test 1: Basic Phantom check
   console.log('window.solana exists:', typeof window.solana !== 'undefined');
   console.log('isPhantom:', window.solana?.isPhantom);
   console.log('isConnected:', window.solana?.isConnected);
   
   // Test 2: Wait for Phantom (sometimes it loads slowly)
   setTimeout(() => {
       console.log('After delay - window.solana:', typeof window.solana !== 'undefined');
       console.log('After delay - isPhantom:', window.solana?.isPhantom);
   }, 2000);
   ```

2. **If Phantom NOT detected:**
   - Install Phantom wallet extension
   - Refresh the page after installation
   - Check if Phantom is enabled in chrome://extensions/

### Step 5: Test Message Passing

1. **Load test script in Console:**
   ```javascript
   // Copy/paste the entire content of test-real-browser-connection.js
   // into DevTools console and run it
   ```

2. **Or run manual message test:**
   ```javascript
   // Test message passing directly
   chrome.runtime.sendMessage({action: 'test'}, (response) => {
       console.log('Message test response:', response);
   });
   ```

### Step 6: Test Extension Popup

1. **Click the extension icon** in Chrome toolbar

2. **Open DevTools for popup:**
   - Right-click the extension icon
   - Select "Inspect popup" from context menu
   - This opens DevTools specifically for the popup

3. **In popup DevTools Console, check:**
   ```javascript
   // Check if popup script loaded
   console.log('Extension state:', window.extensionState);
   
   // Check current tab
   chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
       console.log('Current tab:', tabs[0]);
   });
   ```

4. **Try manual wallet connection:**
   ```javascript
   // In popup DevTools, trigger connection manually
   if (window.extensionState) {
       window.extensionState.connectWallet();
   }
   ```

### Step 7: Check Network and Permissions

1. **In popup DevTools, check permissions:**
   ```javascript
   // Check if required permissions are granted
   chrome.permissions.getAll((permissions) => {
       console.log('Granted permissions:', permissions);
   });
   ```

2. **Test tab messaging:**
   ```javascript
   // In popup DevTools:
   chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
       const tab = tabs[0];
       console.log('Sending message to tab:', tab.id);
       
       try {
           const response = await chrome.tabs.sendMessage(tab.id, {action: 'checkWallet'});
           console.log('Tab response:', response);
       } catch (error) {
           console.error('Tab message failed:', error);
       }
   });
   ```

## 🚨 Common Issues and Solutions

### Issue 1: Content Script Not Loading
**Symptoms:** No console messages, `window.lucidContentScript` undefined
**Solutions:**
- Refresh the page
- Reload the extension in chrome://extensions/
- Check manifest.json content_scripts configuration
- Verify the page URL is compatible (http/https)

### Issue 2: Phantom Not Detected
**Symptoms:** `window.solana` is undefined or not Phantom
**Solutions:**
- Install Phantom wallet extension
- Unlock Phantom wallet
- Refresh page after installing Phantom
- Wait 2-3 seconds for Phantom to inject (timing issue)

### Issue 3: Message Passing Fails
**Symptoms:** "Unable to communicate with the page" error
**Solutions:**
- Ensure content script is loaded first
- Check if current tab allows script injection
- Verify activeTab permission is granted
- Try manual content script injection

### Issue 4: Popup Can't Send Messages
**Symptoms:** Chrome tabs API errors, no response from content script
**Solutions:**
- Check if popup has activeTab permission
- Verify current tab is not a chrome:// page
- Ensure content script is injected before sending messages
- Add retry logic with delays

### Issue 5: Phantom Connection Rejected
**Symptoms:** Phantom prompts appear but connection fails
**Solutions:**
- Check Phantom wallet is unlocked
- Approve the connection request in Phantom
- Verify network settings (should be Devnet)
- Clear Phantom's connected sites and retry

## 🛠️ Advanced Debugging

### Enable Verbose Logging

Add this to content script for more debugging:

```javascript
// Add to top of content.js
const DEBUG = true;
function debugLog(...args) {
    if (DEBUG) console.log('[Lucid Debug]', ...args);
}
```

### Check Extension Storage

```javascript
// In popup DevTools:
chrome.storage.local.get(null, (items) => {
    console.log('Extension storage:', items);
});
```

### Monitor Extension Events

```javascript
// In background script or popup:
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received:', message, 'from:', sender);
    return true;
});
```

## 📝 Creating a Bug Report

If issues persist, gather this information:

1. **Browser Info:**
   - Chrome version
   - OS version
   - Extension version/ID

2. **Console Logs:**
   - All content script console messages
   - All popup console messages
   - Any error messages

3. **Phantom Info:**
   - Phantom extension version
   - Wallet status (locked/unlocked)
   - Network setting

4. **Test Results:**
   - Copy/paste output from test-real-browser-connection.js
   - Screenshots of any error dialogs

5. **Steps to Reproduce:**
   - Exact sequence of actions
   - What page you were on
   - What happened vs what was expected

## 🎯 Expected Working Behavior

When everything works correctly, you should see:

1. **Content script loads:** Console shows initialization messages
2. **Phantom detected:** `window.solana.isPhantom` returns true
3. **Message passing works:** No communication errors
4. **Wallet connects:** Phantom popup appears when clicking "Connect Wallet"
5. **Balance displays:** SOL balance shows in extension popup
6. **Network shows:** "DEVNET" indicator appears

If any step fails, use the debugging steps above to identify and fix the issue.
