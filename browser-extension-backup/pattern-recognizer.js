/**
 * Phase 8.5: Pattern Recognition System
 * Detects fraudulent patterns in user behavior across multiple interactions
 */

class PatternRecognizer {
  constructor() {
    this.isInitialized = false;
    this.patterns = new Map();
    this.fraudPatterns = new Set();
    this.temporalPatterns = new Map();
    this.sequencePatterns = new Map();
  }

  async initialize() {
    if (this.isInitialized) return;
    
    // Load known fraud patterns
    await this.loadFraudPatterns();
    
    this.isInitialized = true;
    console.log('🔍 Pattern Recognizer initialized');
  }

  async recognize(interaction) {
    try {
      // Check for null/undefined critical data - trigger fallback if insufficient
      if (!interaction || !interaction.walletAddress || 
          (interaction.text === null && interaction.responseTime === undefined && 
           interaction.thinkingTime === null && !interaction.mouseMovements)) {
        return {
          riskScore: 10, // Default medium risk for insufficient data
          confidence: 0,
          error: 'Insufficient interaction data',
          fallback: true
        };
      }

      const analyses = {
        temporal: this.analyzeTemporalPatterns(interaction),
        sequence: this.analyzeSequencePatterns(interaction),
        frequency: this.analyzeFrequencyPatterns(interaction),
        behavioral: this.analyzeBehavioralPatterns(interaction),
        clustering: this.analyzeClusteringPatterns(interaction)
      };

      const riskScore = this.calculatePatternRisk(analyses);
      const confidence = this.calculatePatternConfidence(analyses);

      // Store pattern data for future analysis
      this.storePatternData(interaction);

      return {
        riskScore,
        confidence,
        analyses,
        flags: this.generatePatternFlags(analyses),
        reason: this.generatePatternReason(analyses)
      };
    } catch (error) {
      console.error('Pattern recognition failed:', error);
      return {
        riskScore: 5, // Default low risk
        confidence: 0,
        error: error.message,
        fallback: true
      };
    }
  }

  analyzeTemporalPatterns(interaction) {
    const walletAddress = interaction.walletAddress;
    const currentTime = Date.now();
    
    // Get historical timing data
    const history = this.getTemporalHistory(walletAddress);
    
    if (history.length < 3) {
      return { risk: 0, reason: 'Insufficient temporal data' };
    }

    let risk = 0;
    const patterns = {
      regular: this.detectRegularIntervals(history),
      burst: this.detectBurstPatterns(history),
      inhuman: this.detectInhumanTiming(history)
    };

    if (patterns.regular.score > 0.8) risk += 15; // Too regular
    if (patterns.burst.detected) risk += 10; // Burst activity
    if (patterns.inhuman.detected) risk += 20; // Inhuman timing

    // Store current interaction time
    history.push(currentTime);
    if (history.length > 100) history.shift();

    return { risk, patterns, history: history.length };
  }

  analyzeSequencePatterns(interaction) {
    const walletAddress = interaction.walletAddress;
    const sequence = this.extractSequenceFeatures(interaction);
    
    // Get historical sequence data
    const history = this.getSequenceHistory(walletAddress);
    
    if (history.length < 5) {
      return { risk: 0, reason: 'Insufficient sequence data' };
    }

    let risk = 0;
    const patterns = {
      repetitive: this.detectRepetitiveSequences(history),
      predictable: this.detectPredictableSequences(history),
      automated: this.detectAutomatedSequences(history)
    };

    if (patterns.repetitive.score > 0.7) risk += 12; // Too repetitive
    if (patterns.predictable.score > 0.8) risk += 15; // Too predictable
    if (patterns.automated.detected) risk += 18; // Automated behavior

    // Store current sequence
    history.push(sequence);
    if (history.length > 50) history.shift();

    return { risk, patterns, sequence, history: history.length };
  }

