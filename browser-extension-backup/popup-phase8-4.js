// Phase 8.4 - Real Wallet Integration for Devnet
// Enhanced popup.js with real Phantom wallet connection and devnet transaction handling

// Phase 8.4 Configuration Manager Integration
class Phase84ConfigManager {
    constructor() {
        this.environments = {
            localnet: {
                rpcUrl: 'http://localhost:8899',
                commitment: 'processed',
                programId: 'J1JNYJB41UeyyR3qYFjwxZ2RsD71JRm3ULYZG6bLhm3c',
                lucidMint: '896Ep1k112jJ7Lzry6morQaVJgi9pkq1NWeU9TzjbJqT'
            },
            devnet: {
                rpcUrl: 'https://api.devnet.solana.com',
                commitment: 'confirmed',
                programId: 'DEVNET_PROGRAM_ID_PLACEHOLDER',
                lucidMint: 'DEVNET_MINT_ADDRESS_PLACEHOLDER'
            }
        };
        
        this.currentEnvironment = 'devnet'; // Default to devnet for Phase 8.4
    }

    setEnvironment(env) {
        if (!this.environments[env]) {
            throw new Error(`Invalid environment: ${env}`);
        }
        this.currentEnvironment = env;
    }

    getConfig() {
        return {
            ...this.environments[this.currentEnvironment],
            environment: this.currentEnvironment
        };
    }

    isDevnet() {
        return this.currentEnvironment === 'devnet';
    }
}

// Enhanced Extension State with Real Wallet Integration
class ExtensionState {
    constructor() {
        // Initialize configuration manager
        this.configManager = new Phase84ConfigManager();
        
        // Initialize wallet connection (will be set when real wallet files are loaded)
        this.walletConnection = null;
        this.transactionHandler = null;
        
        // Existing state structure with SOL balance addition
        this.wallet = null;
        this.balance = {
            sol: 0,
            mGas: 0,
            lucid: 0
        };
        this.dailyProgress = {
            completed: 0,
            total: 10
        };
        this.streak = 0;
        this.tasks = [];
        this.history = [];
        this.settings = {
            notifications: true,
            autoProcess: false
        };
        this.apiUrl = 'http://localhost:3001';
        this.conversionHistory = [];
        this.unlockedAchievements = [];
        this.totalShares = 0;
        this.referralData = null;
        this.lastDailyReset = null;
        this.networkStatus = null;
    }

    async init() {
        try {
            // Load wallet connection scripts
            await this.loadWalletScripts();
            
            // Initialize real wallet connection
            this.walletConnection = new RealWalletConnection(this.configManager);
            this.transactionHandler = new DevnetTransactionHandler(this.walletConnection, this.configManager);
            
            // Load existing state
            await this.loadFromStorage();
            
            // Initialize reward system
            this.rewardSystem = new RewardSystem(this);
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Check for existing wallet connection
            await this.checkExistingConnection();
            
            // Update UI
            await this.updateUI();
            
            // Check daily reset
            this.checkDailyReset();
            
            // Get network status
            await this.updateNetworkStatus();
            
        } catch (error) {
            console.error('Failed to initialize extension:', error);
            this.showToast('Failed to initialize extension: ' + error.message);
        }
    }

    async loadWalletScripts() {
        // Load Solana Web3.js if not already loaded
        if (!window.solanaWeb3) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/@solana/web3.js@latest/lib/index.iife.min.js';
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        // Load wallet connection and transaction handler classes
        // These are loaded as separate files via the manifest
        await this.waitForClasses(['RealWalletConnection', 'DevnetTransactionHandler', 'WalletErrorHandler']);
    }

    async waitForClasses(classNames) {
        const maxWait = 5000; // 5 seconds
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWait) {
            if (classNames.every(className => window[className])) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        throw new Error('Required wallet classes not loaded');
    }

