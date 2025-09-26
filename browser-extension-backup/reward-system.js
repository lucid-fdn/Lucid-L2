// Advanced mGas Earning & Reward System for Lucid L2™
// Phase 8.3 Implementation

class RewardSystem {
    constructor(extensionState) {
        this.state = extensionState;
        this.achievements = this.getAchievements();
        this.qualityThresholds = {
            excellent: 0.9,
            good: 0.7,
            average: 0.5
        };
        this.streakMultipliers = {
            3: 1.1,   // 10% bonus
            7: 1.25,  // 25% bonus
            14: 1.5,  // 50% bonus
            30: 2.0   // 100% bonus
        };
        this.referralRewards = {
            referee: 50,  // mGas for new user
            referrer: 25  // mGas for referring user
        };
        this.conversionRate = 100; // 100 mGas = 1 LUCID
    }

    // Advanced Quality Assessment
    async assessQuality(text, aiResponse) {
        const metrics = {
            creativity: this.assessCreativity(text),
            complexity: this.assessComplexity(text),
            coherence: this.assessCoherence(text),
            uniqueness: await this.assessUniqueness(text),
            aiEngagement: this.assessAIEngagement(aiResponse)
        };

        const weights = {
            creativity: 0.25,
            complexity: 0.2,
            coherence: 0.2,
            uniqueness: 0.2,
            aiEngagement: 0.15
        };

        const qualityScore = Object.keys(metrics).reduce((total, key) => {
            return total + (metrics[key] * weights[key]);
        }, 0);

        return {
            score: qualityScore,
            breakdown: metrics,
            tier: this.getQualityTier(qualityScore)
        };
    }

    assessCreativity(text) {
        const creativeWords = [
            'imagine', 'create', 'invent', 'design', 'dream', 'explore',
            'discover', 'innovation', 'original', 'unique', 'artistic',
            'metaphor', 'story', 'poetry', 'vision', 'fantasy'
        ];
        
        const words = text.toLowerCase().split(/\s+/);
        const creativeCount = words.filter(word => 
            creativeWords.some(creative => word.includes(creative))
        ).length;
        
        return Math.min(creativeCount / words.length * 10, 1);
    }

