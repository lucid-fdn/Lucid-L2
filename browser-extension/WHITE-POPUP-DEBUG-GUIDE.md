# White Popup Debug Guide

## Issue
Getting a white popup when clicking "Connect Wallet" in the browser extension.

## Files Confirmed ✅
- `auth.html` exists and references `./dist/auth.js` correctly
- `dist/auth.js` exists (4MB built file with Privy React stack)
- `dist/bridge.js` exists (1.1KB minimal bridge)

## Troubleshooting Steps

### Step 1: Check Browser Console Errors
1. **Open Browser Dev Tools**: Right-click on the white popup and select "Inspect"
2. **Check Console Tab**: Look for any red error messages
3. **Common Errors to Look For**:
   - `Failed to load resource` - Network/file loading issues
   - `Privy API errors` - API key or configuration issues  
   - `Content Security Policy errors` - CSP blocking resources
   - `React errors` - JavaScript runtime errors

### Step 2: Verify Extension Installation
1. **Go to**: `chrome://extensions/` (Chrome) or `about:addons` (Firefox)
2. **Check Extension Status**: Ensure the extension is enabled
3. **Developer Mode**: Enable developer mode if not already
4. **Reload Extension**: Click the reload button for your extension
5. **Check for Errors**: Look for any error badges on the extension

### Step 3: Test Network Connectivity
The white popup might indicate Privy services can't be reached:

1. **Check Internet Connection**: Ensure you have internet access
2. **Test Privy Domains**: Try accessing `https://auth.privy.io` directly
3. **Corporate Firewall**: Check if corporate/school firewall is blocking Privy
4. **VPN Issues**: Try disabling VPN temporarily

### Step 4: Browser-Specific Issues

#### Chrome:
- **Manifest V3**: Check if manifest.json has correct permissions
- **CSP Issues**: Check Content Security Policy settings
- **Incognito Mode**: Try in regular (non-incognito) mode

#### Firefox:
- **Tracking Protection**: Disable enhanced tracking protection for testing
- **Add-on Permissions**: Check if all permissions are granted

### Step 5: Create Debug Version
Create a simple test to isolate the issue:

1. **Create test-auth.html**:
```html
<!doctype html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Privy Debug Test</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .status { margin: 10px 0; padding: 10px; border-radius: 4px; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <h1>Privy Connection Debug</h1>
    <div id="status">Loading...</div>
    <div id="error-log"></div>
    
    <script>
        console.log('Debug script starting...');
        
        // Log basic info
        document.getElementById('status').innerHTML = '<div class="status">✅ HTML loaded</div>';
        
        // Try to load the main auth script
        const script = document.createElement('script');
        script.src = './dist/auth.js';
        script.onload = function() {
            document.getElementById('status').innerHTML += '<div class="status success">✅ auth.js loaded successfully</div>';
        };
        script.onerror = function(e) {
            document.getElementById('status').innerHTML += '<div class="status error">❌ auth.js failed to load</div>';
            document.getElementById('error-log').innerHTML += '<pre>Error: ' + JSON.stringify(e, null, 2) + '</pre>';
        };
        
        // Catch all errors
        window.onerror = function(message, source, lineno, colno, error) {
            console.error('Global error:', message, source, lineno, colno, error);
            document.getElementById('error-log').innerHTML += 
                '<div class="status error">❌ JS Error: ' + message + ' at ' + source + ':' + lineno + '</div>';
        };
        
        // Check network connectivity
        fetch('https://httpbin.org/get')
            .then(() => {
                document.getElementById('status').innerHTML += '<div class="status success">✅ Network connectivity OK</div>';
            })
            .catch(() => {
                document.getElementById('status').innerHTML += '<div class="status error">❌ Network connectivity failed</div>';
            });
        
        document.head.appendChild(script);
    </script>
</body>
</html>
```

2. **Test the debug file**: Replace the popup URL temporarily with `test-auth.html`

### Step 6: Check Privy Configuration

The issue might be with the Privy app configuration:

1. **API Key Issues**: The Privy app ID might be invalid or restricted
2. **Domain Restrictions**: Privy app might be restricted to specific domains
3. **Configuration Mismatch**: App settings might not allow extension usage

### Step 7: Alternative Solutions

If Privy continues to fail, consider:

1. **Direct Phantom Integration**: Skip Privy and connect directly to Phantom
2. **Different Auth Provider**: Use WalletConnect or other providers
3. **Simplified Connection**: Create basic wallet connection without Privy

### Step 8: Manifest.json Verification

Check if the manifest has correct permissions:

```json
{
  "permissions": [
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "https://auth.privy.io/*",
    "https://api.privy.io/*",
    "https://*.privy.io/*"
  ]
}
```

## Quick Fix Options

### Option 1: Simple Phantom Connection
Replace Privy with direct Phantom connection:

```html
<!doctype html>
<html>
<head>
    <title>Simple Wallet Connect</title>
    <style>
        body { padding: 20px; font-family: Arial, sans-serif; }
        button { padding: 10px 20px; font-size: 16px; background: #512da8; color: white; border: none; border-radius: 4px; }
    </style>
</head>
<body>
    <h2>Connect Solana Wallet</h2>
    <button onclick="connectPhantom()">Connect Phantom</button>
    <div id="result"></div>
    
    <script>
        async function connectPhantom() {
            try {
                if (!window.solana) {
                    throw new Error('Phantom wallet not installed');
                }
                
                const response = await window.solana.connect();
                document.getElementById('result').innerHTML = 
                    '<p>✅ Connected: ' + response.publicKey.toString() + '</p>';
                
                // Send result back to extension
                chrome.runtime.sendMessage({
                    type: 'wallet_connected',
                    publicKey: response.publicKey.toString()
                });
                
                setTimeout(() => window.close(), 2000);
            } catch (error) {
                document.getElementById('result').innerHTML = 
                    '<p style="color: red;">❌ Error: ' + error.message + '</p>';
            }
        }
    </script>
</body>
</html>
```

### Option 2: Check Extension Permissions
Ensure the manifest.json includes all necessary permissions for Privy to work.

## Expected Console Logs
When working correctly, you should see:
