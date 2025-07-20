// Extension State Management
class ExtensionState {
    constructor() {
        this.wallet = null;
        this.balance = {
            mGas: 0,
            lucid: 0,
            sol: 0
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
        
        // Initialize wallet connection state
        this.isConnected = false;
        this.configManager = new ConfigurationManager();
    }

    async init() {
        await this.loadFromStorage();
        this.rewardSystem = new RewardSystem(this);
        this.setupEventListeners();
        this.setupWalletListeners();
        await this.updateUI();
        this.checkDailyReset();
        
        // Check for existing wallet connection
        await this.checkExistingConnection();
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
                'lastDailyReset'
            ], (result) => {
                this.wallet = result.wallet || null;
                this.balance = result.balance || { mGas: 0, lucid: 0 };
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
                lastDailyReset: this.lastDailyReset
            }, resolve);
        });
    }

    getDefaultTasks() {
        return [
            { id: 'first-thought', title: 'Process your first thought', reward: 5, completed: false },
            { id: 'creative-writing', title: 'Write a creative story', reward: 8, completed: false },
            { id: 'problem-solving', title: 'Solve a complex problem', reward: 10, completed: false },
            { id: 'daily-batch', title: 'Complete 5 thoughts in one session', reward: 15, completed: false },
            { id: 'quality-bonus', title: 'Get a quality bonus', reward: 20, completed: false }
        ];
    }

    setupEventListeners() {
        // Wallet connection
        document.getElementById('connectWalletBtn').addEventListener('click', () => this.connectWallet());
        document.getElementById('disconnectWalletBtn')?.addEventListener('click', () => this.disconnectWallet());
        document.getElementById('copyAddressBtn').addEventListener('click', () => this.copyAddress());

        // AI interaction
        document.getElementById('aiInput').addEventListener('input', (e) => this.handleInputChange(e));
        document.getElementById('processBtn').addEventListener('click', () => this.processThought());

        // Response actions
        document.getElementById('shareBtn').addEventListener('click', () => this.shareResponse());
        document.getElementById('saveBtn').addEventListener('click', () => this.saveResponse());

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
    }

    async updateUI() {
        // Update wallet status
        if (this.wallet && this.isConnected) {
            document.getElementById('walletDisconnected').classList.add('hidden');
            document.getElementById('walletConnected').classList.remove('hidden');
            document.getElementById('addressText').textContent = this.shortenAddress(this.wallet.address);
            document.getElementById('mGasBalance').textContent = this.balance.mGas.toLocaleString();
            document.getElementById('lucidBalance').textContent = this.balance.lucid.toLocaleString();
            
            // Update SOL balance if available
            const solBalanceElement = document.getElementById('solBalance');
            if (solBalanceElement) {
                solBalanceElement.textContent = this.balance.sol.toFixed(4);
            }
            
            // Update network indicator
            const networkElement = document.getElementById('networkIndicator');
            if (networkElement) {
                const network = this.configManager.getConfig().environment;
                networkElement.textContent = network.toUpperCase();
                networkElement.className = `network-indicator ${network}`;
            }
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

        // Add click listeners to checkboxes
        document.querySelectorAll('.task-checkbox').forEach(checkbox => {
            checkbox.addEventListener('click', (e) => {
                const taskId = e.target.dataset.taskId;
                this.toggleTask(taskId);
            });
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
                </div>
                <div class="history-earned">+${item.earned} mGas</div>
            `;
            historyList.appendChild(historyItem);
        });
    }

    async connectWallet() {
        try {
            this.showLoading();
            
            // Try direct wallet connection first (fallback method)
            if (typeof window !== 'undefined' && window.solana && window.solana.isPhantom) {
                const result = await this.connectWalletDirect();
                if (result.success) {
                    this.wallet = result.wallet;
                    this.balance = { sol: 0, lucid: 0, mGas: this.balance.mGas }; // Keep existing mGas
                    this.isConnected = true;
                    
                    this.showToast('Wallet connected successfully!');
                    await this.updateUI();
                    await this.saveToStorage();
                    this.hideLoading();
                    return;
                }
            }
            
            // Get active tab and try content script method
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) {
                throw new Error('No active tab found. Please open a web page and try again.');
            }
            
            // First check if content script is available
            const isContentScriptAvailable = await this.checkContentScriptAvailable(tabs[0].id);
            if (!isContentScriptAvailable) {
                // Try to inject content script
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id },
                        files: ['content.js']
                    });
                    // Wait a bit for content script to initialize
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.log('Failed to inject content script:', error);
                    throw new Error('Unable to connect wallet. Please refresh the page and try again.');
                }
            }
            
            // Send message to content script with retry logic
            const result = await this.sendMessageWithRetry(tabs[0].id, {
                action: 'connectWallet'
            });
            
            if (result && result.success) {
                this.wallet = result.wallet;
                this.balance = { sol: 0, lucid: 0, mGas: this.balance.mGas }; // Keep existing mGas
                this.isConnected = true;
                
                this.showToast('Wallet connected successfully!');
                await this.updateUI();
                await this.saveToStorage();
            } else {
                this.showToast(result ? result.error : 'Failed to connect wallet');
            }
            
            this.hideLoading();
        } catch (error) {
            this.hideLoading();
            this.showToast(error.message);
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
        document.getElementById('processBtn').disabled = charCount === 0 || charCount > maxChars || !this.wallet;
    }

    async processThought() {
        const input = document.getElementById('aiInput').value.trim();
        if (!input || !this.wallet) return;

        try {
            this.showLoading();
            
            // Call the Lucid L2 API
            const response = await fetch(`${this.apiUrl}/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: input,
                    wallet: this.wallet.address
                })
            });

            if (!response.ok) {
                throw new Error('API request failed');
            }

            const result = await response.json();
            
            // Advanced quality assessment using Phase 8.3 system
            const qualityAssessment = await this.rewardSystem.assessQuality(input, result.response);
            
            // Check if this is first daily interaction
            const isFirstDaily = this.dailyProgress.completed === 0;
            
            // Calculate advanced earnings
            const earningsResult = this.rewardSystem.calculateEarnings(
                5, // base reward
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
            
            // Add to history with quality data
            this.history.push({
                text: input,
                response: result.response || 'AI response processed',
                earned: finalEarnings,
                timestamp: Date.now(),
                hash: result.hash,
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
            
            // Show AI response with quality info
            this.showAIResponse(
                result.response || 'Your thought has been processed and committed to the blockchain!', 
                finalEarnings,
                qualityAssessment
            );
            
            // Clear input
            document.getElementById('aiInput').value = '';
            this.handleInputChange({ target: { value: '' } });
            
            this.hideLoading();
            await this.updateUI();
            await this.saveToStorage();
            
        } catch (error) {
            this.hideLoading();
            this.showToast('Failed to process thought: ' + error.message);
        }
    }

    showAIResponse(response, earned, qualityAssessment) {
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
        
        document.getElementById('aiResponse').classList.remove('hidden');
    }

    checkTaskCompletion() {
        // Check first thought task
        if (this.history.length === 1) {
            this.completeTask('first-thought');
        }
        
        // Check daily batch task
        if (this.dailyProgress.completed >= 5) {
            this.completeTask('daily-batch');
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

    toggleTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            if (task.completed) {
                this.balance.mGas += task.reward;
            } else {
                this.balance.mGas -= task.reward;
            }
            this.updateUI();
            this.saveToStorage();
        }
    }

    shareResponse() {
        const lastResponse = this.history[this.history.length - 1];
        if (lastResponse) {
            const shareText = `I just processed an AI thought on Lucid L2™: "${lastResponse.text}" and earned ${lastResponse.earned} mGas!`;
            navigator.clipboard.writeText(shareText);
            this.totalShares++;
            this.showToast('Response copied for sharing!');
            this.saveToStorage();
        }
    }

    shareAdvanced() {
        const lastResponse = this.history[this.history.length - 1];
        if (lastResponse && this.rewardSystem) {
            const shareContent = this.rewardSystem.generateShareableContent(
                lastResponse.text,
                lastResponse.response,
                lastResponse.earned
            );
            
            const fullShareText = `${shareContent.content}\n\n${shareContent.hashtags}\n${shareContent.url}`;
            navigator.clipboard.writeText(fullShareText);
            this.totalShares++;
            this.showToast('Advanced share content copied!');
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
            this.wallet = null;
            this.balance = { mGas: 0, lucid: 0 };
            this.dailyProgress = { completed: 0, total: 10 };
            this.streak = 0;
            this.tasks = this.getDefaultTasks();
            this.history = [];
            this.settings = { notifications: true, autoProcess: false };
            this.conversionHistory = [];
            this.unlockedAchievements = [];
            this.totalShares = 0;
            this.referralData = null;
            this.lastDailyReset = null;
            await this.updateUI();
            this.showToast('Extension data reset!');
        }
    }

    // Phase 8.3 Advanced Features
    async convertMGasToLUCID() {
        if (!this.rewardSystem) return;
        
        try {
            const mGasAmount = parseInt(prompt('Enter mGas amount to convert (minimum 100):'));
            if (isNaN(mGasAmount) || mGasAmount < 100) {
                this.showToast('Invalid amount. Minimum 100 mGas required.');
                return;
            }

            if (mGasAmount > this.balance.mGas) {
                this.showToast('Insufficient mGas balance.');
                return;
            }

            this.showLoading();
            const result = await this.rewardSystem.convertMGasToLUCID(mGasAmount);
            this.hideLoading();

            this.showToast(`Converted ${mGasAmount} mGas to ${result.lucidReceived} LUCID!`);
            await this.updateUI();
            
        } catch (error) {
            this.hideLoading();
            this.showToast('Conversion failed: ' + error.message);
        }
    }

    showAchievements() {
        if (!this.rewardSystem) return;
        
        const achievements = this.rewardSystem.achievements;
        const unlockedIds = this.unlockedAchievements;
        
        let achievementHTML = '<div class="achievements-modal"><h3>Achievements</h3>';
        
        achievements.forEach(achievement => {
            const isUnlocked = unlockedIds.includes(achievement.id);
            achievementHTML += `
                <div class="achievement-item ${isUnlocked ? 'unlocked' : 'locked'}">
                    <div class="achievement-icon">${achievement.icon}</div>
                    <div class="achievement-info">
                        <div class="achievement-title">${achievement.title}</div>
                        <div class="achievement-description">${achievement.description}</div>
                        <div class="achievement-reward">+${achievement.reward} mGas</div>
                    </div>
                </div>
            `;
        });
        
        achievementHTML += '</div>';
        
        // Show in a modal or new section
        this.showModal(achievementHTML);
    }

    async showLeaderboard() {
        if (!this.rewardSystem) return;
        
        try {
            this.showLoading();
            const leaderboard = await this.rewardSystem.getLeaderboard('total_earnings', 10);
            this.hideLoading();
            
            let leaderboardHTML = '<div class="leaderboard-modal"><h3>Leaderboard</h3>';
            
            leaderboard.forEach(entry => {
                leaderboardHTML += `
                    <div class="leaderboard-entry">
                        <div class="rank">#${entry.rank}</div>
                        <div class="username">${entry.username}</div>
                        <div class="value">${entry.value} mGas</div>
                    </div>
                `;
            });
            
            leaderboardHTML += '</div>';
            this.showModal(leaderboardHTML);
            
        } catch (error) {
            this.hideLoading();
            this.showToast('Failed to load leaderboard: ' + error.message);
        }
    }

    showAchievementUnlocked(achievements) {
        achievements.forEach(achievement => {
            this.showToast(`🎉 Achievement Unlocked: ${achievement.title} (+${achievement.reward} mGas)`);
        });
    }

    showModal(content) {
        // Simple modal implementation
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

    checkDailyReset() {
        const today = new Date().toDateString();
        
        if (this.lastDailyReset !== today) {
            // Reset daily progress
            this.dailyProgress.completed = 0;
            this.tasks = this.getDefaultTasks();
            
            // Update streak
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

    // Real wallet connection methods
    setupWalletListeners() {
        // Listen for wallet balance updates
        window.addEventListener('walletBalanceUpdate', (event) => {
            this.balance = event.detail.balance;
            this.wallet = event.detail.wallet;
            this.isConnected = event.detail.isConnected;
            this.updateUI();
            this.saveToStorage();
        });
    }

    async checkExistingConnection() {
        try {
            // Check if wallet was previously connected
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0) {
                try {
                    const result = await chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'checkWallet'
                    });
                    
                    if (result.success && result.connected && result.publicKey) {
                        this.wallet = { address: result.publicKey };
                        this.isConnected = true;
                        await this.updateUI();
                        await this.saveToStorage();
                    }
                } catch (error) {
                    console.log('Content script not available for wallet check:', error);
                }
            }
        } catch (error) {
            console.log('No existing wallet connection:', error);
        }
    }

    async disconnectWallet() {
        try {
            this.showLoading();
            
            // Get active tab and send message to content script
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0) {
                try {
                    await chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'disconnectWallet'
                    });
                } catch (error) {
                    console.log('Content script not available:', error);
                }
            }
            
            // Clear local state regardless
            this.wallet = null;
            this.balance = { mGas: this.balance.mGas, lucid: 0, sol: 0 }; // Keep mGas
            this.isConnected = false;
            
            this.showToast('Wallet disconnected');
            await this.updateUI();
            await this.saveToStorage();
            
            this.hideLoading();
        } catch (error) {
            this.hideLoading();
            this.showToast('Failed to disconnect wallet: ' + error.message);
        }
    }

    showWalletError(errorResult) {
        const errorMessage = errorResult.title + ': ' + errorResult.error;
        this.showToast(errorMessage);
        
        // Show detailed error information if available
        if (errorResult.recoverable && errorResult.action) {
            console.log('Error details:', errorResult);
            // Could show more detailed error modal here
        }
    }

    // Direct wallet connection method (fallback)
    async connectWalletDirect() {
        try {
            if (!window.solana || !window.solana.isPhantom) {
                throw new Error('Phantom wallet not found. Please install Phantom wallet.');
            }

            console.log('📱 Phantom wallet found, requesting connection...');
            const response = await window.solana.connect();
            console.log('✅ Wallet connected:', response.publicKey.toString());
            
            return {
                success: true,
                wallet: {
                    address: response.publicKey.toString(),
                    publicKey: response.publicKey
                }
            };
        } catch (error) {
            console.error('❌ Direct wallet connection failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Helper method to check if content script is available
    async checkContentScriptAvailable(tabId) {
        try {
            const result = await chrome.tabs.sendMessage(tabId, {
                action: 'getPageInfo'
            });
            return result && result.title;
        } catch (error) {
            console.log('Content script not available:', error);
            return false;
        }
    }

    // Helper method to send message with retry logic
    async sendMessageWithRetry(tabId, message, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const result = await chrome.tabs.sendMessage(tabId, message);
                return result;
            } catch (error) {
                console.log(`Message attempt ${i + 1} failed:`, error);
                if (i === maxRetries - 1) {
                    throw new Error('Content script not available. Please refresh the page and try again.');
                }
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }
}

// Configuration Manager for browser extension
class ConfigurationManager {
    constructor() {
        this.environments = {
            localnet: {
                rpcUrl: 'http://localhost:8899',
                commitment: 'processed',
                environment: 'localnet',
                lucidMint: '4sWEwy73f7ViLeuSYgBGRt9zZxH3VJ7SsBRitpBFCQSh'
            },
            devnet: {
                rpcUrl: 'https://api.devnet.solana.com',
                commitment: 'confirmed',
                environment: 'devnet',
                lucidMint: 'Au343oxp5p17kLHAKUvf4HEqzDtTeFRdmetfzby7wJJM'
            }
        };
        
        this.currentEnvironment = 'devnet'; // Default to devnet for Phase 8.4
    }

    getConfig() {
        return this.environments[this.currentEnvironment];
    }

    setEnvironment(env) {
        if (this.environments[env]) {
            this.currentEnvironment = env;
        }
    }
}

// Initialize extension when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    const extensionState = new ExtensionState();
    await extensionState.init();
});

// Handle extension unload
window.addEventListener('beforeunload', () => {
    // Save any pending state
    if (window.extensionState) {
        window.extensionState.saveToStorage();
    }
});
