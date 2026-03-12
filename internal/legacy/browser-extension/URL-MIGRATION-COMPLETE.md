# Browser Extension URL Migration - Complete

## Migration Summary

Successfully migrated the Lucid browser extension from the test URL to the production URL.

**Date:** November 5, 2025  
**Status:** ✅ COMPLETE

---

## URL Changes

### Previous Configuration (Test)
- **Base URL:** `https://lucid.r2s-cyberdefense.fr`
- **Auth Route:** `/api/wallets/auth`
- **Full Auth URL:** `https://lucid.r2s-cyberdefense.fr/api/wallets/auth`

### New Configuration (Production)
- **Base URL:** `https://www.lucid.foundation`
- **Auth Route:** `/test/auth`
- **Full Auth URL:** `https://www.lucid.foundation/test/auth`

---

## Files Modified

### 1. manifest.json
**Changes:**
- Added `https://www.lucid.foundation/*` to `host_permissions` array
- Added `https://www.lucid.foundation/*` to `externally_connectable.matches` array
- Kept old test URL in both arrays for backwards compatibility during transition
- **Critical:** Both URLs must remain in `externally_connectable.matches` for `chrome.runtime.sendMessage()` to work from auth pages

**Location:** `Lucid-L2/browser-extension/manifest.json`

### 2. background.js
**Changes:**
- Updated auth tab URL: `https://www.lucid.foundation/test/auth?extension_id=${extensionId}`
- Updated `LUCID_API_BASE` constant: `https://www.lucid.foundation`

**Location:** `Lucid-L2/browser-extension/background.js`

### 3. content.js
**Changes:**
- Updated `LUCID_API_BASE` constant: `https://www.lucid.foundation`

**Location:** `Lucid-L2/browser-extension/content.js`

### 4. privy-api-bridge.js
**Changes:**
- Updated `apiUrl` property: `https://www.lucid.foundation`

**Location:** `Lucid-L2/browser-extension/privy-api-bridge.js`

---

## Migration Strategy

### Dual-Support Approach
We implemented a dual-support strategy that:
1. **Adds** the new production URL without removing the test URL
2. **Updates** all API calls to use the new production URL
3. **Maintains** backwards compatibility during the transition period
4. **Allows** for future removal of the test URL once fully migrated

### Benefits
- ✅ No disruption to existing users
- ✅ Seamless transition to production
- ✅ Easy rollback if needed
- ✅ Test and production can coexist temporarily

---

## Testing Checklist

Before deploying to users, verify:

- [ ] Extension loads without errors
- [ ] "Connect Wallet" button opens new auth page at `https://www.lucid.foundation/test/auth`
- [ ] Privy authentication flow completes successfully
- [ ] API calls to `/run` endpoint succeed
- [ ] Wallet disconnection works properly
- [ ] Browser console shows no CORS or permission errors
- [ ] Chrome extension permissions dialog shows new domain

---

## Deployment Steps

### 1. Build Extension
```bash
cd Lucid-L2/browser-extension
# Build if needed (depends on your build process)
```

### 2. Test Locally
- Load unpacked extension in Chrome
- Test all authentication and API functionality
- Verify no console errors

### 3. Update Extension Store
- Increment version number in `manifest.json` if publishing
- Create new build/package
- Submit to Chrome Web Store

### 4. Backend Verification
Ensure the backend at `https://www.lucid.foundation` properly handles:
- `/test/auth` route (serves auth frontend)
- `/run` endpoint (processes thoughts)
- CORS headers for `chrome-extension://` origins
- `externally_connectable` communication

---

## Rollback Plan

If issues occur, rollback is simple:

### Option 1: Revert Files
```bash
cd Lucid-L2/browser-extension
git checkout HEAD~1 manifest.json background.js content.js privy-api-bridge.js
```

### Option 2: Quick Fix
Change all instances of:
- `https://www.lucid.foundation` → `https://lucid.r2s-cyberdefense.fr`
- `/test/auth` → `/api/wallets/auth`

---

## Important Notes

### Critical: externally_connectable
The `externally_connectable.matches` array in manifest.json **must** include both domains:
- `https://lucid.r2s-cyberdefense.fr/*`
- `https://www.lucid.foundation/*`

This allows the auth-frontend (served from either URL) to communicate with the extension using `chrome.runtime.sendMessage(extensionId, ...)`. Without this, authentication will fail silently as messages won't be received by the extension.

### Backend Requirements
The production backend at `https://www.lucid.foundation` must:
1. Host the auth-frontend at `/test/auth`
2. Serve static assets from `/test/auth/assets/*`
3. Handle API requests at `/run` and other endpoints
4. Support `chrome-extension://` origins in CORS
5. Allow `runtime.sendMessageExternal` from extension

### Extension ID
The extension ID is passed as a query parameter:
```
https://www.lucid.foundation/test/auth?extension_id=${chrome.runtime.id}
```

This allows the backend to communicate with the specific extension instance.

### Environment Variables
No environment variables in the extension need changing. The extension operates independently of the backend's environment configuration.

---

## Next Steps

### Optional Cleanup (Future)
After confirming production is stable:
1. Remove `https://lucid.r2s-cyberdefense.fr/*` from `host_permissions`
2. Remove `https://lucid.r2s-cyberdefense.fr/*` from `externally_connectable.matches`
3. Update version number to reflect the cleanup
4. Update any documentation referencing the old URL

### Documentation Updates
Consider updating:
- User-facing documentation
- Developer setup guides
- API integration examples
- README files

---

## Support

If issues arise:
1. Check browser console for errors
2. Verify backend is responding at new URL
3. Check Chrome extension permissions
4. Test with `chrome://extensions` developer mode enabled
5. Review network tab for failed requests

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Nov 5, 2025 | Initial production URL migration |

---

**Migration completed successfully! 🎉**
