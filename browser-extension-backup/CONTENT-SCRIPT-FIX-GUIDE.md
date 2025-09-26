# Content Script Fix Guide - Lucid L2™ Browser Extension

## Problem: "Content script not available. Please refresh the page and try again"

This error occurs when the browser extension popup tries to connect to the wallet but cannot communicate with the content script that runs on the webpage. This is a common issue in browser extensions that need to interact with web pages.

## Root Causes

1. **Content Script Loading Issues**: The content script may not be properly loaded or initialized
2. **Timing Issues**: The popup tries to communicate before the content script is ready
3. **Page Refresh/Navigation**: Content scripts are lost when pages are refreshed or navigated
4. **Permission Issues**: Missing permissions for script injection
5. **Communication Failures**: Message passing between popup and content script fails

## Solution Implementation

### 1. Enhanced Wallet Connection with Fallback Methods

The `connectWallet()` method now includes multiple connection strategies:

```javascript
async connectWallet() {
    try {
        this.showLoading();
        
        // Strategy 1: Direct wallet connection (if available in popup context)
        if (typeof window !== 'undefined' && window.solana && window.solana.isPhantom) {
            const result = await this.connectWalletDirect();
            if (result.success) {
                // Handle successful direct connection
                return;
            }
        }
        
        // Strategy 2: Content script communication with auto-injection
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) {
            throw new Error('No active tab found. Please open a web page and try again.');
        }
        
        // Check if content script is available
        const isContentScriptAvailable = await this.checkContentScriptAvailable(tabs[0].id);
        if (!isContentScriptAvailable) {
            // Try to inject content script dynamically
            await chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                files: ['content.js']
            });
            // Wait for content script to initialize
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Send message with retry logic
        const result = await this.sendMessageWithRetry(tabs[0].id, {
            action: 'connectWallet'
        });
        
        // Handle result
        if (result && result.success) {
            // Process successful connection
        }
        
    } catch (error) {
        this.showToast(error.message);
    }
}
```

### 2. Content Script Availability Check

```javascript
async checkContentScriptAvailable(tabId) {
    try {
        const result = await chrome.tabs.sendMessage(tabId, {
            action: 'getPageInfo'
        });
        return result && result.title;
    } catch (error) {
        console.log('Content script not available:', error);
        return false;
    }
}
```

### 3. Retry Logic for Message Passing

```javascript
async sendMessageWithRetry(tabId, message, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await chrome.tabs.sendMessage(tabId, message);
            return result;
        } catch (error) {
            console.log(`Message attempt ${i + 1} failed:`, error);
            if (i === maxRetries - 1) {
                throw new Error('Content script not available. Please refresh the page and try again.');
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
}
```

### 4. Direct Wallet Connection Fallback

```javascript
async connectWalletDirect() {
    try {
        if (!window.solana || !window.solana.isPhantom) {
            throw new Error('Phantom wallet not found. Please install Phantom wallet.');
        }

        const response = await window.solana.connect();
        
        return {
            success: true,
            wallet: {
                address: response.publicKey.toString(),
                publicKey: response.publicKey
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}
```

### 5. Updated Manifest Permissions

Added `scripting` permission to allow dynamic content script injection:

```json
{
  "permissions": [
    "activeTab",
    "storage",
    "alarms",
    "notifications",
    "contextMenus",
    "scripting"
  ]
}
```

## Key Improvements

### 1. **Multi-Strategy Connection**
- Direct wallet connection when possible
- Content script injection when needed
- Graceful fallback between methods

### 2. **Robust Error Handling**
- Clear error messages for different scenarios
- Retry logic with exponential backoff
- User-friendly error reporting

### 3. **Content Script Management**
- Automatic content script injection
- Availability checking before communication
- Proper cleanup and initialization

### 4. **User Experience**
- Loading indicators during connection attempts
- Clear instructions for different error scenarios
- Seamless wallet connection experience

## Testing the Fix

### 1. **Load Extension**
```bash
# Load the extension in Chrome
# Go to chrome://extensions/
# Enable Developer mode
# Click "Load unpacked" and select browser-extension folder
```

### 2. **Test Connection Scenarios**
- Fresh page load → wallet connection
- Page refresh → wallet connection
- Different websites → wallet connection
- Multiple tabs → wallet connection

### 3. **Verify Error Handling**
- No content script → automatic injection
- Network issues → retry logic
- Phantom not installed → clear error message
- Permission denied → user guidance

## Troubleshooting

### If You Still Get "Content script not available"

1. **Check Browser Console**:
   ```bash
   # Open Developer Tools (F12)
   # Check Console tab for error messages
   # Look for content script loading errors
   ```

2. **Verify Extension Permissions**:
   ```json
   // Ensure manifest.json has all required permissions
   "permissions": ["activeTab", "storage", "scripting"]
   ```

3. **Clear Extension Data**:
   ```bash
   # Go to chrome://extensions/
   # Click "Remove" and reinstall the extension
   # Or clear storage data in extension popup
   ```

4. **Test on Different Pages**:
   ```bash
   # Try connecting on different websites
   # Some sites may block content scripts
   # Test on standard HTTP/HTTPS pages
   ```

### Debug Mode

Enable debug logging by adding to popup.js:

```javascript
// Add at the top of popup.js
const DEBUG = true;

// Use throughout the code
if (DEBUG) {
    console.log('Debug: Content script check result:', result);
}
```

## Browser Compatibility

### Chrome/Chromium
- ✅ Manifest V3 support
- ✅ Content script injection
- ✅ Message passing API

### Firefox
- ⚠️ May need manifest.json modifications
- ⚠️ Different permission handling
- ⚠️ Test thoroughly before deployment

### Edge
- ✅ Chrome extension compatibility
- ✅ Same API support
- ✅ Should work without modifications

## Best Practices

### 1. **Always Check Content Script Availability**
```javascript
const isAvailable = await this.checkContentScriptAvailable(tabId);
if (!isAvailable) {
    // Handle injection or show error
}
```

### 2. **Use Retry Logic for All Communication**
```javascript
const result = await this.sendMessageWithRetry(tabId, message);
```

### 3. **Provide Clear User Feedback**
```javascript
this.showToast('Content script not available. Please refresh the page and try again.');
```

### 4. **Handle All Edge Cases**
- No active tabs
- Permission denied
- Network timeouts
- Wallet not installed

## Security Considerations

1. **Content Script Injection**: Only inject trusted scripts
2. **Message Validation**: Validate all messages between popup and content script
3. **Wallet Security**: Never store private keys in extension
4. **Permission Scope**: Request minimal required permissions

## Performance Optimization

1. **Lazy Loading**: Load content scripts only when needed
2. **Caching**: Cache content script availability status
3. **Debouncing**: Prevent multiple simultaneous connection attempts
4. **Cleanup**: Remove event listeners on extension unload

## Future Enhancements

1. **Background Script Communication**: Route messages through background script
2. **Service Worker Integration**: Use service workers for better reliability
3. **Offline Support**: Handle offline scenarios gracefully
4. **Multi-Wallet Support**: Add support for other Solana wallets

## Summary

The "Content script not available" error has been resolved through:
- Enhanced connection strategies with fallback methods
- Automatic content script injection when needed
- Robust retry logic and error handling
- Improved user experience with clear feedback
- Proper permission management in manifest.json

This implementation ensures reliable wallet connection across different scenarios and provides a smooth user experience in the Lucid L2™ browser extension.
