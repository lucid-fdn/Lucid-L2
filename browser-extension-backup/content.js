// Content Script for Lucid L2™ Extension - Wallet Bridge Implementation
class ContentScript {
    constructor() {
        this.isEnabled = false;
        this.settings = {
            autoProcess: false,
            notifications: true
        };
        this.selectedText = '';
        
        // Wallet bridge state
        this.walletBridge = new WalletBridge();
        this.isWalletReady = false;
        
        this.init();
    }

    async init() {
        await this.loadSettings();
        await this.initializeWalletBridge();
        this.setupEventListeners();
        this.injectScript();
        this.createFloatingButton();
        this.observeTextSelection();
    }

    async initializeWalletBridge() {
        try {
            await this.walletBridge.initialize();
            this.isWalletReady = true;
            console.log('🎯 Wallet bridge initialized successfully');
        } catch (error) {
            console.warn('⚠️ Wallet bridge initialization failed:', error);
            this.isWalletReady = false;
        }
    }

    async loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['settings'], (result) => {
                this.settings = result.settings || { autoProcess: false, notifications: true };
                this.isEnabled = this.settings.autoProcess;
                resolve();
            });
        });
    }

    setupEventListeners() {
        // Listen for messages from background script and popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            // All wallet operations are handled by the wallet bridge
            this.handleWalletMessage(request, sendResponse);
            return true; // Keep the message channel open for async responses
        });

        // Listen for text selection
        document.addEventListener('mouseup', () => {
            this.handleTextSelection();
        });

        // Listen for keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcut(e);
        });

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.settings) {
                this.settings = changes.settings.newValue;
                this.isEnabled = this.settings.autoProcess;
                this.updateFloatingButton();
            }
        });
    }

    handleMessage(request, sender, sendResponse) {
        switch (request.action) {
            case 'processSelectedText':
                this.processSelectedText();
                sendResponse({ success: true });
                break;
            
            case 'getPageInfo':
                sendResponse({
                    title: document.title,
                    url: window.location.href,
                    selectedText: this.getSelectedText()
                });
                break;
            
            case 'highlightText':
                this.highlightText(request.text);
                sendResponse({ success: true });
                break;
            
            case 'toggleAutoProcess':
                this.toggleAutoProcess();
                sendResponse({ success: true });
                break;
                
            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    }

    injectScript() {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injected.js');
        script.onload = function() {
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    }

    createFloatingButton() {
        // Create floating button container
        this.floatingButton = document.createElement('div');
        this.floatingButton.id = 'lucid-l2-floating-button';
        this.floatingButton.innerHTML = `
            <div class="lucid-button-container">
                <div class="lucid-button" id="lucid-process-btn">
                    <img src="${chrome.runtime.getURL('icons/icon16.png')}" alt="Lucid L2™">
                    <span>Process</span>
                </div>
                <div class="lucid-tooltip">Process selected text with Lucid L2™</div>
            </div>
        `;

        // Add styles
        const styles = `
            #lucid-l2-floating-button {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                display: none;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            
            .lucid-button-container {
                position: relative;
            }
            
            .lucid-button {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 8px 12px;
                background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                color: white;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                transition: all 0.2s ease;
            }
            
            .lucid-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
            }
            
            .lucid-button img {
                width: 16px;
                height: 16px;
            }
            
            .lucid-tooltip {
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%);
                margin-top: 8px;
                padding: 6px 8px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                font-size: 12px;
                border-radius: 4px;
                white-space: nowrap;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease;
            }
            
            .lucid-button:hover + .lucid-tooltip {
                opacity: 1;
            }
        `;

        // Inject styles
        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);

        // Add event listener
        this.floatingButton.querySelector('#lucid-process-btn').addEventListener('click', () => {
            this.processSelectedText();
        });

        // Append to body
        document.body.appendChild(this.floatingButton);
    }

    observeTextSelection() {
        let selectionTimeout;
        
        document.addEventListener('mouseup', () => {
            clearTimeout(selectionTimeout);
            selectionTimeout = setTimeout(() => {
                this.handleTextSelection();
            }, 100);
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || 
                e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
                e.shiftKey) {
                clearTimeout(selectionTimeout);
                selectionTimeout = setTimeout(() => {
                    this.handleTextSelection();
                }, 100);
            }
        });
    }

    handleTextSelection() {
        const selectedText = this.getSelectedText();
        
        if (selectedText && selectedText.length > 10) {
            this.selectedText = selectedText;
            this.showFloatingButton();
            
            // Auto-process if enabled
            if (this.isEnabled) {
                this.processSelectedText();
            }
        } else {
            this.hideFloatingButton();
        }
    }

    getSelectedText() {
        const selection = window.getSelection();
        return selection.toString().trim();
    }

    showFloatingButton() {
        if (this.floatingButton) {
            this.floatingButton.style.display = 'block';
        }
    }

    hideFloatingButton() {
        if (this.floatingButton) {
            this.floatingButton.style.display = 'none';
        }
    }

    updateFloatingButton() {
        if (this.floatingButton) {
            const button = this.floatingButton.querySelector('.lucid-button');
            if (this.isEnabled) {
                button.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                button.querySelector('span').textContent = 'Auto';
            } else {
                button.style.background = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
                button.querySelector('span').textContent = 'Process';
            }
        }
    }

    async processSelectedText() {
        const text = this.selectedText || this.getSelectedText();
        if (!text) return;

        try {
            this.showProcessingIndicator();
            
            // Send to background script for processing
            const response = await chrome.runtime.sendMessage({
                action: 'processText',
                text: text
            });

            if (response.success) {
                this.showSuccessIndicator(response.result.earned);
                this.highlightProcessedText(text);
            } else {
                this.showErrorIndicator(response.error);
            }
        } catch (error) {
            this.showErrorIndicator(error.message);
        } finally {
            this.hideFloatingButton();
        }
    }

    showProcessingIndicator() {
        if (this.floatingButton) {
            const button = this.floatingButton.querySelector('.lucid-button');
            button.innerHTML = `
                <div class="lucid-spinner"></div>
                <span>Processing...</span>
            `;
            
            // Add spinner styles
            const spinnerStyles = `
                .lucid-spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-top: 2px solid white;
                    border-radius: 50%;
                    animation: lucid-spin 1s linear infinite;
                }
                
                @keyframes lucid-spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            
            if (!document.querySelector('#lucid-spinner-styles')) {
                const styleSheet = document.createElement('style');
                styleSheet.id = 'lucid-spinner-styles';
                styleSheet.textContent = spinnerStyles;
                document.head.appendChild(styleSheet);
            }
        }
    }

    showSuccessIndicator(earned) {
        if (this.floatingButton) {
            const button = this.floatingButton.querySelector('.lucid-button');
            button.innerHTML = `
                <span>✓</span>
                <span>+${earned} mGas</span>
            `;
            button.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            
            setTimeout(() => {
                this.hideFloatingButton();
            }, 2000);
        }
    }

    showErrorIndicator(error) {
        if (this.floatingButton) {
            const button = this.floatingButton.querySelector('.lucid-button');
            button.innerHTML = `
                <span>✗</span>
                <span>Error</span>
            `;
            button.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
            
            setTimeout(() => {
                this.hideFloatingButton();
            }, 2000);
        }
    }

    highlightProcessedText(text) {
        // Find and highlight the processed text
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes(text)) {
                const parent = node.parentNode;
                const highlightedHTML = node.textContent.replace(
                    text,
                    `<span class="lucid-highlighted-text">${text}</span>`
                );
                parent.innerHTML = parent.innerHTML.replace(
                    node.textContent,
                    highlightedHTML
                );
                break;
            }
        }

        // Add highlight styles
        if (!document.querySelector('#lucid-highlight-styles')) {
            const styles = `
                .lucid-highlighted-text {
                    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                    color: white;
                    padding: 2px 4px;
                    border-radius: 3px;
                    font-weight: 500;
                    animation: lucid-highlight-fade 3s ease-out;
                }
                
                @keyframes lucid-highlight-fade {
                    0% { background: #10b981; }
                    100% { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); }
                }
            `;
            
            const styleSheet = document.createElement('style');
            styleSheet.id = 'lucid-highlight-styles';
            styleSheet.textContent = styles;
            document.head.appendChild(styleSheet);
        }
    }

    highlightText(text) {
        this.highlightProcessedText(text);
    }

    handleKeyboardShortcut(e) {
        // Ctrl+Shift+L or Cmd+Shift+L
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
            e.preventDefault();
            this.processSelectedText();
        }
        
        // Ctrl+Shift+T or Cmd+Shift+T (toggle auto-process)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
            e.preventDefault();
            this.toggleAutoProcess();
        }
    }

    toggleAutoProcess() {
        this.isEnabled = !this.isEnabled;
        this.settings.autoProcess = this.isEnabled;
        
        chrome.storage.local.set({ settings: this.settings });
        this.updateFloatingButton();
        
        // Show notification
        this.showNotification(
            this.isEnabled ? 'Auto-process enabled' : 'Auto-process disabled',
            this.isEnabled ? 'Selected text will be processed automatically' : 'Manual processing only'
        );
    }

    showNotification(title, message) {
        const notification = document.createElement('div');
        notification.className = 'lucid-notification';
        notification.innerHTML = `
            <div class="lucid-notification-content">
                <div class="lucid-notification-title">${title}</div>
                <div class="lucid-notification-message">${message}</div>
            </div>
        `;

        // Add notification styles
        const styles = `
            .lucid-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10001;
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                padding: 16px;
                max-width: 300px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                animation: lucid-notification-slide 0.3s ease-out;
            }
            
            .lucid-notification-title {
                font-size: 14px;
                font-weight: 600;
                color: #1e293b;
                margin-bottom: 4px;
            }
            
            .lucid-notification-message {
                font-size: 12px;
                color: #64748b;
            }
            
            @keyframes lucid-notification-slide {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;

        if (!document.querySelector('#lucid-notification-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'lucid-notification-styles';
            styleSheet.textContent = styles;
            document.head.appendChild(styleSheet);
        }

        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Central wallet message handler
    async handleWalletMessage(request, sendResponse) {
        if (!this.isWalletReady && request.action !== 'checkWallet') {
            sendResponse({
                success: false,
                error: 'Wallet bridge not ready',
                code: 'BRIDGE_NOT_READY'
            });
            return;
        }

        try {
            let result;
            
            switch (request.action) {
                case 'checkWallet':
                    result = await this.walletBridge.checkWalletAvailability();
                    break;
                    
                case 'connectWallet':
                    result = await this.walletBridge.connectWallet();
                    break;
                    
                case 'disconnectWallet':
                    result = await this.walletBridge.disconnectWallet();
                    break;
                    
                case 'getWalletBalance':
                    result = await this.walletBridge.getWalletBalance();
                    break;
                    
                case 'signTransaction':
                    result = await this.walletBridge.signTransaction(request.transaction);
                    break;
                    
                case 'signMessage':
                    result = await this.walletBridge.signMessage(request.message);
                    break;
                    
                default:
                    // Handle non-wallet messages
                    this.handleMessage(request, null, sendResponse);
                    return;
            }
            
            sendResponse(result);
            
        } catch (error) {
            console.error('❌ Wallet operation failed:', error);
            sendResponse({
                success: false,
                error: error.message,
                code: 'WALLET_OPERATION_FAILED'
            });
        }
    }
}

// Wallet Bridge Class - Handles all wallet operations in web page context
class WalletBridge {
    constructor() {
        this.wallet = null;
        this.connection = null;
        this.isConnected = false;
        this.config = {
            rpcUrl: 'https://api.devnet.solana.com',
            commitment: 'confirmed',
            lucidMint: 'Au343oxp5p17kLHAKUvf4HEqzDtTeFRdmetfzby7wJJM'
        };
        this.balance = { sol: 0, lucid: 0, mGas: 0 };
        this.isPhantomAvailable = false;
    }

    async initialize() {
        console.log('🔧 Initializing wallet bridge...');
        
        // Wait for page to load and Phantom to be available
        await this.waitForPhantom();
        
        // Check if already connected
        await this.checkExistingConnection();
        
        // Set up wallet event listeners
        this.setupWalletEventListeners();
        
        console.log('✅ Wallet bridge initialized');
    }

    async waitForPhantom(timeout = 5000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            
            const checkPhantom = () => {
                if (window.solana && window.solana.isPhantom) {
                    console.log('👻 Phantom wallet detected');
                    this.isPhantomAvailable = true;
                    resolve();
                    return;
                }
                
                if (Date.now() - start > timeout) {
                    console.warn('⏰ Timeout waiting for Phantom wallet');
                    this.isPhantomAvailable = false;
                    resolve(); // Don't reject, just continue without Phantom
                    return;
                }
                
                setTimeout(checkPhantom, 100);
            };
            
            checkPhantom();
        });
    }

    async checkExistingConnection() {
        if (!this.isPhantomAvailable) return;
        
        try {
            if (window.solana.isConnected) {
                this.wallet = {
                    address: window.solana.publicKey.toString(),
                    publicKey: window.solana.publicKey
                };
                this.isConnected = true;
                console.log('🔗 Found existing wallet connection:', this.wallet.address);
                
                // Update balances
                await this.updateBalances();
            }
        } catch (error) {
            console.warn('⚠️ Error checking existing connection:', error);
        }
    }

    setupWalletEventListeners() {
        if (!this.isPhantomAvailable) return;
        
        window.solana.on('connect', (publicKey) => {
            console.log('🔗 Wallet connected:', publicKey.toString());
            this.wallet = {
                address: publicKey.toString(),
                publicKey: publicKey
            };
            this.isConnected = true;
            this.updateBalances();
        });

        window.solana.on('disconnect', () => {
            console.log('🔌 Wallet disconnected');
            this.wallet = null;
            this.isConnected = false;
            this.balance = { sol: 0, lucid: 0, mGas: 0 };
        });

        window.solana.on('accountChanged', (publicKey) => {
            if (publicKey) {
                console.log('👤 Account changed:', publicKey.toString());
                this.wallet = {
                    address: publicKey.toString(),
                    publicKey: publicKey
                };
                this.updateBalances();
            } else {
                this.wallet = null;
                this.isConnected = false;
                this.balance = { sol: 0, lucid: 0, mGas: 0 };
            }
        });
    }

    async checkWalletAvailability() {
        console.log('🔍 Checking wallet availability...');
        
        return {
            success: true,
            available: this.isPhantomAvailable,
            connected: this.isConnected,
            publicKey: this.wallet?.address || null,
            network: 'devnet'
        };
    }

    async connectWallet() {
        console.log('🔗 Attempting to connect wallet...');
        
        try {
            if (!this.isPhantomAvailable) {
                throw new Error('Phantom wallet not found. Please install Phantom wallet extension.');
            }

            console.log('📱 Requesting wallet connection...');
            const response = await window.solana.connect();
            
            this.wallet = {
                address: response.publicKey.toString(),
                publicKey: response.publicKey
            };
            this.isConnected = true;
            
            console.log('✅ Wallet connected successfully:', this.wallet.address);
            
            // Initialize connection to devnet
            await this.initializeConnection();
            
            // Update balances
            await this.updateBalances();
            
            return {
                success: true,
                wallet: this.wallet,
                balance: this.balance,
                network: 'devnet'
            };
            
        } catch (error) {
            console.error('❌ Wallet connection failed:', error);
            
            // Categorize error for better user experience
            let errorMessage = error.message;
            let errorCode = 'CONNECTION_FAILED';
            
            if (error.message.includes('User rejected')) {
                errorMessage = 'Connection cancelled by user';
                errorCode = 'USER_REJECTED';
            } else if (error.message.includes('wallet not found')) {
                errorMessage = 'Phantom wallet not found. Please install Phantom wallet.';
                errorCode = 'WALLET_NOT_FOUND';
            }
            
            return {
                success: false,
                error: errorMessage,
                code: errorCode,
                recoverable: true
            };
        }
    }

    async disconnectWallet() {
        console.log('🔌 Disconnecting wallet...');
        
        try {
            if (this.isPhantomAvailable && window.solana.isConnected) {
                await window.solana.disconnect();
            }
            
            this.wallet = null;
            this.isConnected = false;
            this.balance = { sol: 0, lucid: 0, mGas: 0 };
            this.connection = null;
            
            console.log('✅ Wallet disconnected successfully');
            
            return {
                success: true
            };
            
        } catch (error) {
            console.error('❌ Wallet disconnection failed:', error);
            return {
                success: false,
                error: error.message,
                code: 'DISCONNECTION_FAILED'
            };
        }
    }

    async getWalletBalance() {
        console.log('💰 Getting wallet balance...');
        
        try {
            if (!this.isConnected || !this.wallet) {
                throw new Error('Wallet not connected');
            }
            
            await this.updateBalances();
            
            return {
                success: true,
                balance: this.balance,
                wallet: this.wallet,
                connected: true
            };
            
        } catch (error) {
            console.error('❌ Error getting wallet balance:', error);
            return {
                success: false,
                error: error.message,
                code: 'BALANCE_QUERY_FAILED'
            };
        }
    }

    async initializeConnection() {
        try {
            // Load Solana web3.js if not already loaded
            if (typeof window.solanaWeb3 === 'undefined') {
                console.log('📦 Loading Solana web3.js...');
                await this.loadSolanaWeb3();
            }
            
            this.connection = new window.solanaWeb3.Connection(
                this.config.rpcUrl,
                this.config.commitment
            );
            
            console.log('🌐 Connected to Solana devnet');
            
        } catch (error) {
            console.error('❌ Failed to initialize connection:', error);
            throw error;
        }
    }

    async loadSolanaWeb3() {
        return new Promise((resolve, reject) => {
            if (typeof window.solanaWeb3 !== 'undefined') {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('solana-web3.js');
            script.onload = () => {
                console.log('✅ Solana web3.js loaded');
                resolve();
            };
            script.onerror = () => {
                console.error('❌ Failed to load Solana web3.js');
                reject(new Error('Failed to load Solana web3.js'));
            };
            
            document.head.appendChild(script);
        });
    }

    async updateBalances() {
        if (!this.connection || !this.wallet) return;
        
        try {
            console.log('🔄 Updating wallet balances...');
            
            // Get SOL balance
            const solBalance = await this.connection.getBalance(this.wallet.publicKey);
            this.balance.sol = solBalance / 1e9; // Convert lamports to SOL
            
            // Get LUCID token balance
            try {
                const lucidBalance = await this.getLucidTokenBalance();
                this.balance.lucid = lucidBalance;
            } catch (error) {
                console.log('📝 LUCID token account not found (this is normal for new wallets)');
                this.balance.lucid = 0;
            }
            
            // Get mGas balance from extension storage
            const mGasBalance = await this.getMGasBalance();
            this.balance.mGas = mGasBalance;
            
            console.log('💰 Balances updated:', this.balance);
            
        } catch (error) {
            console.error('❌ Failed to update balances:', error);
        }
    }

    async getLucidTokenBalance() {
        if (!this.connection || !this.wallet) return 0;
        
        try {
            // For now, just return 0 - real token balance requires SPL token utilities
            // This can be enhanced later with proper token account queries
            console.log('📝 LUCID token balance query skipped (requires SPL token utilities)');
            return 0;
            
        } catch (error) {
            console.log('📝 LUCID token account not found or balance is 0');
            return 0;
        }
    }

    async getMGasBalance() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(['mGasBalance'], (result) => {
                    resolve(result.mGasBalance || 0);
                });
            } else {
                resolve(0);
            }
        });
    }

    async signTransaction(transaction) {
        console.log('✍️ Signing transaction...');
        
        try {
            if (!this.isConnected || !this.wallet) {
                throw new Error('Wallet not connected');
            }
            
            if (!this.isPhantomAvailable) {
                throw new Error('Phantom wallet not available');
            }
            
            const signedTransaction = await window.solana.signTransaction(transaction);
            
            return {
                success: true,
                signedTransaction: signedTransaction
            };
            
        } catch (error) {
            console.error('❌ Transaction signing failed:', error);
            return {
                success: false,
                error: error.message,
                code: 'SIGNING_FAILED'
            };
        }
    }

    async signMessage(message) {
        console.log('✍️ Signing message...');
        
        try {
            if (!this.isConnected || !this.wallet) {
                throw new Error('Wallet not connected');
            }
            
            if (!this.isPhantomAvailable) {
                throw new Error('Phantom wallet not available');
            }
            
            const signedMessage = await window.solana.signMessage(message);
            
            return {
                success: true,
                signedMessage: signedMessage
            };
            
        } catch (error) {
            console.error('❌ Message signing failed:', error);
            return {
                success: false,
                error: error.message,
                code: 'SIGNING_FAILED'
            };
        }
    }
}

// Ensure DOM is ready before initializing
function initializeWhenReady() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeContentScript);
    } else {
        initializeContentScript();
    }
}

async function initializeContentScript() {
    try {
        console.log('🚀 Lucid L2™ Content Script initializing...');
        
        // Initialize content script
        const contentScript = new ContentScript();
        
        // Make contentScript globally accessible for debugging
        window.lucidContentScript = contentScript;
        
        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
            // Clean up any resources
            if (contentScript.floatingButton) {
                contentScript.floatingButton.remove();
            }
        });
        
        console.log('✅ Lucid L2™ Content Script initialized successfully');
        
    } catch (error) {
        console.error('❌ Failed to initialize Lucid L2™ Content Script:', error);
    }
}

// Start initialization
initializeWhenReady();