    async loadFromStorage() {
        return new Promise((resolve) => {
            chrome.storage.local.get([
                'wallet',
                'balance',
                'dailyProgress',
                'streak',
                'tasks',
                'history',
                'settings',
                'conversionHistory',
                'unlockedAchievements',
                'totalShares',
                'referralData',
                'lastDailyReset',
                'networkStatus'
            ], (result) => {
                this.wallet = result.wallet || null;
                this.balance = result.balance || { sol: 0, mGas: 0, lucid: 0 };
                this.dailyProgress = result.dailyProgress || { completed: 0, total: 10 };
                this.streak = result.streak || 0;
                this.tasks = result.tasks || this.getDefaultTasks();
                this.history = result.history || [];
                this.settings = result.settings || { notifications: true, autoProcess: false };
                this.conversionHistory = result.conversionHistory || [];
                this.unlockedAchievements = result.unlockedAchievements || [];
                this.totalShares = result.totalShares || 0;
                this.referralData = result.referralData || null;
                this.lastDailyReset = result.lastDailyReset || null;
                this.networkStatus = result.networkStatus || null;
                resolve();
            });
        });
    }

    async saveToStorage() {
        return new Promise((resolve) => {
            chrome.storage.local.set({
                wallet: this.wallet,
                balance: this.balance,
                dailyProgress: this.dailyProgress,
                streak: this.streak,
                tasks: this.tasks,
                history: this.history,
                settings: this.settings,
                conversionHistory: this.conversionHistory,
                unlockedAchievements: this.unlockedAchievements,
                totalShares: this.totalShares,
                referralData: this.referralData,
                lastDailyReset: this.lastDailyReset,
                networkStatus: this.networkStatus
            }, resolve);
        });
    }

    getDefaultTasks() {
        return [
            { id: 'first-thought', title: 'Process your first thought', reward: 5, completed: false },
            { id: 'creative-writing', title: 'Write a creative story', reward: 8, completed: false },
            { id: 'problem-solving', title: 'Solve a complex problem', reward: 10, completed: false },
            { id: 'daily-batch', title: 'Complete 5 thoughts in one session', reward: 15, completed: false },
            { id: 'quality-bonus', title: 'Get a quality bonus', reward: 20, completed: false },
            { id: 'devnet-transaction', title: 'Complete a devnet transaction', reward: 25, completed: false }
        ];
    }

    setupEventListeners() {
        // Wallet connection
        document.getElementById('connectWalletBtn').addEventListener('click', () => this.connectWallet());
        document.getElementById('disconnectWalletBtn')?.addEventListener('click', () => this.disconnectWallet());
        document.getElementById('copyAddressBtn').addEventListener('click', () => this.copyAddress());
        document.getElementById('refreshBalanceBtn')?.addEventListener('click', () => this.refreshBalance());

        // Network status
        document.getElementById('networkStatusBtn')?.addEventListener('click', () => this.showNetworkStatus());
        document.getElementById('switchNetworkBtn')?.addEventListener('click', () => this.switchNetwork());

        // AI interaction
        document.getElementById('aiInput').addEventListener('input', (e) => this.handleInputChange(e));
        document.getElementById('processBtn').addEventListener('click', () => this.processThought());

        // Response actions
        document.getElementById('shareBtn').addEventListener('click', () => this.shareResponse());
        document.getElementById('saveBtn').addEventListener('click', () => this.saveResponse());
        document.getElementById('viewTxBtn')?.addEventListener('click', () => this.viewTransaction());

        // Settings
        document.getElementById('notificationsToggle').addEventListener('change', (e) => this.updateSetting('notifications', e.target.checked));
        document.getElementById('autoProcessToggle').addEventListener('change', (e) => this.updateSetting('autoProcess', e.target.checked));
        document.getElementById('resetDataBtn').addEventListener('click', () => this.resetData());

        // Toast close
        document.getElementById('toastClose').addEventListener('click', () => this.hideToast());

        // Footer links
        document.getElementById('helpLink').addEventListener('click', () => this.openHelp());
        document.getElementById('aboutLink').addEventListener('click', () => this.openAbout());
        document.getElementById('privacyLink').addEventListener('click', () => this.openPrivacy());

        // Phase 8.3 Advanced Features
        document.getElementById('convertBtn')?.addEventListener('click', () => this.convertMGasToLUCID());
        document.getElementById('achievementsBtn')?.addEventListener('click', () => this.showAchievements());
        document.getElementById('leaderboardBtn')?.addEventListener('click', () => this.showLeaderboard());
        document.getElementById('shareAdvancedBtn')?.addEventListener('click', () => this.shareAdvanced());

        // Wallet balance update listener
        window.addEventListener('walletBalanceUpdate', (event) => {
            this.handleBalanceUpdate(event.detail);
        });
    }

