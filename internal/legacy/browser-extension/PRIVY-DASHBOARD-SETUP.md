# Privy Dashboard Configuration for Chrome Extension

This guide explains how to configure your Privy Dashboard to work with your Chrome extension.

## Prerequisites

1. **Get Your Extension ID**
   - Load your extension in Chrome by going to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select your extension directory
   - Copy the Extension ID shown under your extension name (it looks like: `abcdefghijklmnopqrstuvwxyz123456`)

## Dashboard Configuration Steps

### 1. Add Allowed Origins

Go to [Privy Dashboard](https://dashboard.privy.io) → Your App → **Settings** → **Domains**

Add the following origin:
```
chrome-extension://<your-extension-id>
```

Replace `<your-extension-id>` with your actual extension ID.

**Example:**
```
chrome-extension://abcdefghijklmnopqrstuvwxyz123456
```

### 2. Configure Redirect URLs (Required for Social Login)

Still in the Domains section, add the redirect URL:

```
https://<your-extension-id>.chromiumapp.org/
```

Replace `<your-extension-id>` with your actual extension ID.

**Example:**
```
https://abcdefghijklmnopqrstuvwxyz123456.chromiumapp.org/
```

⚠️ **Important:** Make sure to include the trailing slash `/` at the end of the redirect URL.

### 3. Additional Configuration (Optional)

Go to **Settings** → **Advanced** → **Allowed Redirect URLs**

Add the same redirect URL here as well for additional security:
```
https://<your-extension-id>.chromiumapp.org/
```

## Verify Configuration

After configuring your dashboard:

1. Save all changes in the Privy Dashboard
2. Reload your Chrome extension (`chrome://extensions/` → Click the reload icon)
3. Test the authentication flow by clicking "Connect Wallet" in your extension

## Troubleshooting

### Issue: "Invalid redirect URL" error

**Solution:** 
- Double-check that you added the correct extension ID
- Ensure the redirect URL includes the trailing slash
- Wait a few minutes for Privy's configuration to propagate

### Issue: Authentication popup opens but login doesn't complete

**Solution:**
- Check browser console for errors (F12)
- Verify your extension ID matches in both manifest.json and Privy Dashboard
- Clear browser cache and extension storage

### Issue: "Origin not allowed" error

**Solution:**
- Make sure `chrome-extension://<your-extension-id>` is added to allowed origins
- Verify you're using the correct extension ID (it changes if you reload an unpacked extension)

## Current Configuration

Your extension is currently configured with:
- **Privy App ID:** `cm7kvvobw020cisjqrkr9hr2m`
- **Login Methods:** Email, Wallet, Google
- **Supported Wallets:** Phantom, Backpack, MetaMask, and more

## Getting Your Extension ID Programmatically

You can also get your extension ID programmatically by running this in your extension's console:

```javascript
chrome.runtime.id
```

Or use this helper function to get the redirect URL:

```javascript
chrome.identity.getRedirectURL()
```

## Production Deployment

When publishing to the Chrome Web Store:

1. Your extension ID will change to a permanent ID
2. Update your Privy Dashboard with the new production extension ID
3. Test thoroughly before publishing
4. Document the OAuth flow in your Web Store listing for Google's review process

## Security Notes

- Never commit your Privy App ID to public repositories if it contains sensitive configuration
- Use environment variables for production deployments
- Regularly review your Privy Dashboard access logs
- Keep your manifest.json permissions minimal

## Next Steps

After completing the dashboard configuration:

1. ✅ Build your extension: `npm run build`
2. ✅ Load it in Chrome: `chrome://extensions/`
3. ✅ Test authentication flow
4. ✅ Verify wallet connections work correctly
5. ✅ Test on different websites to ensure compatibility

## Support

If you encounter issues:
- Check [Privy Documentation](https://docs.privy.io)
- Review [Chrome Extension Security Best Practices](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)
- Contact Privy Support through their dashboard