  analyzeFrequencyPatterns(interaction) {
    const walletAddress = interaction.walletAddress;
    const currentHour = new Date().getHours();
    const currentDay = new Date().getDay();
    
    // Get frequency data
    const frequency = this.getFrequencyData(walletAddress);
    
    let risk = 0;
    const patterns = {
      hourly: this.analyzeHourlyFrequency(frequency.hourly, currentHour),
      daily: this.analyzeDailyFrequency(frequency.daily, currentDay),
      overall: this.analyzeOverallFrequency(frequency.overall)
    };

    if (patterns.hourly.suspicious) risk += 10;
    if (patterns.daily.suspicious) risk += 8;
    if (patterns.overall.excessive) risk += 15;

    // Update frequency data
    this.updateFrequencyData(walletAddress, currentHour, currentDay);

    return { risk, patterns, frequency };
  }

  analyzeBehavioralPatterns(interaction) {
    const walletAddress = interaction.walletAddress;
    const behavior = this.extractBehaviorFeatures(interaction);
    
    // Get behavioral history
    const history = this.getBehaviorHistory(walletAddress);
    
    if (history.length < 3) {
      return { risk: 0, reason: 'Insufficient behavioral data' };
    }

    let risk = 0;
    const patterns = {
      consistency: this.analyzeBehaviorConsistency(history, behavior),
      deviation: this.analyzeBehaviorDeviation(history, behavior),
      evolution: this.analyzeBehaviorEvolution(history)
    };

    if (patterns.consistency.score > 0.95) risk += 12; // Too consistent
    if (patterns.deviation.significant) risk += 15; // Significant deviation
    if (patterns.evolution.unnatural) risk += 10; // Unnatural evolution

    // Store current behavior
    history.push(behavior);
    if (history.length > 20) history.shift();

    return { risk, patterns, behavior, history: history.length };
  }

  analyzeClusteringPatterns(interaction) {
    const walletAddress = interaction.walletAddress;
    const features = this.extractClusteringFeatures(interaction);
    
    // Analyze clustering with other users
    const clusters = this.findSimilarBehaviors(features);
    
    let risk = 0;
    const patterns = {
      similarity: this.analyzeSimilarityPatterns(clusters),
      grouping: this.analyzeGroupingPatterns(clusters),
      coordination: this.analyzeCoordinationPatterns(clusters)
    };

    if (patterns.similarity.high) risk += 10;
    if (patterns.grouping.detected) risk += 15;
    if (patterns.coordination.detected) risk += 20;

    return { risk, patterns, clusters: clusters.length };
  }

  calculatePatternRisk(analyses) {
    const weights = {
      temporal: 0.25,
      sequence: 0.25,
      frequency: 0.2,
      behavioral: 0.2,
      clustering: 0.1
    };

    return Math.round(
      (analyses.temporal.risk * weights.temporal) +
      (analyses.sequence.risk * weights.sequence) +
      (analyses.frequency.risk * weights.frequency) +
      (analyses.behavioral.risk * weights.behavioral) +
      (analyses.clustering.risk * weights.clustering)
    );
  }

  calculatePatternConfidence(analyses) {
    let confidence = 40;
    
    if (analyses.temporal.history > 10) confidence += 15;
    if (analyses.sequence.history > 10) confidence += 15;
    if (analyses.behavioral.history > 5) confidence += 15;
    if (analyses.clustering.clusters > 3) confidence += 15;
    
    return Math.min(90, confidence);
  }

  generatePatternFlags(analyses) {
    const flags = [];
    
    if (analyses.temporal.risk > 15) flags.push('SUSPICIOUS_TEMPORAL_PATTERNS');
    if (analyses.sequence.risk > 15) flags.push('PREDICTABLE_SEQUENCES');
    if (analyses.frequency.risk > 10) flags.push('UNUSUAL_FREQUENCY');
    if (analyses.behavioral.risk > 10) flags.push('BEHAVIORAL_PATTERNS');
    if (analyses.clustering.risk > 15) flags.push('COORDINATED_BEHAVIOR');
    
    return flags;
  }

  generatePatternReason(analyses) {
    const reasons = [];
    
    // Add null checks for all analysis components
    if (analyses && analyses.temporal && analyses.temporal.risk > 15) {
      reasons.push('Suspicious temporal patterns');
    }
    if (analyses && analyses.sequence && analyses.sequence.risk > 15) {
      reasons.push('Predictable behavior sequences');
    }
    if (analyses && analyses.frequency && analyses.frequency.risk > 10) {
      reasons.push('Unusual activity frequency');
    }
    if (analyses && analyses.behavioral && analyses.behavioral.risk > 10) {
      reasons.push('Behavioral pattern anomalies');
    }
    if (analyses && analyses.clustering && analyses.clustering.risk > 15) {
      reasons.push('Coordinated behavior detected');
    }
    
    return reasons.length > 0 ? reasons.join(', ') : 'Normal pattern behavior';
  }