    async checkExistingConnection() {
        if (this.walletConnection) {
            const restored = await this.walletConnection.checkConnection();
            if (restored) {
                this.wallet = this.walletConnection.wallet;
                this.balance = this.walletConnection.balance;
                await this.saveToStorage();
            }
        }
    }

    async updateUI() {
        // Update network status indicator
        this.updateNetworkIndicator();
        
        // Update wallet status
        if (this.wallet) {
            document.getElementById('walletDisconnected').classList.add('hidden');
            document.getElementById('walletConnected').classList.remove('hidden');
            document.getElementById('addressText').textContent = this.shortenAddress(this.wallet.address);
            document.getElementById('solBalance').textContent = this.balance.sol.toFixed(4);
            document.getElementById('mGasBalance').textContent = this.balance.mGas.toLocaleString();
            document.getElementById('lucidBalance').textContent = this.balance.lucid.toLocaleString();
        } else {
            document.getElementById('walletDisconnected').classList.remove('hidden');
            document.getElementById('walletConnected').classList.add('hidden');
        }

        // Update daily progress
        document.getElementById('dailyProgress').textContent = `${this.dailyProgress.completed}/${this.dailyProgress.total}`;
        const progressPercent = (this.dailyProgress.completed / this.dailyProgress.total) * 100;
        document.getElementById('progressFill').style.width = `${progressPercent}%`;

        // Update streak
        document.getElementById('streakCount').textContent = this.streak;

        // Update tasks
        this.renderTasks();

        // Update history
        this.renderHistory();

        // Update settings
        document.getElementById('notificationsToggle').checked = this.settings.notifications;
        document.getElementById('autoProcessToggle').checked = this.settings.autoProcess;

        // Update events
        this.renderEvents();
    }

    updateNetworkIndicator() {
        const networkIndicator = document.getElementById('networkIndicator');
        if (networkIndicator) {
            const config = this.configManager.getConfig();
            networkIndicator.textContent = config.environment.toUpperCase();
            networkIndicator.className = `network-indicator ${config.environment}`;
        }
    }

    // Real Wallet Connection Methods
    async connectWallet() {
        try {
            this.showLoading();
            
            if (!this.walletConnection) {
                throw new Error('Wallet connection not initialized');
            }
            
            const result = await this.walletConnection.connectWallet();
            
            if (result.success) {
                this.wallet = result.wallet;
                this.balance = result.balance;
                
                this.hideLoading();
                this.showToast(`Wallet connected to ${result.network}!`);
                
                // Complete wallet connection task
                this.completeTask('devnet-transaction');
                
                await this.updateUI();
                await this.saveToStorage();
            } else {
                this.hideLoading();
                this.showToast(`Failed to connect wallet: ${result.error}`);
                
                // Show action button if recoverable
                if (result.recoverable && result.actionUrl) {
                    this.showActionToast(result.title, result.action, result.actionUrl);
                }
            }
        } catch (error) {
            this.hideLoading();
            this.showToast('Failed to connect wallet: ' + error.message);
        }
    }

    async disconnectWallet() {
        try {
            if (this.walletConnection) {
                await this.walletConnection.disconnectWallet();
            }
            
            this.wallet = null;
            this.balance = { sol: 0, mGas: 0, lucid: 0 };
            
            this.showToast('Wallet disconnected');
            await this.updateUI();
            await this.saveToStorage();
        } catch (error) {
            this.showToast('Failed to disconnect wallet: ' + error.message);
        }
    }

    async refreshBalance() {
        try {
            if (!this.walletConnection || !this.wallet) {
                this.showToast('Wallet not connected');
                return;
            }
            
            this.showLoading();
            await this.walletConnection.updateRealBalances();
            this.balance = this.walletConnection.balance;
            
            this.hideLoading();
            this.showToast('Balance refreshed!');
            await this.updateUI();
            await this.saveToStorage();
        } catch (error) {
            this.hideLoading();
            this.showToast('Failed to refresh balance: ' + error.message);
        }
    }

