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
        this.conversionHistory = [];
        this.unlockedAchievements = [];
        this.totalShares = 0;
        this.referralData = null;
        this.lastDailyReset = null;
        
        // ChatGPT capture data
        this.chatgptSessionStats = {
            inputTokens: 0,
            outputTokens: 0,
            totalMessages: 0,
            pointsEarned: 0,
            mGasEarned: 0,
            lucidTokensEarned: 0
        };
        this.conversationHistory = [];
        this.totalLifetimePoints = 0;
        
        // Initialize wallet connection state
        this.isConnected = false;
        this.configManager = new ConfigurationManager();
    }

    async init() {
        await this.loadFromStorage();
        this.rewardSystem = new RewardSystem(this);
        this.setupEventListeners();
        this.setupWalletListeners();

        // Sync environment to storage so content script can display correct network
        try {
            const envCfg = this.configManager.getConfig();
            chrome.storage.local.set({
                lucid_env: this.configManager.currentEnvironment || envCfg.environment,
                lucid_network: envCfg.environment
            });
        } catch (e) {}

        await this.updateUI();
        this.checkDailyReset();
        
        // Check for existing wallet connection
        await this.checkExistingConnection();
        
        // NEW: Load rewards from backend if authenticated
        await this.loadRewardsFromBackend();
    }
    
    async loadRewardsFromBackend() {
        try {
            const { privy_session } = await chrome.storage.local.get(['privy_session']);
            if (!privy_session?.userId) {
                console.log('No Privy session, skipping backend reward fetch');
                return;
            }
            
            console.log('📊 Popup: Fetching rewards from backend for user:', privy_session.userId);
            const response = await fetch(`http://13.221.253.195:3001/api/rewards/balance/${privy_session.userId}`);
            const data = await response.json();
            
            if (data.success && data.rewards) {
                console.log('✅ Popup: Backend rewards loaded:', data.rewards);
                
                // Update state with backend data
                this.balance.mGas = data.rewards.balance.mGas || 0;
                this.balance.lucid = data.rewards.balance.lucid || 0;
                this.streak = data.rewards.streakDays || 0;
                this.dailyProgress.completed = Math.min(data.rewards.totalThoughts || 0, 10);
                
                // CRITICAL: Save backend balance to storage so sidebar can access it
                await chrome.storage.local.set({ 
                    balance: {
                        mGas: this.balance.mGas,
                        lucid: this.balance.lucid,
                        sol: this.balance.sol
                    },
                    backend_balance_timestamp: Date.now()
                });
                console.log('💾 Popup: Saved backend balance to storage:', this.balance);
                
                // Update UI immediately
                await this.updateUI();
            }
        } catch (error) {
            console.error('❌ Popup: Error loading rewards from backend:', error);
        }
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
                'chatgpt_session_stats',
                'conversationHistory',
                'totalLifetimePoints'
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
                
                // Load ChatGPT capture data
                this.chatgptSessionStats = result.chatgpt_session_stats || {
                    inputTokens: 0,
                    outputTokens: 0,
                    totalMessages: 0,
                    pointsEarned: 0,
                    mGasEarned: 0,
                    lucidTokensEarned: 0
                };
                this.conversationHistory = result.conversationHistory || [];
                this.totalLifetimePoints = result.totalLifetimePoints || 0;
                
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
        // Listen for storage changes from content script
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local') {
                if (changes.chatgpt_session_stats || changes.conversationHistory || changes.totalLifetimePoints) {
                    // Reload ChatGPT data and update UI
                    this.loadFromStorage().then(() => this.updateUI());
                }
            }
        });
        
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.closest('.tab-btn').dataset.tab));
        });

        // Wallet connection
        document.getElementById('connectWalletBtn').addEventListener('click', () => this.connectWallet());
        document.getElementById('disconnectWalletBtn')?.addEventListener('click', () => this.forceDisconnect());
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
        
        // Pin button for sidebar mode
        document.getElementById('pinBtn')?.addEventListener('click', () => this.toggleSidebarMode());
    }

    switchTab(tabName) {
        // Remove active class from all tabs and content
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        // Add active class to selected tab and content
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    async updateUI() {
        // Update quick stats banner
        // IMPORTANT: Don't add session stats - backend balance already includes all earnings
        const totalMGas = this.balance.mGas || 0;
        const totalLUCID = this.balance.lucid || 0;
        
        document.getElementById('statMGas').textContent = totalMGas.toLocaleString();
        document.getElementById('statLUCID').textContent = totalLUCID.toLocaleString();
        document.getElementById('statDaily').textContent = `${this.dailyProgress.completed}/${this.dailyProgress.total}`;

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
        
        // Update ChatGPT captures
        this.renderChatGPTCaptures();

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

    renderChatGPTCaptures() {
        const capturesList = document.getElementById('chatgptCapturesList');
        if (!capturesList) return;

        // Clear existing content
        capturesList.innerHTML = '';

        // Display session stats
        const stats = this.chatgptSessionStats;
        const statsCard = document.createElement('div');
        statsCard.className = 'chatgpt-stats-card';
        statsCard.innerHTML = `
            <h4>📊 ChatGPT Session Stats</h4>
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-label">Messages</span>
                    <span class="stat-value">${stats.totalMessages || 0}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Input Tokens</span>
                    <span class="stat-value">${stats.inputTokens || 0}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Output Tokens</span>
                    <span class="stat-value">${stats.outputTokens || 0}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Points Earned</span>
                    <span class="stat-value">${(stats.pointsEarned || 0).toFixed(1)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">mGas Earned</span>
                    <span class="stat-value highlight">${stats.mGasEarned || 0}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">LUCID Earned</span>
                    <span class="stat-value highlight">${stats.lucidTokensEarned || 0}</span>
                </div>
            </div>
            <div class="lifetime-stats">
                <strong>Lifetime Points:</strong> ${(this.totalLifetimePoints || 0).toFixed(1)}
            </div>
        `;
        capturesList.appendChild(statsCard);

        // Display recent captures
        if (this.conversationHistory && this.conversationHistory.length > 0) {
            const capturesHeader = document.createElement('h4');
            capturesHeader.textContent = '💬 Recent Captures';
            capturesHeader.style.marginTop = '20px';
            capturesList.appendChild(capturesHeader);

            const recentCaptures = this.conversationHistory.slice(-10).reverse(); // Show last 10, most recent first
            recentCaptures.forEach(capture => {
                const captureItem = document.createElement('div');
                captureItem.className = 'capture-item';
                captureItem.innerHTML = `
                    <div class="capture-header">
                        <span class="capture-type ${capture.type}">${capture.type === 'user' ? '👤 You' : '🤖 ChatGPT'}</span>
                        <span class="capture-time">${this.formatTime(new Date(capture.timestamp).getTime())}</span>
                    </div>
                    <div class="capture-content">${this.truncateText(capture.content, 150)}</div>
                `;
                capturesList.appendChild(captureItem);
            });
        } else {
            const noCaptures = document.createElement('div');
            noCaptures.className = 'no-captures';
            noCaptures.innerHTML = `
                <p>No ChatGPT conversations captured yet.</p>
                <p>Visit <a href="https://chat.openai.com" target="_blank">ChatGPT</a> and start a conversation to earn points!</p>
            `;
            capturesList.appendChild(noCaptures);
        }
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    async connectWallet() {
        try {
            console.log('🔗 Opening Privy authentication tab...');
            
            // ✅ FIX: Open Privy auth via background script (opens in tab now)
            chrome.runtime.sendMessage({ type: 'open_privy_auth' }, (response) => {
                if (chrome.runtime.lastError) {
                    this.showToast('Failed to open wallet connection: ' + chrome.runtime.lastError.message);
                } else {
                    console.log('✅ Auth tab opened, waiting for wallet connection...');
                }
                // The auth tab will handle the connection
                // Results will come back via privy_authenticated message
            });
        } catch (error) {
            console.error('❌ Wallet connection failed:', error);
            this.showToast('Wallet connection failed: ' + error.message);
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
            
            // Send request through background script to avoid CORS issues
            const result = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: 'lucid_run',
                    payload: {
                        text: input,
                        wallet: this.wallet.address
                    }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve({ ok: false, error: chrome.runtime.lastError.message });
                    } else {
                        resolve(response);
                    }
                });
            });
            
            if (result && result.ok && result.data) {
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
                    response: result.response,
                    earned: finalEarnings,
                    timestamp: Date.now(),
                    hash: result.root,
                    signature: result.signature,
                    explorerUrl: result.explorerUrl,
                    gasUsed: result.gasUsed,
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
                
                // Show AI response with quality info and blockchain data
                this.showAIResponse(
                    result.response, 
                    finalEarnings,
                    qualityAssessment,
                    result
                );
                
                // Clear input
                document.getElementById('aiInput').value = '';
                this.handleInputChange({ target: { value: '' } });
                
                this.showToast(`✅ Thought committed to devnet! Gas: ${result.gasUsed.total} LUCID`);
                
            } else {
                throw new Error('Failed to process thought via API');
            }
            
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

    async toggleSidebarMode() {
        // Get current tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) return;
        
        const tabId = tabs[0].id;
        
        // Check if sidebar is already open
        chrome.storage.local.get(['sidebarPinned'], async (result) => {
            const isPinned = result.sidebarPinned || false;
            
            if (!isPinned) {
                // Pin: Inject sidebar into current page
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId },
                        files: ['sidebar.js']
                    });
                    
                    await chrome.scripting.insertCSS({
                        target: { tabId },
                        files: ['sidebar-styles.css']
                    });
                    
                    chrome.storage.local.set({ sidebarPinned: true });
                    this.showToast('Sidebar pinned! Access it from the side of your browser.');
                    
                    // Close popup after a short delay
                    setTimeout(() => window.close(), 1000);
                } catch (error) {
                    console.error('Failed to inject sidebar:', error);
                    this.showToast('Failed to pin sidebar: ' + error.message);
                }
            } else {
                // Unpin: Remove sidebar
                chrome.tabs.sendMessage(tabId, { type: 'closeSidebar' });
                chrome.storage.local.set({ sidebarPinned: false });
                this.showToast('Sidebar unpinned!');
            }
        });
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
        
        // Listen for Privy authentication results and reward updates
        const self = this;
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg?.type === 'rewards_updated') {
                console.log('🎉 Popup: Rewards updated from backend:', msg.data);
                
                // Reload full state from backend to get fresh data
                self.loadRewardsFromBackend();
            }
            
            if (msg?.type === 'privy_authenticated') {
                console.log('✅ Privy authenticated:', msg.payload);
                
                // Store complete session data in chrome.storage.local for persistence
                const payload = msg.payload;
                chrome.storage.local.set({ privy_session: payload }, () => {
                    console.log('✅ Privy session stored in chrome.storage.local');
                });
                
                // Extract wallet info from Privy payload
                self.wallet = {
                    address: payload.solanaAddress || payload.address,
                    type: payload.solanaAddress ? 'solana' : 'evm',
                    userId: payload.userId
                };
                self.isConnected = true;
                
                // Update UI
                self.updateUI();
                self.saveToStorage();
                
                self.showToast('Wallet connected successfully via Privy!');
            }
            
            if (msg?.type === 'privy_logged_out') {
                console.log('🔓 Privy logged out - clearing wallet state');
                
                // Clear all wallet-related state
                self.wallet = null;
                self.isConnected = false;
                self.balance = { 
                    mGas: self.balance.mGas, // Keep mGas
                    lucid: 0, 
                    sol: 0 
                };
                
                // Clear privy_session from storage
                chrome.storage.local.remove('privy_session', () => {
                    console.log('✅ Session cleared from storage');
                });
                
                // Update UI immediately
                self.updateUI();
                self.saveToStorage();
                
                self.showToast('Wallet disconnected successfully!');
            }
        });
    }

    async checkExistingConnection() {
        try {
            // PRIORITY 1: Check for Privy session in storage (persists across popup reopens)
            const storageResult = await chrome.storage.local.get(['privy_session']);
            
            if (storageResult.privy_session) {
                console.log('✅ Found existing Privy session in storage');
                const session = storageResult.privy_session;
                
                // Restore wallet state from session - prioritize Solana address
                this.wallet = {
                    address: session.solanaAddress || session.address,
                    type: session.solanaAddress ? 'solana' : 'evm',
                    userId: session.userId
                };
                this.isConnected = true;
                
                console.log('✅ Restored wallet from session:', this.wallet.address);
                
                await this.updateUI();
                await this.saveToStorage();
                return; // Exit early - we found the session
            }
            
            // PRIORITY 2: Fall back to checking content script (for non-Privy connections)
            console.log('No Privy session found, checking content script...');
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0 && !this.isInvalidTabForWallet(tabs[0].url)) {
                try {
                    const result = await chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'checkWallet'
                    });
                    
                    if (result?.success && result.connected && result.publicKey) {
                        this.wallet = { address: result.publicKey };
                        this.isConnected = true;
                        
                        // Try to get updated balance
                        const balanceResult = await chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'getWalletBalance'
                        });
                        
                        if (balanceResult?.success) {
                            this.balance = {
                                sol: balanceResult.balance.sol || 0,
                                lucid: balanceResult.balance.lucid || 0,
                                mGas: this.balance.mGas // Keep existing mGas
                            };
                        }
                        
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

    // Force disconnect - immediate local cleanup
    async forceDisconnect() {
        try {
            console.log('🔓 Force disconnecting wallet...');
            
            // Clear session data
            await chrome.storage.local.remove('privy_session');
            
            // Clear wallet state
            this.wallet = null;
            this.isConnected = false;
            this.balance = { 
                mGas: this.balance.mGas, // Keep mGas
                lucid: 0, 
                sol: 0 
            };
            
            // Update UI
            await this.updateUI();
            await this.saveToStorage();
            
            this.showToast('Wallet disconnected successfully!');
            
            // Also try to trigger proper Privy logout in background
            chrome.runtime.sendMessage({ type: 'privy_logged_out' });
            
        } catch (error) {
            console.error('Error during force disconnect:', error);
            this.showToast('Error: ' + error.message);
        }
    }
    
    async disconnectWallet() {
        try {
            // Open Privy logout popup via background script
            chrome.runtime.sendMessage({ type: 'open_privy_logout' }, (response) => {
                if (chrome.runtime.lastError) {
                    this.showToast('Failed to disconnect: ' + chrome.runtime.lastError.message);
                }
                // The logout will be handled by auth.html
                // Results will come back via privy_logged_out message
            });
        } catch (error) {
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

    // Helper method to check if tab URL is valid for wallet operations
    isInvalidTabForWallet(url) {
        if (!url) return true;
        
        const invalidPrefixes = [
            'chrome://',
            'chrome-extension://',
            'moz-extension://',
            'edge://',
            'about:',
            'file://'
        ];
        
        return invalidPrefixes.some(prefix => url.startsWith(prefix));
    }

    // Get user-friendly error message for invalid URLs
    getInvalidUrlMessage(url) {
        if (!url) return 'Please navigate to a website first.';
        
        if (url.startsWith('file://')) {
            return 'Phantom wallet does not work on local files. Please navigate to https://google.com or any website and try again.';
        }
        
        if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
            return 'Phantom wallet does not work on Chrome internal pages. Please navigate to https://google.com or any website and try again.';
        }
        
        return 'Phantom wallet does not work on this type of page. Please navigate to https://google.com or any regular website and try again.';
    }

    // Helper method to ensure content script is available
    async ensureContentScriptAvailable(tabId) {
        try {
            console.log('📦 Injecting content script...');
            
            // Always inject simple content script (no conflict since we removed auto-injection from manifest)
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content-simple.js']
            });
            
            console.log('✅ Content script injected successfully');
            
            // Wait for content script to initialize and Phantom to be ready
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Verify content script is working
            const isAvailable = await this.checkContentScriptAvailable(tabId);
            if (!isAvailable) {
                throw new Error('Content script failed to initialize');
            }
            
            return true;
            
        } catch (error) {
            console.error('❌ Content script injection failed:', error);
            throw new Error('Unable to initialize wallet connection. Please refresh the page and try again.');
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
            return false;
        }
    }

    // Helper method to send message with retry logic
    async sendMessageWithRetry(tabId, message, maxRetries = 3, retryDelay = 500) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const result = await chrome.tabs.sendMessage(tabId, message);
                return result;
            } catch (error) {
                console.log(`Message attempt ${i + 1} failed:`, error);
                if (i === maxRetries - 1) {
                    throw new Error('Unable to communicate with the page. Please refresh and try again.');
                }
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }

    // Show help modal for wallet not found error
    showWalletNotFoundHelp() {
        const helpHTML = `
            <div class="wallet-help-modal">
                <h3>Phantom Wallet Required</h3>
                <p>To use Lucid L2™, you need to install the Phantom wallet extension:</p>
                <ol>
                    <li>Visit <a href="https://phantom.app/" target="_blank">phantom.app</a></li>
                    <li>Download the browser extension</li>
                    <li>Create or import a wallet</li>
                    <li>Refresh this page and try again</li>
                </ol>
                <button class="help-close-btn">Close</button>
            </div>
        `;
        
        this.showModal(helpHTML);
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
                lucidMint: 'FevHSnbJ3567nxaJoCBZMmdR6SKwB9xsTZgdFGJ9WoHQ'
            },
            testnet: {
                rpcUrl: 'https://api.testnet.solana.com',
                commitment: 'confirmed',
                environment: 'testnet',
                // Note: replace with real testnet mint if different
                lucidMint: '8FJLRcc681GxefHgsPg32ZdGAveQNTFLVy5GgmotiimG'
            }
        };
        
        this.currentEnvironment = 'devnet'; // Default to devnet for Phase 8.4/Devnet testing
    }

    getConfig() {
        return this.environments[this.currentEnvironment];
    }

    setEnvironment(env) {
        if (this.environments[env]) {
            this.currentEnvironment = env;
            // Persist environment so other parts (content script) can reflect correct network
            try {
                const cfg = this.getConfig();
                chrome.storage.local.set({
                    lucid_env: env,
                    lucid_network: cfg.environment
                });
            } catch (e) {}
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