  // Helper methods for temporal analysis
  getTemporalHistory(walletAddress) {
    if (!this.temporalPatterns.has(walletAddress)) {
      this.temporalPatterns.set(walletAddress, []);
    }
    return this.temporalPatterns.get(walletAddress);
  }

  detectRegularIntervals(history) {
    if (history.length < 5) return { score: 0, intervals: [] };
    
    const intervals = [];
    for (let i = 1; i < history.length; i++) {
      intervals.push(history[i] - history[i-1]);
    }
    
    // Calculate coefficient of variation
    const mean = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    
    const cv = stdDev / mean;
    const score = Math.max(0, 1 - cv); // Lower variation = higher score
    
    return { score, intervals, mean, stdDev, cv };
  }

  detectBurstPatterns(history) {
    if (history.length < 10) return { detected: false, bursts: [] };
    
    const intervals = [];
    for (let i = 1; i < history.length; i++) {
      intervals.push(history[i] - history[i-1]);
    }
    
    const shortIntervals = intervals.filter(interval => interval < 5000); // Less than 5 seconds
    const burstRatio = shortIntervals.length / intervals.length;
    
    return { 
      detected: burstRatio > 0.3, 
      bursts: shortIntervals.length,
      ratio: burstRatio
    };
  }

  detectInhumanTiming(history) {
    if (history.length < 5) return { detected: false, reason: 'Insufficient data' };
    
    const intervals = [];
    for (let i = 1; i < history.length; i++) {
      intervals.push(history[i] - history[i-1]);
    }
    
    // Check for impossibly consistent timing
    const uniqueIntervals = new Set(intervals.map(i => Math.round(i / 100) * 100));
    const uniformity = 1 - (uniqueIntervals.size / intervals.length);
    
    // Check for impossibly fast responses
    const fastResponses = intervals.filter(i => i < 1000).length;
    const fastRatio = fastResponses / intervals.length;
    
    return {
      detected: uniformity > 0.8 || fastRatio > 0.5,
      uniformity,
      fastRatio,
      reason: uniformity > 0.8 ? 'Too uniform' : fastRatio > 0.5 ? 'Too fast' : 'Normal'
    };
  }

  // Helper methods for sequence analysis
  getSequenceHistory(walletAddress) {
    if (!this.sequencePatterns.has(walletAddress)) {
      this.sequencePatterns.set(walletAddress, []);
    }
    return this.sequencePatterns.get(walletAddress);
  }

  extractSequenceFeatures(interaction) {
    return {
      textLength: interaction.text ? interaction.text.length : 0,
      responseTime: interaction.responseTime || 0,
      thinkingTime: interaction.thinkingTime || 0,
      keystrokeCount: interaction.keystrokeTimings ? interaction.keystrokeTimings.length : 0,
      mouseMovements: interaction.mouseMovements ? interaction.mouseMovements.length : 0,
      timestamp: Date.now()
    };
  }

  detectRepetitiveSequences(history) {
    if (history.length < 10) return { score: 0, patterns: [] };
    
    const sequences = [];
    for (let i = 0; i < history.length - 2; i++) {
      const sequence = [
        Math.round(history[i].textLength / 10),
        Math.round(history[i].responseTime / 1000),
        Math.round(history[i].thinkingTime / 1000)
      ].join(',');
      sequences.push(sequence);
    }
    
    const uniqueSequences = new Set(sequences);
    const repetitiveScore = 1 - (uniqueSequences.size / sequences.length);
    
    return { score: repetitiveScore, patterns: sequences.length, unique: uniqueSequences.size };
  }