    handleBalanceUpdate(detail) {
        if (detail.balance) {
            this.balance = detail.balance;
            this.wallet = detail.wallet;
            this.updateUI();
            this.saveToStorage();
        }
    }

    async updateNetworkStatus() {
        try {
            if (this.transactionHandler) {
                this.networkStatus = await this.transactionHandler.getNetworkStatus();
                await this.saveToStorage();
            }
        } catch (error) {
            console.error('Failed to update network status:', error);
        }
    }

    async showNetworkStatus() {
        if (!this.networkStatus) {
            await this.updateNetworkStatus();
        }
        
        const statusHtml = `
            <div class="network-status-modal">
                <h3>Network Status</h3>
                <div class="status-item">
                    <span>Network:</span>
                    <span>${this.networkStatus.network}</span>
                </div>
                <div class="status-item">
                    <span>RPC URL:</span>
                    <span>${this.networkStatus.rpcUrl}</span>
                </div>
                <div class="status-item">
                    <span>Health:</span>
                    <span class="${this.networkStatus.health}">${this.networkStatus.health}</span>
                </div>
                <div class="status-item">
                    <span>Current Slot:</span>
                    <span>${this.networkStatus.currentSlot || 'N/A'}</span>
                </div>
            </div>
        `;
        
        this.showModal(statusHtml);
    }

    async switchNetwork() {
        const newNetwork = this.configManager.isDevnet() ? 'localnet' : 'devnet';
        
        try {
            this.configManager.setEnvironment(newNetwork);
            
            // Reconnect wallet with new network
            if (this.wallet) {
                await this.disconnectWallet();
                await this.connectWallet();
            }
            
            this.showToast(`Switched to ${newNetwork}`);
            await this.updateUI();
        } catch (error) {
            this.showToast('Failed to switch network: ' + error.message);
        }
    }

    // Enhanced thought processing with real transactions
    async processThought() {
        const input = document.getElementById('aiInput').value.trim();
        if (!input || !this.wallet) return;

        try {
            this.showLoading();
            
            // Process thought with real devnet transaction
            const result = await this.transactionHandler.processThoughtWithRealTransaction(input);
            
            if (result.success) {
                // Advanced quality assessment using Phase 8.3 system
                const qualityAssessment = await this.rewardSystem.assessQuality(input, 'AI response processed');
                
                // Check if this is first daily interaction
                const isFirstDaily = this.dailyProgress.completed === 0;
                
                // Calculate advanced earnings
                const earningsResult = this.rewardSystem.calculateEarnings(
                    10, // base reward for real transaction
                    qualityAssessment,
                    this.streak,
                    isFirstDaily
                );
                
                // Apply event multipliers
                const finalEarnings = this.rewardSystem.applyEventMultipliers(earningsResult.total);
                
                // Update balance
                this.balance.mGas += finalEarnings;
                
                // Update daily progress
                this.dailyProgress.completed = Math.min(this.dailyProgress.completed + 1, this.dailyProgress.total);
                
                // Add to history with transaction data
                this.history.push({
                    text: input,
                    response: 'Transaction processed on devnet',
                    earned: finalEarnings,
                    timestamp: Date.now(),
                    signature: result.signature,
                    explorerUrl: result.explorerUrl,
                    network: result.network,
                    qualityScore: qualityAssessment.score,
                    qualityTier: qualityAssessment.tier,
                    qualityBreakdown: qualityAssessment.breakdown,
                    earningsBreakdown: earningsResult.breakdown
                });

                // Check achievements
                const newAchievements = this.rewardSystem.checkAchievements();
                if (newAchievements.length > 0) {
                    this.showAchievementUnlocked(newAchievements);
                }
                
                // Check for task completion
                this.checkTaskCompletion();
                
                // Show success response
                this.showAIResponse(
                    `Transaction confirmed on ${result.network}! Your thought has been processed.`,
                    finalEarnings,
                    qualityAssessment,
                    result.signature,
                    result.explorerUrl
                );
                
                this.hideLoading();
                
            } else {
                this.hideLoading();
                this.showToast(`Transaction failed: ${result.error}`);
                
                // Show recovery options if available
                if (result.recoverable && result.actionUrl) {
                    this.showActionToast(result.title, result.action, result.actionUrl);
                }
            }
            
            // Clear input
            document.getElementById('aiInput').value = '';
            this.handleInputChange({ target: { value: '' } });
            
            await this.updateUI();
            await this.saveToStorage();
            
        } catch (error) {
            this.hideLoading();
            this.showToast('Failed to process thought: ' + error.message);
        }
    }

