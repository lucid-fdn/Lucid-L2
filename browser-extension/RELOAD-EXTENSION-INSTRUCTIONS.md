# How to Reload Extension After Code Changes

## 🔄 **CRITICAL: Extension Must Be Reloaded**

After fixing the endpoints in `content.js`, you **MUST** reload the extension for changes to take effect. Chrome caches extension code.

## **Step-by-Step Reload Process**

### **1. Reload Extension**
```
1. Open Chrome
2. Go to chrome://extensions/
3. Find "Lucid-Extension" 
4. Click the RELOAD button (circular arrow icon)
5. Extension will reload with new code
```

### **2. Refresh ChatGPT Page**
```
1. Go back to ChatGPT tab
2. Press F5 or Ctrl+R to refresh
3. This reloads the content script with new endpoints
```

### **3. Test Connection**
```
1. Look at browser console (F12 → Console)
2. Should see new API calls to correct endpoints:
   - /agents/init (instead of /mmr/agents)
   - /run (instead of /inference)
```

## **Available Endpoints on Backend**

**✅ Working Endpoints**:
- `POST /run` - Process single thought 
- `POST /batch` - Process multiple thoughts
- `GET /agents` - List agents (optional)
- `POST /agents/init` - Initialize agent (optional)

**❌ Non-existent Endpoints** (were causing 401 errors):
- `/mmr/agents` - FIXED to `/agents/init`
- `/inference` - FIXED to `/run`

## **Test After Reload**

### **Method 1: Check Console**
After reloading extension and refreshing ChatGPT:
1. Open browser console (F12)
2. Look for API calls to `172.28.35.139:3001`
3. Should see `/run` or `/agents/init` calls
4. No more 401 errors

### **Method 2: Extension Popup**
1. Click extension icon
2. Try "Connect Wallet" 
3. Should connect without console errors

### **Method 3: Direct Test**
Open: `browser-extension/test-api-connection.html`
- Should show successful API connection
- Confirms backend is reachable

## **What Should Happen After Reload**

**✅ Expected Results**:
- No more 401 errors in console
- API calls to correct endpoints (`/run`, `/agents/init`)
- Extension can communicate with WSL backend
- Real transactions on Solana devnet

**🚨 If Still Not Working**:
1. **Double-check reload**: Make sure you clicked reload button on extension
2. **Hard refresh**: Ctrl+Shift+R on ChatGPT page
3. **Check server**: Ensure `npm start` is still running in WSL
4. **Test direct API**: Use test page to confirm backend works

## **Current Configuration**

**Backend**: ✅ Running on `http://172.28.35.139:3001`
**Extension**: ✅ Updated to use correct WSL IP
**Endpoints**: ✅ Fixed to match actual API
**CORS**: ✅ Enabled for cross-origin requests

**Next Step**: RELOAD the extension now! 🔄