  detectPredictableSequences(history) {
    if (history.length < 8) return { score: 0, predictions: [] };
    
    let correctPredictions = 0;
    const predictions = [];
    
    for (let i = 3; i < history.length; i++) {
      const recent = history.slice(i-3, i);
      const actual = history[i];
      
      // Simple prediction based on recent average
      const predictedLength = recent.reduce((sum, h) => sum + h.textLength, 0) / recent.length;
      const predictedResponse = recent.reduce((sum, h) => sum + h.responseTime, 0) / recent.length;
      
      const lengthError = Math.abs(actual.textLength - predictedLength) / (predictedLength || 1);
      const responseError = Math.abs(actual.responseTime - predictedResponse) / (predictedResponse || 1);
      
      if (lengthError < 0.2 && responseError < 0.2) {
        correctPredictions++;
      }
      
      predictions.push({ lengthError, responseError });
    }
    
    const score = correctPredictions / predictions.length;
    return { score, predictions: predictions.length, correct: correctPredictions };
  }

  detectAutomatedSequences(history) {
    if (history.length < 5) return { detected: false, evidence: [] };
    
    const evidence = [];
    
    // Check for identical response times
    const responseTimes = history.map(h => h.responseTime);
    const uniqueResponseTimes = new Set(responseTimes);
    if (uniqueResponseTimes.size < responseTimes.length * 0.5) {
      evidence.push('Identical response times');
    }
    
    // Check for identical text lengths
    const textLengths = history.map(h => h.textLength);
    const uniqueTextLengths = new Set(textLengths);
    if (uniqueTextLengths.size < textLengths.length * 0.5) {
      evidence.push('Identical text lengths');
    }
    
    // Check for zero thinking time
    const zeroThinkingCount = history.filter(h => h.thinkingTime === 0).length;
    if (zeroThinkingCount > history.length * 0.7) {
      evidence.push('No thinking time');
    }
    
    return { detected: evidence.length > 1, evidence };
  }

  // Helper methods for frequency analysis
  getFrequencyData(walletAddress) {
    if (!this.patterns.has(walletAddress)) {
      this.patterns.set(walletAddress, {
        hourly: new Array(24).fill(0),
        daily: new Array(7).fill(0),
        overall: { count: 0, firstSeen: Date.now() }
      });
    }
    return this.patterns.get(walletAddress);
  }

  analyzeHourlyFrequency(hourlyData, currentHour) {
    const totalInteractions = hourlyData.reduce((sum, count) => sum + count, 0);
    const avgPerHour = totalInteractions / 24;
    const currentHourCount = hourlyData[currentHour];
    
    // Check if current hour has unusual activity
    const suspicious = currentHourCount > avgPerHour * 3 || 
                      (totalInteractions > 50 && currentHourCount > 10);
    
    return { suspicious, currentHourCount, avgPerHour, totalInteractions };
  }

  analyzeDailyFrequency(dailyData, currentDay) {
    const totalInteractions = dailyData.reduce((sum, count) => sum + count, 0);
    const avgPerDay = totalInteractions / 7;
    const currentDayCount = dailyData[currentDay];
    
    // Check if current day has unusual activity
    const suspicious = currentDayCount > avgPerDay * 2 || 
                      (totalInteractions > 100 && currentDayCount > 20);
    
    return { suspicious, currentDayCount, avgPerDay, totalInteractions };
  }

  analyzeOverallFrequency(overallData) {
    const timespan = Date.now() - overallData.firstSeen;
    const avgPerHour = overallData.count / (timespan / (1000 * 60 * 60));
    
    // Check for excessive activity
    const excessive = avgPerHour > 10 || // More than 10 interactions per hour
                     (timespan < 24 * 60 * 60 * 1000 && overallData.count > 50); // More than 50 in first day
    
    return { excessive, avgPerHour, timespan, count: overallData.count };
  }

  updateFrequencyData(walletAddress, currentHour, currentDay) {
    const frequency = this.getFrequencyData(walletAddress);
    
    frequency.hourly[currentHour]++;
    frequency.daily[currentDay]++;
    frequency.overall.count++;
  }

  // Helper methods for behavioral analysis
  getBehaviorHistory(walletAddress) {
    const key = `behavior_${walletAddress}`;
    if (!this.patterns.has(key)) {
      this.patterns.set(key, []);
    }
    return this.patterns.get(key);
  }

