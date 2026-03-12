// MetaMask direct connection bridge - bypasses CSP issues
(function mount() {
  console.log("Bridge: MetaMask direct connection bridge loaded");
  
  const onMessage = async (e: MessageEvent) => {
    if (e.source !== window) return;
    if (e.data?.type === "PRIVY_CONNECT_METAMASK") {
      try {
        console.log("Bridge: Received PRIVY_CONNECT_METAMASK message");
        
        // Check if MetaMask is available
        if (typeof window.ethereum === 'undefined') {
          throw new Error("MetaMask not detected. Please install MetaMask extension.");
        }
        
        console.log("Bridge: MetaMask detected, requesting account access");
        
        // Request account access
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        
        if (!accounts || accounts.length === 0) {
          throw new Error("No accounts found. Please unlock MetaMask.");
        }
        
        // Get chain ID
        const chainId = await window.ethereum.request({ 
          method: 'eth_chainId' 
        });
        
        const payload = {
          // Direct MetaMask connection info
          address: accounts[0],
          chainId: parseInt(chainId, 16),
          walletType: 'metamask',
          // These will be handled by Privy in extension context
          userId: null,
          solanaAddress: null,
          solanaWalletType: null,
          walletCount: 1,
          // Flag to indicate this came from direct MetaMask connection
          directConnect: true
        };
        
        console.log("Bridge: Sending METAMASK_CONNECTED with payload:", payload);
        window.postMessage({
          type: "METAMASK_CONNECTED",
          payload
        }, "*");
        
      } catch (err: any) {
        console.error("Bridge: Error connecting to MetaMask:", err);
        window.postMessage({ 
          type: "PRIVY_ERROR", 
          error: err?.message || String(err) 
        }, "*");
      }
    }
  };
  
  window.addEventListener("message", onMessage);
})();
