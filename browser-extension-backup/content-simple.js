// Simple Content Script for Phantom Wallet Connection
// This script focuses solely on Phantom wallet integration without extra complexity

console.log('🚀 Simple Phantom wallet bridge loading...');

// Simple wallet connection handler
class SimplePhantomBridge {
    constructor() {
        this.isReady = false;
        this.init();
    }

    async init() {
        try {
            // Wait for Phantom wallet
            await this.waitForPhantom(10000); // 10 second timeout
            this.isReady = true;
            console.log('✅ Simple Phantom bridge ready');
        } catch (error) {
            console.log('⚠️ Phantom not available:', error.message);
        }
    }

    async waitForPhantom(timeout = 15000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            
            const check = () => {
                // Multiple detection methods for better reliability
                const hasSolana = typeof window.solana !== 'undefined';
                const isPhantom = hasSolana && window.solana.isPhantom;
                const hasPhantomProvider = hasSolana && window.solana.isPhantom === true;
                
                console.log('🔍 Phantom detection check:', {
                    hasSolana,
                    isPhantom,
                    hasPhantomProvider,
                    solanaObject: window.solana
                });
                
                if (hasPhantomProvider || isPhantom) {
                    console.log('👻 Phantom detected successfully!');
                    resolve();
                    return;
                }
                
                if (Date.now() - start > timeout) {
                    console.log('⏰ Phantom detection timeout. Final check:', {
                        windowSolana: typeof window.solana,
                        solanaKeys: window.solana ? Object.keys(window.solana) : 'none',
                        isPhantom: window.solana?.isPhantom
                    });
                    reject(new Error('Phantom wallet not found. Please ensure Phantom is unlocked and refresh the page.'));
                    return;
                }
                
                setTimeout(check, 300); // Check every 300ms for faster detection
            };
            
            // Start checking immediately and also check after a short delay
            check();
            setTimeout(check, 100);
        });
    }

    async connectWallet() {
        try {
            // Re-check for Phantom at connection time in case it loaded after our init
            console.log('🔍 Re-checking for Phantom at connection time...');
            console.log('Current window.solana:', {
                exists: typeof window.solana !== 'undefined',
                isPhantom: window.solana?.isPhantom,
                keys: window.solana ? Object.keys(window.solana) : 'none'
            });

            // Try to wait a bit more for Phantom if not detected
            if (!window.solana || !window.solana.isPhantom) {
                console.log('⏳ Phantom not immediately available, waiting 3 seconds...');
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                console.log('🔍 After waiting, window.solana:', {
                    exists: typeof window.solana !== 'undefined',
                    isPhantom: window.solana?.isPhantom,
                    keys: window.solana ? Object.keys(window.solana) : 'none'
                });
            }

            if (!window.solana || !window.solana.isPhantom) {
                throw new Error('Phantom wallet not detected. Please ensure Phantom extension is installed and unlocked, then refresh the page.');
            }

            console.log('🔗 Connecting to Phantom...');
            const response = await window.solana.connect();
            
            const wallet = {
                address: response.publicKey.toString(),
                publicKey: response.publicKey
            };

            console.log('✅ Wallet connected:', wallet.address);

            return {
                success: true,
                wallet: wallet,
                balance: { sol: 0, lucid: 0 }, // Simplified - no balance query for now
                network: 'devnet'
            };

        } catch (error) {
            console.error('❌ Connection failed:', error);
            
            let errorCode = 'CONNECTION_FAILED';
            if (error.message.includes('User rejected')) {
                errorCode = 'USER_REJECTED';
            } else if (error.message.includes('not detected') || error.message.includes('not found')) {
                errorCode = 'WALLET_NOT_FOUND';
            }

            return {
                success: false,
                error: error.message,
                code: errorCode
            };
        }
    }

    async checkWallet() {
        const isAvailable = window.solana && window.solana.isPhantom;
        const isConnected = isAvailable && window.solana.isConnected;
        
        return {
            success: true,
            available: isAvailable,
            connected: isConnected,
            publicKey: isConnected ? window.solana.publicKey.toString() : null
        };
    }

    async disconnectWallet() {
        try {
            if (window.solana && window.solana.isConnected) {
                await window.solana.disconnect();
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Create bridge instance
const phantomBridge = new SimplePhantomBridge();

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Received message:', request.action);
    
    (async () => {
        try {
            let result;
            
            switch (request.action) {
                case 'getPageInfo':
                    result = { title: document.title, url: location.href };
                    break;
                    
                case 'checkWallet':
                    result = await phantomBridge.checkWallet();
                    break;
                    
                case 'connectWallet':
                    result = await phantomBridge.connectWallet();
                    break;
                    
                case 'disconnectWallet':
                    result = await phantomBridge.disconnectWallet();
                    break;
                    
                default:
                    result = { success: false, error: 'Unknown action: ' + request.action };
            }
            
            console.log('📤 Sending response:', result);
            sendResponse(result);
            
        } catch (error) {
            console.error('❌ Message handler error:', error);
            sendResponse({
                success: false,
                error: error.message,
                code: 'MESSAGE_HANDLER_ERROR'
            });
        }
    })();
    
    return true; // Keep message channel open for async response
});

console.log('✅ Simple Phantom bridge message handler ready');