  extractBehaviorFeatures(interaction) {
    return {
      responseTime: interaction.responseTime || 0,
      thinkingTime: interaction.thinkingTime || 0,
      textLength: interaction.text ? interaction.text.length : 0,
      keystrokeCount: interaction.keystrokeTimings ? interaction.keystrokeTimings.length : 0,
      mouseMovements: interaction.mouseMovements ? interaction.mouseMovements.length : 0,
      sessionDuration: interaction.sessionDuration || 0,
      timestamp: Date.now()
    };
  }

  analyzeBehaviorConsistency(history, currentBehavior) {
    const recent = history.slice(-5);
    const avgResponseTime = recent.reduce((sum, h) => sum + h.responseTime, 0) / recent.length;
    const avgThinkingTime = recent.reduce((sum, h) => sum + h.thinkingTime, 0) / recent.length;
    const avgTextLength = recent.reduce((sum, h) => sum + h.textLength, 0) / recent.length;
    
    // Calculate consistency score
    const responseVariance = recent.reduce((sum, h) => sum + Math.pow(h.responseTime - avgResponseTime, 2), 0) / recent.length;
    const thinkingVariance = recent.reduce((sum, h) => sum + Math.pow(h.thinkingTime - avgThinkingTime, 2), 0) / recent.length;
    const textVariance = recent.reduce((sum, h) => sum + Math.pow(h.textLength - avgTextLength, 2), 0) / recent.length;
    
    const responseCV = Math.sqrt(responseVariance) / (avgResponseTime || 1);
    const thinkingCV = Math.sqrt(thinkingVariance) / (avgThinkingTime || 1);
    const textCV = Math.sqrt(textVariance) / (avgTextLength || 1);
    
    const consistencyScore = 1 - ((responseCV + thinkingCV + textCV) / 3);
    
    return { score: Math.max(0, consistencyScore), responseCV, thinkingCV, textCV };
  }

  analyzeBehaviorDeviation(history, currentBehavior) {
    const recent = history.slice(-10);
    const avgResponseTime = recent.reduce((sum, h) => sum + h.responseTime, 0) / recent.length;
    const avgThinkingTime = recent.reduce((sum, h) => sum + h.thinkingTime, 0) / recent.length;
    const avgTextLength = recent.reduce((sum, h) => sum + h.textLength, 0) / recent.length;
    
    // Calculate standard deviations
    const responseStdDev = Math.sqrt(recent.reduce((sum, h) => sum + Math.pow(h.responseTime - avgResponseTime, 2), 0) / recent.length);
    const thinkingStdDev = Math.sqrt(recent.reduce((sum, h) => sum + Math.pow(h.thinkingTime - avgThinkingTime, 2), 0) / recent.length);
    const textStdDev = Math.sqrt(recent.reduce((sum, h) => sum + Math.pow(h.textLength - avgTextLength, 2), 0) / recent.length);
    
    // Calculate z-scores for current behavior
    const responseZScore = Math.abs(currentBehavior.responseTime - avgResponseTime) / (responseStdDev || 1);
    const thinkingZScore = Math.abs(currentBehavior.thinkingTime - avgThinkingTime) / (thinkingStdDev || 1);
    const textZScore = Math.abs(currentBehavior.textLength - avgTextLength) / (textStdDev || 1);
    
    const significant = responseZScore > 2 || thinkingZScore > 2 || textZScore > 2;
    
    return { significant, responseZScore, thinkingZScore, textZScore };
  }

  analyzeBehaviorEvolution(history) {
    if (history.length < 10) return { unnatural: false, trends: [] };
    
    const first = history.slice(0, 5);
    const last = history.slice(-5);
    
    const firstAvgResponse = first.reduce((sum, h) => sum + h.responseTime, 0) / first.length;
    const lastAvgResponse = last.reduce((sum, h) => sum + h.responseTime, 0) / last.length;
    
    const firstAvgThinking = first.reduce((sum, h) => sum + h.thinkingTime, 0) / first.length;
    const lastAvgThinking = last.reduce((sum, h) => sum + h.thinkingTime, 0) / last.length;
    
    const responseImprovement = (firstAvgResponse - lastAvgResponse) / (firstAvgResponse || 1);
    const thinkingImprovement = (firstAvgThinking - lastAvgThinking) / (firstAvgThinking || 1);
    
    // Check for unnatural improvements
    const unnatural = responseImprovement > 0.5 || thinkingImprovement > 0.5;
    
    return { unnatural, responseImprovement, thinkingImprovement };
  }