    showAIResponse(response, earned, qualityAssessment, signature, explorerUrl) {
        document.getElementById('responseContent').textContent = response;
        document.getElementById('gasEarned').textContent = earned;
        
        // Show quality information
        if (qualityAssessment) {
            const qualityInfo = document.getElementById('qualityInfo');
            if (qualityInfo) {
                qualityInfo.innerHTML = `
                    <div class="quality-tier ${qualityAssessment.tier}">
                        ${qualityAssessment.tier.toUpperCase()} Quality
                    </div>
                    <div class="quality-score">
                        Score: ${(qualityAssessment.score * 100).toFixed(1)}%
                    </div>
                `;
            }
        }
        
        // Show transaction info
        if (signature) {
            const txInfo = document.getElementById('transactionInfo');
            if (txInfo) {
                txInfo.innerHTML = `
                    <div class="tx-signature">
                        <strong>Signature:</strong> ${this.shortenAddress(signature)}
                    </div>
                    <div class="tx-network">
                        <strong>Network:</strong> ${this.configManager.getConfig().environment}
                    </div>
                `;
            }
            
            // Store explorer URL for view transaction button
            this.lastExplorerUrl = explorerUrl;
        }
        
        document.getElementById('aiResponse').classList.remove('hidden');
    }

    viewTransaction() {
        if (this.lastExplorerUrl) {
            chrome.tabs.create({ url: this.lastExplorerUrl });
        }
    }

    copyAddress() {
        if (this.wallet) {
            navigator.clipboard.writeText(this.wallet.address);
            this.showToast('Address copied to clipboard!');
        }
    }

    handleInputChange(e) {
        const input = e.target.value;
        const charCount = input.length;
        const maxChars = 500;
        
        document.getElementById('charCount').textContent = `${charCount}/${maxChars}`;
        
        const processBtn = document.getElementById('processBtn');
        const isValid = charCount > 0 && charCount <= maxChars && this.wallet;
        
        processBtn.disabled = !isValid;
        
        if (this.transactionHandler) {
            const status = this.transactionHandler.getProcessingStatus();
            processBtn.disabled = processBtn.disabled || status.isProcessing;
        }
    }

    // Enhanced task completion with devnet transaction checking
    checkTaskCompletion() {
        // Check first thought task
        if (this.history.length === 1) {
            this.completeTask('first-thought');
        }
        
        // Check daily batch task
        if (this.dailyProgress.completed >= 5) {
            this.completeTask('daily-batch');
        }
        
        // Check devnet transaction task
        const hasDevnetTx = this.history.some(h => h.network === 'devnet');
        if (hasDevnetTx) {
            this.completeTask('devnet-transaction');
        }
        
        // Check creative writing (random chance)
        if (Math.random() < 0.3) {
            this.completeTask('creative-writing');
        }
    }

    completeTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task && !task.completed) {
            task.completed = true;
            this.balance.mGas += task.reward;
            this.showToast(`Task completed! +${task.reward} mGas`);
        }
    }

    renderTasks() {
        const tasksList = document.getElementById('tasksList');
        tasksList.innerHTML = '';

        this.tasks.forEach(task => {
            const taskItem = document.createElement('div');
            taskItem.className = 'task-item';
            taskItem.innerHTML = `
                <div class="task-checkbox ${task.completed ? 'completed' : ''}" data-task-id="${task.id}"></div>
                <div class="task-info">
                    <div class="task-title">${task.title}</div>
                    <div class="task-reward">+${task.reward} mGas</div>
                </div>
            `;
            tasksList.appendChild(taskItem);
        });
    }

    renderHistory() {
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '';

        const recentHistory = this.history.slice(-5); // Show last 5 items
        recentHistory.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <div class="history-info">
                    <div class="history-text">${item.text}</div>
                    <div class="history-time">${this.formatTime(item.timestamp)}</div>
                    ${item.signature ? `<div class="history-tx">Tx: ${this.shortenAddress(item.signature)}</div>` : ''}
                </div>
                <div class="history-earned">+${item.earned} mGas</div>
            `;
            historyList.appendChild(historyItem);
        });
    }

    showActionToast(title, action, actionUrl) {
        const actionButton = document.createElement('button');
        actionButton.textContent = action;
        actionButton.onclick = () => {
            if (actionUrl) {
                chrome.tabs.create({ url: actionUrl });
            }
        };
        
        const toastContent = document.getElementById('toastContent');
        toastContent.innerHTML = `${title} `;
        toastContent.appendChild(actionButton);
        
        document.getElementById('toast').classList.remove('hidden');
        setTimeout(() => {
            this.hideToast();
        }, 5000);
    }

    // Continue with existing methods...
    renderEvents() {
        const eventsList = document.getElementById('eventsList');
        if (!eventsList || !this.rewardSystem) return;

        const events = this.rewardSystem.getCurrentEvents();
        
        if (events.length === 0) {
            eventsList.innerHTML = '<div class="no-events">No active events</div>';
            return;
        }

        eventsList.innerHTML = '';
        events.forEach(event => {
            const eventItem = document.createElement('div');
            eventItem.className = 'event-item';
            eventItem.innerHTML = `
                <div class="event-icon">${event.icon}</div>
                <div class="event-info">
                    <div class="event-title">${event.title}</div>
                    <div class="event-description">${event.description}</div>
                </div>
                <div class="event-multiplier">x${event.multiplier}</div>
            `;
            eventsList.appendChild(eventItem);
        });
    }

    shareResponse() {
        const lastResponse = this.history[this.history.length - 1];
        if (lastResponse) {
            const shareText = `I just processed an AI thought on Lucid L2™ devnet: "${lastResponse.text}" and earned ${lastResponse.earned} mGas! Transaction: ${lastResponse.explorerUrl}`;
            navigator.clipboard.writeText(shareText);
            this.totalShares++;
            this.showToast('Response copied for sharing!');
            this.saveToStorage();
        }
    }

    saveResponse() {
        const lastResponse = this.history[this.history.length - 1];
        if (lastResponse) {
            // In real implementation, this would save to local storage or export
            this.showToast('Response saved!');
        }
    }

    updateSetting(setting, value) {
        this.settings[setting] = value;
        this.saveToStorage();
        this.showToast(`Setting updated: ${setting}`);
    }

    async resetData() {
        if (confirm('Are you sure you want to reset all extension data?')) {
            await chrome.storage.local.clear();
            location.reload();
        }
    }

    checkDailyReset() {
        const today = new Date().toDateString();
        
        if (this.lastDailyReset !== today) {
            this.dailyProgress.completed = 0;
            this.tasks = this.getDefaultTasks();
            
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            
            if (this.lastDailyReset === yesterday.toDateString()) {
                this.streak++;
            } else if (this.lastDailyReset) {
                this.streak = 0;
            }
            
            this.lastDailyReset = today;
            this.saveToStorage();
        }
    }

    // Utility methods
    shortenAddress(address) {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
    }

    showLoading() {
        document.getElementById('loadingOverlay').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }

    showToast(message) {
        document.getElementById('toastContent').textContent = message;
        document.getElementById('toast').classList.remove('hidden');
        setTimeout(() => {
            this.hideToast();
        }, 3000);
    }

    hideToast() {
        document.getElementById('toast').classList.add('hidden');
    }

    showModal(content) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                ${content}
                <button class="modal-close">Close</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('.modal-close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    simulateDelay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    openHelp() {
        chrome.tabs.create({ url: 'https://docs.lucid-l2.com/help' });
    }

    openAbout() {
        chrome.tabs.create({ url: 'https://lucid-l2.com/about' });
    }

    openPrivacy() {
        chrome.tabs.create({ url: 'https://lucid-l2.com/privacy' });
    }
}

// Initialize extension when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    const extensionState = new ExtensionState();
    await extensionState.init();
});

// Handle extension unload
window.addEventListener('beforeunload', () => {
    if (window.extensionState) {
        window.extensionState.saveToStorage();
    }
});
