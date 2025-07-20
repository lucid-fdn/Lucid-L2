/**
 * Phase 8.5: Anti-Cheat & Fraud Prevention System
 * Comprehensive fraud detection and prevention for Lucid L2™ mGas rewards
 */

class AntiCheatSystem {
  constructor() {
    this.behaviorAnalyzer = new BehaviorAnalyzer();
    this.qualityValidator = new QualityValidator();
    this.patternRecognizer = new PatternRecognizer();
    this.proofOfHuman = new ProofOfHuman();
    this.walletClusterDetector = new WalletClusterDetector();
    this.communityReporter = new CommunityReporter();
    this.riskThresholds = {
      low: 30,
      medium: 50,
      high: 70
    };
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    // Initialize sub-systems
    await this.behaviorAnalyzer.initialize();
    await this.qualityValidator.initialize();
    await this.patternRecognizer.initialize();
    await this.proofOfHuman.initialize();
    await this.walletClusterDetector.initialize();
    await this.communityReporter.initialize();
    
    this.isInitialized = true;
    console.log('🛡️ Anti-Cheat System initialized');
  }

  async analyzeInteraction(interaction) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const startTime = Date.now();
      
      // Calculate comprehensive risk score
      const riskScore = await this.calculateRiskScore(interaction);
      
      // Determine action based on risk level
      const action = await this.determineAction(interaction, riskScore);
      
      // Log analysis results
      await this.logAnalysis(interaction, riskScore, action);
      
      const processingTime = Date.now() - startTime;
      console.log(`🛡️ Risk analysis completed in ${processingTime}ms`);
      
