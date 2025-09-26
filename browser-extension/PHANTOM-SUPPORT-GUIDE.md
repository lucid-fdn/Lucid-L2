# Phantom Wallet Support via Privy - Testing Guide

## ✅ **Phantom Support Confirmed**

The `toSolanaWalletConnectors()` function in Privy automatically includes:
- **Phantom** (primary Solana wallet)
- **Solflare** 
- **Backpack**
- **Glow**
- **Other major Solana wallets**

## **Testing Phantom Connection**

### **Step 1: Load Extension**
```bash
# 1. Open Chrome
# 2. Go to chrome://extensions/
# 3. Enable "Developer mode" (top right)
# 4. Click "Load unpacked"
# 5. Select the browser-extension folder
```

### **Step 2: Test Phantom Connection**
1. **Ensure Phantom is installed**: Install from https://phantom.app if needed
2. **Navigate to any website**: e.g., https://google.com
3. **Click Lucid Extension icon** (in browser toolbar)
4. **Click "Connect Wallet"**
5. **Privy login popup opens** - Look for Solana wallet options
6. **Select Phantom** from the available Solana wallets

### **Expected Behavior:**
- Privy popup shows multiple wallet options
- Solana section includes Phantom, Solflare, etc.
- Phantom wallet connects and shows devnet address
- Extension displays real SOL and LUCID balances

## **If You See MetaMask Instead of Phantom**

### **Possible Causes:**
1. **Phantom not installed** - Install from https://phantom.app
2. **Privy showing EVM first** - Scroll down to see Solana wallets
3. **Extension not loaded properly** - Reload extension

### **Solution:**
```bash
# Ensure Phantom is installed and enabled
# Look for "Solana" section in Privy login popup
# Phantom should appear under Solana wallets
```

## **Verification Steps**

### **1. Check Wallet Type in Console:**
When connected, check browser console:
```javascript
// Should show Solana wallet info
console.log(window.privyAPIBridge.getWalletInfo());
// Expected output:
// {
//   address: "PHANTOM_ADDRESS_HERE",
//   solanaAddress: "PHANTOM_ADDRESS_HERE", 
//   walletType: "phantom" or "solana",
//   network: "devnet"
// }
```

### **2. Test Thought Processing:**
1. Enter text in extension popup
2. Click "Process Thought" 
3. Should see transaction on devnet
4. Check console for transaction details

### **3. Verify Devnet Transaction:**
```bash
# Transaction should appear at:
# https://explorer.solana.com/tx/SIGNATURE_HERE?cluster=devnet
```

## **Current Configuration**

### **Privy Config (Updated):**
```javascript
externalWallets: {
  solana: {
    connectors: toSolanaWalletConnectors() // Includes Phantom by default
  },
}
```

### **Available Wallets:**
- ✅ **Phantom** (primary target)
- ✅ **Solflare** 
- ✅ **Backpack**
- ✅ **Glow**
- ✅ **Other Solana wallets**

## **Troubleshooting**

### **If Phantom doesn't appear:**
1. **Check Phantom installation**: Go to https://phantom.app
2. **Refresh browser**: Reload the webpage
3. **Reload extension**: Chrome extensions → reload Lucid Extension
4. **Check browser console**: Look for any errors

### **If connection fails:**
1. **Approve Phantom connection**: Allow site access in Phantom
2. **Switch to devnet**: Phantom → Settings → Developer Settings → Network → Devnet
3. **Fund wallet**: Get devnet SOL from https://faucet.solana.com

## **Expected User Flow**

```
1. Click Extension → Connect Wallet
2. Privy popup opens with wallet options
3. Select Phantom from Solana section
4. Phantom prompts for approval → Approve
5. Extension shows real devnet balances
6. Enter thought → Process → Real devnet transaction
7. View transaction on Solana Explorer (devnet)
```

## **Important Notes**

- **Phantom Auto-Detection**: Privy automatically detects installed Solana wallets
- **Devnet Network**: Ensure Phantom is set to devnet for testing
- **Real Transactions**: All transactions are real on Solana devnet
- **Gas Costs**: Uses real LUCID tokens for gas (6 LUCID per thought)

The extension is ready for Phantom testing on devnet! 🚀
