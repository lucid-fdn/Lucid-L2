// Background Service Worker for Lucid L2™ Extension
class BackgroundService {
    constructor() {
        this.apiUrl = 'http://localhost:3001';
        this.alarmName = 'dailyReset';
        this.notificationId = 'lucidNotification';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupAlarms();
        this.setupContextMenus();
    }

    setupEventListeners() {
        // Extension installation
        chrome.runtime.onInstalled.addListener((details) => {
            this.onInstalled(details);
        });

        // Startup
        chrome.runtime.onStartup.addListener(() => {
            this.onStartup();
        });

        // Alarms
        chrome.alarms.onAlarm.addListener((alarm) => {
            this.onAlarm(alarm);
        });

        // Notifications
        chrome.notifications.onClicked.addListener((notificationId) => {
            this.onNotificationClicked(notificationId);
        });

        // Message passing
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.onMessage(request, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });

        // Context menu clicks
        chrome.contextMenus.onClicked.addListener((info, tab) => {
            this.onContextMenuClicked(info, tab);
        });
    }

    setupAlarms() {
        // Daily reset alarm
        chrome.alarms.create(this.alarmName, {
            when: this.getNextMidnight(),
            periodInMinutes: 24 * 60 // 24 hours
        });

        // Reminder notifications
        chrome.alarms.create('reminderNotification', {
            delayInMinutes: 60, // 1 hour
            periodInMinutes: 4 * 60 // 4 hours
        });
    }

    setupContextMenus() {
        chrome.contextMenus.create({
            id: 'processSelectedText',
            title: 'Process with Lucid L2™',
            contexts: ['selection']
        });

        chrome.contextMenus.create({
            id: 'openExtension',
            title: 'Open Lucid L2™ Extension',
            contexts: ['page']
        });
    }

    onInstalled(details) {
        console.log('Lucid L2™ Extension installed:', details);
        
        // Set default storage values
        chrome.storage.local.set({
            balance: { mGas: 0, lucid: 0 },
            dailyProgress: { completed: 0, total: 10 },
            streak: 0,
            tasks: this.getDefaultTasks(),
            history: [],
            settings: { notifications: true, autoProcess: false }
        });

        // Show welcome notification
        if (details.reason === 'install') {
            this.showNotification(
                'Welcome to Lucid L2™!',
                'Start earning mGas by processing your thoughts with AI.',
                'welcome'
            );
        }
    }

    onStartup() {
        console.log('Lucid L2™ Extension startup');
        this.checkDailyReset();
    }

    onAlarm(alarm) {
        switch (alarm.name) {
            case this.alarmName:
                this.handleDailyReset();
                break;
            case 'reminderNotification':
                this.sendReminder();
                break;
        }
    }

    onNotificationClicked(notificationId) {
        // Open extension popup when notification is clicked
        chrome.action.openPopup();
    }

    onMessage(request, sender, sendResponse) {
        switch (request.action) {
            case 'processText':
                this.processTextInBackground(request.text)
                    .then(result => sendResponse({ success: true, result }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                break;
            
            case 'updateBadge':
                this.updateBadge(request.count);
                sendResponse({ success: true });
                break;
            
            case 'getSystemStatus':
                this.getSystemStatus()
                    .then(status => sendResponse({ success: true, status }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                break;
            
            case 'scheduleNotification':
                this.scheduleNotification(request.title, request.message, request.delay);
                sendResponse({ success: true });
                break;
                
            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    }

    onContextMenuClicked(info, tab) {
        switch (info.menuItemId) {
            case 'processSelectedText':
                if (info.selectionText) {
                    this.processSelectedText(info.selectionText, tab);
                }
                break;
            
            case 'openExtension':
                chrome.action.openPopup();
                break;
        }
    }

    async processSelectedText(text, tab) {
        try {
            const result = await this.processTextInBackground(text);
            
            // Show success notification
            this.showNotification(
                'Text Processed!',
                `Earned ${result.earned} mGas from selected text`,
                'success'
            );
            
            // Update badge
            this.updateBadge('+' + result.earned);
            
            // Auto-hide badge after 3 seconds
            setTimeout(() => {
                this.updateBadge('');
            }, 3000);
            
        } catch (error) {
            this.showNotification(
                'Processing Failed',
                error.message,
                'error'
            );
        }
    }

    async processTextInBackground(text) {
        try {
            // Get wallet from storage
            const storage = await chrome.storage.local.get(['wallet']);
            if (!storage.wallet) {
                throw new Error('Wallet not connected');
            }

            // Call Lucid L2 API
            const response = await fetch(`${this.apiUrl}/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text,
                    wallet: storage.wallet.address
                })
            });

            if (!response.ok) {
                throw new Error('API request failed');
            }

            const result = await response.json();
            
            // Calculate rewards
            const baseReward = 5;
            const qualityBonus = Math.floor(Math.random() * 10);
            const totalEarned = baseReward + qualityBonus;
            
            // Update storage
            await this.updateStorageAfterProcessing(text, result, totalEarned);
            
            return {
                ...result,
                earned: totalEarned
            };
            
        } catch (error) {
            console.error('Background processing error:', error);
            throw error;
        }
    }

    async updateStorageAfterProcessing(text, result, earned) {
        const storage = await chrome.storage.local.get(['balance', 'dailyProgress', 'history']);
        
        // Update balance
        storage.balance.mGas += earned;
        
        // Update daily progress
        storage.dailyProgress.completed = Math.min(storage.dailyProgress.completed + 1, storage.dailyProgress.total);
        
        // Add to history
        storage.history.push({
            text: text,
            response: result.response || 'AI response processed',
            earned: earned,
            timestamp: Date.now(),
            hash: result.hash,
            source: 'background'
        });
        
        // Keep only last 100 history items
        if (storage.history.length > 100) {
            storage.history = storage.history.slice(-100);
        }
        
        // Save to storage
        await chrome.storage.local.set({
            balance: storage.balance,
            dailyProgress: storage.dailyProgress,
            history: storage.history
        });
    }

    async handleDailyReset() {
        try {
            const storage = await chrome.storage.local.get(['dailyProgress', 'streak', 'tasks']);
            
            // Check if daily goal was met
            const goalMet = storage.dailyProgress.completed >= storage.dailyProgress.total;
            
            // Update streak
            if (goalMet) {
                storage.streak += 1;
                this.showNotification(
                    'Daily Goal Complete!',
                    `Streak: ${storage.streak} days. Keep it up!`,
                    'streak'
                );
            } else {
                storage.streak = 0;
                this.showNotification(
                    'Daily Reset',
                    'Your daily progress has been reset. Start earning mGas!',
                    'reset'
                );
            }
            
            // Reset daily progress
            storage.dailyProgress = { completed: 0, total: 10 };
            
            // Reset tasks
            storage.tasks = this.getDefaultTasks();
            
            // Save to storage
            await chrome.storage.local.set({
                dailyProgress: storage.dailyProgress,
                streak: storage.streak,
                tasks: storage.tasks
            });
            
        } catch (error) {
            console.error('Daily reset error:', error);
        }
    }

    async sendReminder() {
        try {
            const storage = await chrome.storage.local.get(['settings', 'dailyProgress']);
            
            if (!storage.settings.notifications) {
                return;
            }
            
            const remaining = storage.dailyProgress.total - storage.dailyProgress.completed;
            
            if (remaining > 0) {
                this.showNotification(
                    'Keep Mining!',
                    `You have ${remaining} more thoughts to process today.`,
                    'reminder'
                );
            }
        } catch (error) {
            console.error('Reminder error:', error);
        }
    }

    showNotification(title, message, type = 'default') {
        try {
            chrome.notifications.create(this.notificationId + '_' + Date.now(), {
                type: 'basic',
                iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                title: title,
                message: message,
                priority: 1
            });
        } catch (error) {
            console.log('Notification error:', error);
        }
    }

    updateBadge(text) {
        chrome.action.setBadgeText({ text: text.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
    }

    async getSystemStatus() {
        try {
            const response = await fetch(`${this.apiUrl}/system/status`);
            if (response.ok) {
                return await response.json();
            } else {
                throw new Error('API unavailable');
            }
        } catch (error) {
            return {
                online: false,
                error: error.message
            };
        }
    }

    scheduleNotification(title, message, delay) {
        setTimeout(() => {
            this.showNotification(title, message, 'scheduled');
        }, delay);
    }

    async checkDailyReset() {
        try {
            const storage = await chrome.storage.local.get(['lastDailyReset']);
            const today = new Date().toDateString();
            
            if (storage.lastDailyReset !== today) {
                this.handleDailyReset();
                await chrome.storage.local.set({ lastDailyReset: today });
            }
        } catch (error) {
            console.error('Daily reset check error:', error);
        }
    }

    getNextMidnight() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow.getTime();
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
}

// Initialize background service
const backgroundService = new BackgroundService();

// Keep service worker alive
chrome.runtime.onSuspend.addListener(() => {
    console.log('Background service suspending');
});

// Handle external connections
chrome.runtime.onConnectExternal.addListener((port) => {
    console.log('External connection established');
    
    port.onMessage.addListener((msg) => {
        if (msg.action === 'ping') {
            port.postMessage({ response: 'pong' });
        }
    });
});