      return {
        ...action,
        riskScore,
        processingTime,
        timestamp: Date.now()
      };
      
    } catch (error) {
      console.error('🚨 Anti-cheat analysis failed:', error);
      
      // Fail-safe: allow with reduced rewards
      return {
        blocked: false,
        rewardMultiplier: 0.8,
        reason: 'Anti-cheat analysis failed, proceeding with caution',
        error: error.message,
        fallback: true
      };
    }
  }

  async calculateRiskScore(interaction) {
    const analyses = await Promise.all([
      this.behaviorAnalyzer.analyze(interaction),
      this.qualityValidator.validate(interaction),
      this.patternRecognizer.recognize(interaction),
      this.walletClusterDetector.analyze(interaction),
      this.communityReporter.getReports(interaction)
    ]);

    const [behavioral, quality, pattern, wallet, community] = analyses;

    const total = behavioral.riskScore + quality.riskScore + pattern.riskScore + 
                  wallet.riskScore + community.riskScore;

    return {
      behavioral: behavioral.riskScore,
      quality: quality.riskScore,
      pattern: pattern.riskScore,
      wallet: wallet.riskScore,
      community: community.riskScore,
      total: Math.min(100, total), // Cap at 100
      breakdown: { behavioral, quality, pattern, wallet, community },
      confidence: this.calculateConfidence(analyses)
    };
  }

  calculateConfidence(analyses) {
    // Calculate confidence based on data availability and consistency
    let confidence = 0;
    let factors = 0;

    analyses.forEach(analysis => {
      if (analysis.confidence !== undefined) {
        confidence += analysis.confidence;
        factors++;
      }
    });

    return factors > 0 ? Math.round(confidence / factors) : 50;
  }

  async determineAction(interaction, riskScore) {
    if (riskScore.total >= this.riskThresholds.high) {
      return await this.handleHighRisk(interaction, riskScore);
    } else if (riskScore.total >= this.riskThresholds.medium) {
      return await this.handleMediumRisk(interaction, riskScore);
    } else {
      return await this.handleLowRisk(interaction, riskScore);
    }
  }

  async handleHighRisk(interaction, riskScore) {
    // Block interaction and require proof-of-human
    const challenge = await this.proofOfHuman.generateChallenge('high');
    
    // Notify user about security check
    await this.notifyUser('security_check', {
      level: 'high',
      message: 'Security verification required due to suspicious activity patterns'
    });

    return {
      blocked: true,
      reason: 'High fraud risk detected',
      challenge: challenge,
      riskScore: riskScore,
      appeal: true,
      recommendations: this.generateRecommendations(riskScore)
    };
  }

  async handleMediumRisk(interaction, riskScore) {
    // Allow with reduced rewards and optional proof-of-human
    const rewardMultiplier = 0.5;
    let challenge = null;

    // 50% chance of challenge for medium risk
    if (Math.random() < 0.5) {
      challenge = await this.proofOfHuman.generateChallenge('medium');
    }

    // Notify user about reduced rewards
    await this.notifyUser('reduced_rewards', {
      level: 'medium',
      multiplier: rewardMultiplier,
      message: 'Reduced rewards due to security concerns'
    });

    return {
      blocked: false,
      rewardMultiplier,
      reason: 'Medium fraud risk detected',
      challenge,
      riskScore: riskScore,
      monitoring: true
    };
  }

  async handleLowRisk(interaction, riskScore) {
    // Allow with full rewards
    return {
      blocked: false,
      rewardMultiplier: 1.0,
      reason: 'Low fraud risk - proceeding normally',
      riskScore: riskScore,
      monitoring: false
    };
  }

  generateRecommendations(riskScore) {
    const recommendations = [];
    
    if (riskScore.behavioral > 20) {
      recommendations.push('Review typing patterns and interaction behavior');
    }
    
    if (riskScore.quality > 20) {
      recommendations.push('Improve content quality and originality');
    }
    
    if (riskScore.wallet > 15) {
      recommendations.push('Verify wallet ownership and transaction history');
    }
    
    if (riskScore.pattern > 10) {
      recommendations.push('Vary interaction patterns to avoid detection');
    }
    
    if (riskScore.community > 5) {
      recommendations.push('Address community reports and concerns');
    }
    
    return recommendations;
  }

  async notifyUser(type, data) {
    try {
      if (chrome && chrome.notifications) {
        const notification = {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Lucid L2™ Security',
          message: data.message
        };
        
        chrome.notifications.create(notification);
      }
    } catch (error) {
      console.warn('Failed to send notification:', error);
    }
  }

  async logAnalysis(interaction, riskScore, action) {
    const logEntry = {
      timestamp: Date.now(),
      walletAddress: interaction.walletAddress,
      riskScore: riskScore.total,
      action: action.blocked ? 'blocked' : 'allowed',
      rewardMultiplier: action.rewardMultiplier,
      breakdown: riskScore.breakdown,
      userAgent: navigator.userAgent,
      sessionId: this.getSessionId()
    };

    // Store in local storage for analysis
    await this.storeLogEntry(logEntry);
  }

  async storeLogEntry(entry) {
    try {
      const logs = await this.getLogs();
      logs.push(entry);
      
      // Keep only last 1000 entries
      if (logs.length > 1000) {
        logs.splice(0, logs.length - 1000);
      }
      
      await new Promise(resolve => {
        chrome.storage.local.set({ 'anticheat_logs': logs }, resolve);
      });
    } catch (error) {
      console.error('Failed to store log entry:', error);
    }
  }

  async getLogs() {
    return new Promise(resolve => {
      chrome.storage.local.get(['anticheat_logs'], result => {
        resolve(result.anticheat_logs || []);
      });
    });
  }

  getSessionId() {
    if (!this.sessionId) {
      this.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    return this.sessionId;
  }

  // Public API for integration
  async validateChallenge(challengeId, response) {
    return await this.proofOfHuman.validateResponse(challengeId, response);
  }

  async submitReport(report) {
    return await this.communityReporter.submitReport(report);
  }

  async getAnalysisHistory(walletAddress) {
    const logs = await this.getLogs();
    return logs.filter(log => log.walletAddress === walletAddress);
  }

  async updateThresholds(newThresholds) {
    this.riskThresholds = { ...this.riskThresholds, ...newThresholds };
    console.log('🛡️ Risk thresholds updated:', this.riskThresholds);
  }
}

// Export for use in other modules
window.AntiCheatSystem = AntiCheatSystem;