  // Helper methods for clustering analysis
  extractClusteringFeatures(interaction) {
    return {
      responseTime: interaction.responseTime || 0,
      thinkingTime: interaction.thinkingTime || 0,
      textLength: interaction.text ? interaction.text.length : 0,
      keystrokeCount: interaction.keystrokeTimings ? interaction.keystrokeTimings.length : 0,
      mouseMovements: interaction.mouseMovements ? interaction.mouseMovements.length : 0,
      hour: new Date().getHours(),
      day: new Date().getDay()
    };
  }

  findSimilarBehaviors(features) {
    const similarities = [];
    
    // Compare with other users' patterns
    this.patterns.forEach((data, key) => {
      if (key.startsWith('behavior_')) {
        const history = data.slice(-5);
        history.forEach(behavior => {
          const similarity = this.calculateFeatureSimilarity(features, behavior);
          if (similarity > 0.8) {
            similarities.push({ key, behavior, similarity });
          }
        });
      }
    });
    
    return similarities;
  }

  calculateFeatureSimilarity(features1, features2) {
    const keys = ['responseTime', 'thinkingTime', 'textLength', 'keystrokeCount', 'mouseMovements'];
    let similarity = 0;
    
    keys.forEach(key => {
      const val1 = features1[key] || 0;
      const val2 = features2[key] || 0;
      const diff = Math.abs(val1 - val2) / Math.max(val1, val2, 1);
      similarity += 1 - diff;
    });
    
    return similarity / keys.length;
  }

  analyzeSimilarityPatterns(clusters) {
    const high = clusters.filter(c => c.similarity > 0.9).length > 3;
    return { high, count: clusters.length };
  }

  analyzeGroupingPatterns(clusters) {
    const walletGroups = new Map();
    
    clusters.forEach(cluster => {
      const wallet = cluster.key.replace('behavior_', '');
      walletGroups.set(wallet, (walletGroups.get(wallet) || 0) + 1);
    });
    
    const detected = Array.from(walletGroups.values()).some(count => count > 2);
    return { detected, groups: walletGroups.size };
  }

  analyzeCoordinationPatterns(clusters) {
    const timeGroups = new Map();
    
    clusters.forEach(cluster => {
      const timeKey = Math.floor(cluster.behavior.timestamp / (5 * 60 * 1000)); // 5-minute windows
      timeGroups.set(timeKey, (timeGroups.get(timeKey) || 0) + 1);
    });
    
    const detected = Array.from(timeGroups.values()).some(count => count > 3);
    return { detected, timeGroups: timeGroups.size };
  }

  storePatternData(interaction) {
    const walletAddress = interaction.walletAddress;
    const timestamp = Date.now();
    
    // Store in temporal patterns
    const temporal = this.getTemporalHistory(walletAddress);
    temporal.push(timestamp);
    
    // Store in sequence patterns
    const sequence = this.getSequenceHistory(walletAddress);
    sequence.push(this.extractSequenceFeatures(interaction));
    
    // Store in behavioral patterns
    const behavioral = this.getBehaviorHistory(walletAddress);
    behavioral.push(this.extractBehaviorFeatures(interaction));
  }

  async loadFraudPatterns() {
    try {
      const patterns = await new Promise(resolve => {
        chrome.storage.local.get(['fraud_patterns'], result => {
          resolve(result.fraud_patterns || []);
        });
      });
      
      patterns.forEach(pattern => this.fraudPatterns.add(pattern));
    } catch (error) {
      console.warn('Failed to load fraud patterns:', error);
    }
  }
}

// Helper classes for specific pattern types
class ProofOfHuman {
  constructor() {
    this.challenges = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    this.isInitialized = true;
    console.log('👤 Proof of Human initialized');
  }

  async generateChallenge(level = 'medium') {
    const challengeId = 'challenge_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const challenge = this.createChallenge(level);
    
    this.challenges.set(challengeId, {
      ...challenge,
      created: Date.now(),
      level
    });
    
    return { id: challengeId, ...challenge };
  }

