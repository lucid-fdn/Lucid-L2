// Solana Web3.js CDN loader for browser extension
// This file loads the Solana Web3.js library from CDN for browser extension use

(function() {
    // Check if solanaWeb3 is already loaded
    if (typeof window.solanaWeb3 !== 'undefined') {
        console.log('🌐 Solana Web3.js already loaded');
        return;
    }

    // Create and load the Solana Web3.js script
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@solana/web3.js@latest/lib/index.iife.min.js';
    script.onload = function() {
        console.log('🌐 Solana Web3.js loaded successfully');
        
        // Ensure solanaWeb3 is available globally
        if (typeof solanaWeb3 !== 'undefined') {
            window.solanaWeb3 = solanaWeb3;
            
            // Dispatch event to notify that Solana Web3.js is ready
            window.dispatchEvent(new CustomEvent('solanaWeb3Ready'));
        } else {
            console.error('❌ Failed to load Solana Web3.js');
        }
    };
    
    script.onerror = function() {
        console.error('❌ Failed to load Solana Web3.js from CDN');
        
        // Fallback: create minimal compatibility layer
        window.solanaWeb3 = {
            Connection: class MockConnection {
                constructor(url) {
                    this.url = url;
                }
                async getBalance() { return 0; }
                async getTokenAccountBalance() { return { value: { uiAmount: 0 } }; }
            },
            PublicKey: class MockPublicKey {
                constructor(key) {
                    this.key = key;
                }
                toString() { return this.key; }
            },
            getAssociatedTokenAddress: async () => ({ toString: () => 'mock-address' })
        };
        
        console.log('🔄 Using fallback Solana Web3.js compatibility layer');
        window.dispatchEvent(new CustomEvent('solanaWeb3Ready'));
    };
    
    document.head.appendChild(script);
})();
