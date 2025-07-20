// Content Script for Lucid L2™ Extension
class ContentScript {
    constructor() {
        this.isEnabled = false;
        this.settings = {
            autoProcess: false,
            notifications: true
        };
        this.selectedText = '';
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        this.injectScript();
        this.createFloatingButton();
        this.observeTextSelection();
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
            // Handle wallet-related messages from popup
            if (request.action === 'checkWallet') {
                this.checkWalletAvailability(sendResponse);
                return true;
            }
            
            if (request.action === 'connectWallet') {
                this.connectWallet(sendResponse);
                return true;
            }
            
            if (request.action === 'disconnectWallet') {
                this.disconnectWallet(sendResponse);
                return true;
            }
            
            if (request.action === 'getWalletBalance') {
                this.getWalletBalance(sendResponse);
                return true;
            }
            
            // Handle other messages
            this.handleMessage(request, sender, sendResponse);
            return true;
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

    // Wallet methods that can access window.solana
    async checkWalletAvailability(sendResponse) {
        console.log('🔍 Checking wallet availability...');
        try {
            const isAvailable = !!(window.solana && window.solana.isPhantom);
            const isConnected = window.solana ? window.solana.isConnected : false;
            
            console.log('📋 Wallet status:', { isAvailable, isConnected });
            
            sendResponse({
                success: true,
                available: isAvailable,
                connected: isConnected,
                publicKey: isConnected ? window.solana.publicKey?.toString() : null
            });
        } catch (error) {
            console.error('❌ Error checking wallet availability:', error);
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }

    async connectWallet(sendResponse) {
        console.log('🔗 Attempting to connect wallet...');
        try {
            // Wait for solana object to be available
            await this.waitForSolana();
            
            if (!window.solana || !window.solana.isPhantom) {
                throw new Error('Phantom wallet not found. Please install Phantom wallet.');
            }

            console.log('📱 Phantom wallet found, requesting connection...');
            const response = await window.solana.connect();
            console.log('✅ Wallet connected:', response.publicKey.toString());
            
            sendResponse({
                success: true,
                wallet: {
                    address: response.publicKey.toString(),
                    publicKey: response.publicKey
                }
            });
        } catch (error) {
            console.error('❌ Wallet connection failed:', error);
            sendResponse({
                success: false,
                error: error.message,
                title: 'Connection Failed'
            });
        }
    }

    async disconnectWallet(sendResponse) {
        console.log('🔌 Disconnecting wallet...');
        try {
            if (window.solana && window.solana.isConnected) {
                await window.solana.disconnect();
                console.log('✅ Wallet disconnected');
            }
            
            sendResponse({
                success: true
            });
        } catch (error) {
            console.error('❌ Wallet disconnection failed:', error);
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }

    async getWalletBalance(sendResponse) {
        console.log('💰 Getting wallet balance...');
        try {
            if (!window.solana || !window.solana.isConnected) {
                throw new Error('Wallet not connected');
            }

            // For now, just return connected state
            // Real balance queries would need to be implemented with proper RPC calls
            sendResponse({
                success: true,
                balance: {
                    sol: 0,
                    lucid: 0,
                    mGas: 0
                },
                connected: true
            });
        } catch (error) {
            console.error('❌ Error getting wallet balance:', error);
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }

    // Helper method to wait for Solana wallet to be available
    async waitForSolana(timeout = 3000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            
            const checkSolana = () => {
                if (window.solana && window.solana.isPhantom) {
                    console.log('🎯 Solana wallet detected');
                    resolve();
                    return;
                }
                
                if (Date.now() - start > timeout) {
                    reject(new Error('Timeout waiting for Solana wallet'));
                    return;
                }
                
                setTimeout(checkSolana, 100);
            };
            
            checkSolana();
        });
    }
}

// Initialize content script
const contentScript = new ContentScript();

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    // Clean up any resources
    if (contentScript.floatingButton) {
        contentScript.floatingButton.remove();
    }
});