  createChallenge(level) {
    const challenges = {
      low: [
        { type: 'math', question: 'What is 2 + 3?', answer: '5' },
        { type: 'text', question: 'Type the word "human"', answer: 'human' }
      ],
      medium: [
        { type: 'math', question: 'What is 7 * 8?', answer: '56' },
        { type: 'sequence', question: 'What comes next: 2, 4, 6, ?', answer: '8' }
      ],
      high: [
        { type: 'logic', question: 'If all roses are flowers and some flowers are red, can we conclude that some roses are red?', answer: 'no' },
        { type: 'pattern', question: 'What is the next number in the sequence: 1, 1, 2, 3, 5, 8, ?', answer: '13' }
      ]
    };
    
    const levelChallenges = challenges[level] || challenges.medium;
    return levelChallenges[Math.floor(Math.random() * levelChallenges.length)];
  }

  async validateResponse(challengeId, response) {
    const challenge = this.challenges.get(challengeId);
    
    if (!challenge) {
      return { valid: false, reason: 'Challenge not found' };
    }
    
    const age = Date.now() - challenge.created;
    if (age > 5 * 60 * 1000) { // 5 minutes
      this.challenges.delete(challengeId);
      return { valid: false, reason: 'Challenge expired' };
    }
    
    const valid = response.toLowerCase().trim() === challenge.answer.toLowerCase().trim();
    
    if (valid) {
      this.challenges.delete(challengeId);
    }
    
    return { valid, reason: valid ? 'Correct' : 'Incorrect answer' };
  }
}

class WalletClusterDetector {
  constructor() {
    this.clusters = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    this.isInitialized = true;
    console.log('🔗 Wallet Cluster Detector initialized');
  }

  async analyze(interaction) {
    try {
      const walletAddress = interaction.walletAddress;
      const features = this.extractWalletFeatures(interaction);
      
      const clusters = this.findRelatedWallets(walletAddress, features);
      const riskScore = this.calculateClusterRisk(clusters);
      
      return {
        riskScore,
        confidence: clusters.length > 0 ? 80 : 50,
        clusters,
        flags: this.generateClusterFlags(clusters, riskScore),
        reason: this.generateClusterReason(clusters, riskScore)
      };
    } catch (error) {
      console.error('Wallet cluster analysis failed:', error);
      return {
        riskScore: 0,
        confidence: 0,
        error: error.message,
        fallback: true
      };
    }
  }