    assessComplexity(text) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim());
        const words = text.split(/\s+/);
        const avgSentenceLength = words.length / sentences.length;
        
        const complexWords = words.filter(word => word.length > 6).length;
        const complexityRatio = complexWords / words.length;
        
        return Math.min((avgSentenceLength / 15) * 0.6 + complexityRatio * 0.4, 1);
    }

    assessCoherence(text) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim());
        if (sentences.length < 2) return 0.5;
        
        const transitionWords = [
            'however', 'therefore', 'furthermore', 'meanwhile', 'consequently',
            'nevertheless', 'moreover', 'additionally', 'similarly', 'contrast'
        ];
        
        const hasTransitions = sentences.some(sentence => 
            transitionWords.some(word => sentence.toLowerCase().includes(word))
        );
        
        return hasTransitions ? 0.8 : 0.6;
    }

    async assessUniqueness(text) {
        // Check against recent history for uniqueness
        const recentTexts = this.state.history.slice(-10).map(item => item.text);
        const similarity = this.calculateSimilarity(text, recentTexts);
        return 1 - similarity;
    }

    assessAIEngagement(response) {
        if (!response) return 0.5;
        
        const engagementIndicators = [
            'interesting', 'fascinating', 'thought-provoking', 'creative',
            'insightful', 'compelling', 'remarkable', 'excellent'
        ];
        
        const hasEngagement = engagementIndicators.some(indicator => 
            response.toLowerCase().includes(indicator)
        );
        
        return hasEngagement ? 0.9 : 0.6;
    }

    calculateSimilarity(text, recentTexts) {
        if (recentTexts.length === 0) return 0;
        
        const textWords = new Set(text.toLowerCase().split(/\s+/));
        let maxSimilarity = 0;
        
        recentTexts.forEach(recentText => {
            const recentWords = new Set(recentText.toLowerCase().split(/\s+/));
            const intersection = new Set([...textWords].filter(x => recentWords.has(x)));
            const union = new Set([...textWords, ...recentWords]);
            const similarity = intersection.size / union.size;
            maxSimilarity = Math.max(maxSimilarity, similarity);
        });
        
        return maxSimilarity;
    }

    getQualityTier(score) {
        if (score >= this.qualityThresholds.excellent) return 'excellent';
        if (score >= this.qualityThresholds.good) return 'good';
        if (score >= this.qualityThresholds.average) return 'average';
        return 'basic';
    }

    // Advanced Earning Calculation
    calculateEarnings(baseReward, qualityAssessment, streakDays, isFirstDaily = false) {
        let totalEarnings = baseReward;
        
        // Quality bonus
        const qualityBonus = this.calculateQualityBonus(baseReward, qualityAssessment);
        totalEarnings += qualityBonus;
        
        // Streak multiplier
        const streakMultiplier = this.getStreakMultiplier(streakDays);
        totalEarnings *= streakMultiplier;
        
        // First daily bonus
        if (isFirstDaily) {
            totalEarnings += 5;
        }
        
        // Time-based bonus (peak hours)
        const timeBonusMultiplier = this.getTimeBonusMultiplier();
        totalEarnings *= timeBonusMultiplier;
        
        return {
            total: Math.round(totalEarnings),
            breakdown: {
                base: baseReward,
                quality: qualityBonus,
                streak: streakMultiplier,
                firstDaily: isFirstDaily ? 5 : 0,
                timeBonus: timeBonusMultiplier
            }
        };
    }

    calculateQualityBonus(baseReward, qualityAssessment) {
        const multipliers = {
            excellent: 0.5,  // 50% bonus
            good: 0.3,       // 30% bonus
            average: 0.1,    // 10% bonus
            basic: 0         // No bonus
        };
        
        return Math.round(baseReward * multipliers[qualityAssessment.tier]);
    }

    getStreakMultiplier(streakDays) {
        for (const [days, multiplier] of Object.entries(this.streakMultipliers).reverse()) {
            if (streakDays >= parseInt(days)) {
                return multiplier;
            }
        }
        return 1.0;
    }

    getTimeBonusMultiplier() {
        const hour = new Date().getHours();
        // Peak hours: 9-11 AM, 2-4 PM, 7-9 PM
        const peakHours = [9, 10, 11, 14, 15, 16, 19, 20, 21];
        return peakHours.includes(hour) ? 1.1 : 1.0;
    }

    // mGas to LUCID Conversion System
    async convertMGasToLUCID(mGasAmount) {
        if (mGasAmount < this.conversionRate) {
            throw new Error(`Minimum ${this.conversionRate} mGas required for conversion`);
        }

        const lucidAmount = Math.floor(mGasAmount / this.conversionRate);
        const remainingMGas = mGasAmount % this.conversionRate;

        // Simulate blockchain transaction
        const txSignature = await this.simulateConversion(lucidAmount);

        // Update balances
        this.state.balance.mGas = remainingMGas;
        this.state.balance.lucid += lucidAmount;

        // Add to conversion history
        if (!this.state.conversionHistory) {
            this.state.conversionHistory = [];
        }

        this.state.conversionHistory.push({
            timestamp: Date.now(),
            mGasConverted: mGasAmount - remainingMGas,
            lucidReceived: lucidAmount,
            txSignature: txSignature
        });

        await this.state.saveToStorage();

        return {
            lucidReceived: lucidAmount,
            remainingMGas: remainingMGas,
            txSignature: txSignature
        };
    }

    async simulateConversion(lucidAmount) {
        // In real implementation, this would create a blockchain transaction
        await this.delay(2000);
        return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Social Features
    generateShareableContent(text, response, earned) {
        const templates = [
            `💭 Just had an AI breakthrough on Lucid L2™! "${text}" earned me ${earned} mGas! 🚀`,
            `🧠 Processing thoughts and earning mGas on Lucid L2™! Latest: "${text}" → +${earned} mGas 💎`,
            `⚡ Lucid L2™ AI interaction: "${text}" just earned ${earned} mGas! Join the revolution! 🌟`,
            `🎯 Quality AI response earned ${earned} mGas on Lucid L2™! "${text}" → Innovation rewards! 💰`
        ];

        const template = templates[Math.floor(Math.random() * templates.length)];
        return {
            content: template,
            hashtags: '#LucidL2 #AI #Blockchain #mGas #EarnWhileThinking',
            url: 'https://lucid-l2.com/extension'
        };
    }

    async processReferral(referrerCode, newUserAddress) {
        if (!referrerCode) return null;

        try {
            // Simulate referral validation
            const referrer = await this.validateReferrer(referrerCode);
            
            if (referrer) {
                // Reward new user
                this.state.balance.mGas += this.referralRewards.referee;
                
                // Simulate rewarding referrer
                await this.rewardReferrer(referrer, this.referralRewards.referrer);
                
                // Track referral
                if (!this.state.referralData) {
                    this.state.referralData = {
                        referredBy: referrerCode,
                        referrals: [],
                        totalEarned: 0
                    };
                }
                
                return {
                    success: true,
                    reward: this.referralRewards.referee,
                    referrer: referrer.address
                };
            }
        } catch (error) {
            console.error('Referral processing error:', error);
        }
        
        return null;
    }

    async validateReferrer(referrerCode) {
        // Simulate referrer validation
        await this.delay(1000);
        return {
            address: 'mock_referrer_address',
            valid: true
        };
    }

    async rewardReferrer(referrer, reward) {
        // In real implementation, this would send mGas to referrer
        await this.delay(500);
        return true;
    }

    // Achievement System
    getAchievements() {
        return [
            {
                id: 'first_thought',
                title: 'First Thought',
                description: 'Process your first AI thought',
                reward: 10,
                requirement: 'thoughts_processed',
                threshold: 1,
                icon: '🎯'
            },
            {
                id: 'creative_writer',
                title: 'Creative Writer',
                description: 'Get 10 excellent quality scores',
                reward: 50,
                requirement: 'excellent_quality',
                threshold: 10,
                icon: '✍️'
            },
            {
                id: 'streak_master',
                title: 'Streak Master',
                description: 'Maintain a 7-day streak',
                reward: 100,
                requirement: 'max_streak',
                threshold: 7,
                icon: '🔥'
            },
            {
                id: 'converter',
                title: 'Token Converter',
                description: 'Convert mGas to LUCID 5 times',
                reward: 25,
                requirement: 'conversions',
                threshold: 5,
                icon: '💰'
            },
            {
                id: 'social_butterfly',
                title: 'Social Butterfly',
                description: 'Share 20 AI responses',
                reward: 30,
                requirement: 'shares',
                threshold: 20,
                icon: '🦋'
            },
            {
                id: 'quality_guru',
                title: 'Quality Guru',
                description: 'Average quality score above 0.8',
                reward: 75,
                requirement: 'average_quality',
                threshold: 0.8,
                icon: '👑'
            },
            {
                id: 'batch_processor',
                title: 'Batch Processor',
                description: 'Process 50 thoughts in batch mode',
                reward: 40,
                requirement: 'batch_thoughts',
                threshold: 50,
                icon: '⚡'
            },
            {
                id: 'referral_champion',
                title: 'Referral Champion',
                description: 'Refer 10 new users',
                reward: 200,
                requirement: 'referrals',
                threshold: 10,
                icon: '🏆'
            }
        ];
    }

    checkAchievements() {
        const stats = this.calculateUserStats();
        const newAchievements = [];

        this.achievements.forEach(achievement => {
            const isUnlocked = this.state.unlockedAchievements?.includes(achievement.id);
            
            if (!isUnlocked && this.meetsRequirement(achievement, stats)) {
                newAchievements.push(achievement);
                
                // Initialize unlocked achievements array if needed
                if (!this.state.unlockedAchievements) {
                    this.state.unlockedAchievements = [];
                }
                
                this.state.unlockedAchievements.push(achievement.id);
                this.state.balance.mGas += achievement.reward;
            }
        });

        return newAchievements;
    }

    calculateUserStats() {
        const history = this.state.history || [];
        const conversionHistory = this.state.conversionHistory || [];
        
        const qualityScores = history.map(item => item.qualityScore || 0.5);
        const averageQuality = qualityScores.length > 0 
            ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length 
            : 0;

        return {
            thoughts_processed: history.length,
            excellent_quality: history.filter(item => item.qualityTier === 'excellent').length,
            max_streak: this.state.streak || 0,
            conversions: conversionHistory.length,
            shares: this.state.totalShares || 0,
            average_quality: averageQuality,
            batch_thoughts: history.filter(item => item.isBatch).length,
            referrals: this.state.referralData?.referrals.length || 0
        };
    }

    meetsRequirement(achievement, stats) {
        const statValue = stats[achievement.requirement];
        return statValue >= achievement.threshold;
    }

    // Leaderboard System
    async getLeaderboard(category = 'total_earnings', limit = 10) {
        try {
            // In real implementation, this would query a backend API
            const response = await fetch(`${this.state.apiUrl}/leaderboard?category=${category}&limit=${limit}`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Leaderboard fetch error:', error);
        }

        // Mock leaderboard data
        return this.generateMockLeaderboard(category, limit);
    }

    generateMockLeaderboard(category, limit) {
        const mockUsers = [
            { address: 'user1...', username: 'ThoughtMaster', value: 5000 },
            { address: 'user2...', username: 'AIEnthusiast', value: 4500 },
            { address: 'user3...', username: 'CreativeGenius', value: 4000 },
            { address: 'user4...', username: 'QualityKing', value: 3500 },
            { address: 'user5...', username: 'StreakLegend', value: 3000 },
        ];

        return mockUsers.slice(0, limit).map((user, index) => ({
            rank: index + 1,
            ...user,
            category: category
        }));
    }

    // Utility Methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    formatMGas(amount) {
        return amount.toLocaleString();
    }

    formatLUCID(amount) {
        return amount.toFixed(2);
    }

    getTimeUntilReset() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        const diff = tomorrow - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        return `${hours}h ${minutes}m`;
    }

    // Seasonal Events and Challenges
    getCurrentEvents() {
        const now = new Date();
        const events = [];

        // Weekend bonus
        if (now.getDay() === 0 || now.getDay() === 6) {
            events.push({
                type: 'weekend_bonus',
                title: 'Weekend Bonus',
                description: '+20% mGas earnings all weekend!',
                multiplier: 1.2,
                icon: '🎉'
            });
        }

        // Monthly challenge
        if (now.getDate() <= 7) {
            events.push({
                type: 'monthly_challenge',
                title: 'New Month Challenge',
                description: 'First week double rewards!',
                multiplier: 2.0,
                icon: '🚀'
            });
        }

        return events;
    }

    applyEventMultipliers(earnings) {
        const events = this.getCurrentEvents();
        let totalMultiplier = 1.0;

        events.forEach(event => {
            if (event.multiplier) {
                totalMultiplier *= event.multiplier;
            }
        });

        return Math.round(earnings * totalMultiplier);
    }
}

// Export for use in popup.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RewardSystem;
}