  extractWalletFeatures(interaction) {
    return {
      responseTime: interaction.responseTime || 0,
      textLength: interaction.text ? interaction.text.length : 0,
      sessionDuration: interaction.sessionDuration || 0,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  findRelatedWallets(walletAddress, features) {
    const related = [];
    
    this.clusters.forEach((data, address) => {
      if (address !== walletAddress) {
        const similarity = this.calculateWalletSimilarity(features, data.features);
        if (similarity > 0.7) {
          related.push({ address, similarity, data });
        }
      }
    });
    
    // Store current wallet data
    this.clusters.set(walletAddress, { features, lastSeen: Date.now() });
    
    return related;
  }

  calculateWalletSimilarity(features1, features2) {
    if (!features2) return 0;
    
    let similarity = 0;
    let factors = 0;
    
    // Compare response times
    const responseTimeDiff = Math.abs(features1.responseTime - features2.responseTime);
    if (responseTimeDiff < 1000) {
      similarity += 1 - (responseTimeDiff / 1000);
      factors++;
    }
    
    // Compare text lengths
    const textLengthDiff = Math.abs(features1.textLength - features2.textLength);
    if (textLengthDiff < 50) {
      similarity += 1 - (textLengthDiff / 50);
      factors++;
    }
    
    // Compare user agents
    if (features1.userAgent === features2.userAgent) {
      similarity += 1;
      factors++;
    }
    
    // Compare timezones
    if (features1.timezone === features2.timezone) {
      similarity += 0.5;
      factors++;
    }
    
    return factors > 0 ? similarity / factors : 0;
  }

  calculateClusterRisk(clusters) {
    if (clusters.length === 0) return 0;
    
    let risk = 0;
    
    // Risk increases with number of similar wallets
    risk += Math.min(15, clusters.length * 3);
    
    // Risk increases with high similarity
    const highSimilarity = clusters.filter(c => c.similarity > 0.9).length;
    risk += highSimilarity * 2;
    
    return risk;
  }

  generateClusterFlags(clusters, riskScore) {
    const flags = [];
    
    if (clusters.length > 3) flags.push('MULTIPLE_SIMILAR_WALLETS');
    if (clusters.some(c => c.similarity > 0.9)) flags.push('HIGH_SIMILARITY_DETECTED');
    if (riskScore > 10) flags.push('WALLET_CLUSTER_RISK');
    
    return flags;
  }

  generateClusterReason(clusters, riskScore) {
    if (clusters.length === 0) return 'No similar wallets detected';
    
    const reasons = [];
    reasons.push(`${clusters.length} similar wallets found`);
    
    const highSimilarity = clusters.filter(c => c.similarity > 0.9).length;
    if (highSimilarity > 0) {
      reasons.push(`${highSimilarity} with high similarity`);
    }
    
    return reasons.join(', ');
  }
}

class CommunityReporter {
  constructor() {
    this.reports = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    await this.loadReports();
    
    this.isInitialized = true;
    console.log('📢 Community Reporter initialized');
  }

  async getReports(interaction) {
    try {
      const walletAddress = interaction.walletAddress;
      const reports = this.reports.get(walletAddress) || [];
      
      const riskScore = this.calculateReportRisk(reports);
      
      return {
        riskScore,
        confidence: reports.length > 0 ? 90 : 10,
        reports: reports.length,
        flags: this.generateReportFlags(reports, riskScore),
        reason: this.generateReportReason(reports, riskScore)
      };
    } catch (error) {
      console.error('Community report analysis failed:', error);
      return {
        riskScore: 0,
        confidence: 0,
        error: error.message,
        fallback: true
      };
    }
  }

  async submitReport(report) {
    try {
      const walletAddress = report.walletAddress;
      const reports = this.reports.get(walletAddress) || [];
      
      reports.push({
        ...report,
        timestamp: Date.now(),
        id: 'report_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
      });
      
      this.reports.set(walletAddress, reports);
      
      // Save to storage
      await this.saveReports();
      
      return { success: true, reportId: reports[reports.length - 1].id };
    } catch (error) {
      console.error('Failed to submit report:', error);
      return { success: false, error: error.message };
    }
  }

  calculateReportRisk(reports) {
    if (reports.length === 0) return 0;
    
    let risk = 0;
    
    // Risk increases with number of reports
    risk += Math.min(5, reports.length);
    
    // Risk increases with recent reports
    const recentReports = reports.filter(r => Date.now() - r.timestamp < 24 * 60 * 60 * 1000);
    risk += recentReports.length * 2;
    
    return risk;
  }

  generateReportFlags(reports, riskScore) {
    const flags = [];
    
    if (reports.length > 0) flags.push('COMMUNITY_REPORTS');
    if (reports.length > 3) flags.push('MULTIPLE_REPORTS');
    if (riskScore > 5) flags.push('HIGH_REPORT_RISK');
    
    return flags;
  }

  generateReportReason(reports, riskScore) {
    if (reports.length === 0) return 'No community reports';
    
    const recentReports = reports.filter(r => Date.now() - r.timestamp < 24 * 60 * 60 * 1000);
    
    return `${reports.length} total reports, ${recentReports.length} recent`;
  }

  async loadReports() {
    try {
      const reports = await new Promise(resolve => {
        chrome.storage.local.get(['community_reports'], result => {
          resolve(result.community_reports || {});
        });
      });
      
      Object.entries(reports).forEach(([walletAddress, reportList]) => {
        this.reports.set(walletAddress, reportList);
      });
    } catch (error) {
      console.warn('Failed to load community reports:', error);
    }
  }

  async saveReports() {
    try {
      const reports = {};
      this.reports.forEach((reportList, walletAddress) => {
        reports[walletAddress] = reportList;
      });
      
      await new Promise(resolve => {
        chrome.storage.local.set({ 'community_reports': reports }, resolve);
      });
    } catch (error) {
      console.warn('Failed to save community reports:', error);
    }
  }
}

// Export classes for use in other modules
window.PatternRecognizer = PatternRecognizer;
window.ProofOfHuman = ProofOfHuman;
window.WalletClusterDetector = WalletClusterDetector;
window.CommunityReporter = CommunityReporter;
