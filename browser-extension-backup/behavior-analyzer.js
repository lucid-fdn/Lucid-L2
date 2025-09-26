/**
 * Phase 8.5: Behavioral Analysis Engine
 * Analyzes user behavior patterns to detect bot-like activity
 */

class BehaviorAnalyzer {
  constructor() {
    this.keystrokePatterns = new KeystrokeAnalyzer();
    this.timingAnalyzer = new TimingAnalyzer();
    this.interactionAnalyzer = new InteractionAnalyzer();
    this.userHistory = new UserHistoryAnalyzer();
    this.isInitialized = false;
    this.behaviorCache = new Map();
  }

  async initialize() {
    if (this.isInitialized) return;
    
    await this.keystrokePatterns.initialize();
    await this.timingAnalyzer.initialize();
    await this.interactionAnalyzer.initialize();
    await this.userHistory.initialize();
    
    this.isInitialized = true;
    console.log('🔍 Behavior Analyzer initialized');
  }

  async analyze(interaction) {
    try {
      // Check for null/undefined critical data - trigger fallback if insufficient
      if (!interaction || !interaction.walletAddress || 
          (interaction.text === null && interaction.keystrokeTimings === null && 
           interaction.sessionDuration === undefined && interaction.thinkingTime === null && 
           interaction.responseTime === undefined && !interaction.mouseMovements)) {
        return {
          riskScore: 15, // Default medium risk for insufficient data
          confidence: 0,
          error: 'Insufficient interaction data for behavioral analysis',
          fallback: true
        };
      }

      const analyses = await Promise.all([
        this.keystrokePatterns.analyze(interaction),
        this.timingAnalyzer.analyze(interaction),
        this.interactionAnalyzer.analyze(interaction),
        this.userHistory.analyze(interaction)
      ]);

      const [keystrokeAnalysis, timingAnalysis, interactionAnalysis, historyAnalysis] = analyses;

      const riskScore = this.calculateBehavioralRisk({
        keystrokeAnalysis,
        timingAnalysis,
        interactionAnalysis,
        historyAnalysis
      });

      const result = {
        riskScore,
        confidence: this.calculateConfidence(analyses),
        details: {
          keystrokeAnalysis,
          timingAnalysis,
          interactionAnalysis,
          historyAnalysis
        },
        flags: this.generateFlags(riskScore, analyses),
        timestamp: Date.now()
      };

      // Cache results for future analysis
      this.cacheResult(interaction.walletAddress, result);

      return result;
    } catch (error) {
      console.error('Behavioral analysis failed:', error);
      return {
        riskScore: 15, // Default medium risk on failure
        confidence: 0,
        error: error.message,
        fallback: true
      };
    }
  }

  calculateBehavioralRisk(analyses) {
    const weights = {
      keystroke: 0.3,
      timing: 0.25,
      interaction: 0.25,
      history: 0.2
    };

    const risks = {
      keystroke: analyses.keystrokeAnalysis.risk || 0,
      timing: analyses.timingAnalysis.risk || 0,
      interaction: analyses.interactionAnalysis.risk || 0,
      history: analyses.historyAnalysis.risk || 0
    };

    const totalRisk = Math.round(
      (risks.keystroke * weights.keystroke) +
      (risks.timing * weights.timing) +
      (risks.interaction * weights.interaction) +
      (risks.history * weights.history)
    );

    return Math.min(30, totalRisk); // Cap at 30 for behavioral component
  }

  calculateConfidence(analyses) {
    let totalConfidence = 0;
    let validAnalyses = 0;

    analyses.forEach(analysis => {
      if (analysis && analysis.confidence !== undefined) {
        totalConfidence += analysis.confidence;
        validAnalyses++;
      }
    });

    // Ensure minimum confidence for valid analyses
    const avgConfidence = validAnalyses > 0 ? Math.round(totalConfidence / validAnalyses) : 50;
    return Math.max(50, avgConfidence); // Ensure at least 50% confidence for valid data
  }

  generateFlags(riskScore, analyses) {
    const flags = [];
    
    if (riskScore > 20) flags.push('HIGH_BEHAVIORAL_RISK');
    if (riskScore > 15) flags.push('SUSPICIOUS_TIMING');
    if (riskScore > 10) flags.push('UNUSUAL_PATTERNS');
    
    // Add specific flags from sub-analyses
    analyses.forEach(analysis => {
      if (analysis && analysis.flags) {
        flags.push(...analysis.flags);
      }
    });
    
    return [...new Set(flags)]; // Remove duplicates
  }

  cacheResult(walletAddress, result) {
    // Cache the last 10 results per wallet
    if (!this.behaviorCache.has(walletAddress)) {
      this.behaviorCache.set(walletAddress, []);
    }
    
    const cache = this.behaviorCache.get(walletAddress);
    cache.push(result);
    
    if (cache.length > 10) {
      cache.shift();
    }
  }

  getCachedResults(walletAddress) {
    return this.behaviorCache.get(walletAddress) || [];
  }
}

class KeystrokeAnalyzer {
  constructor() {
    this.isInitialized = false;
    this.humanProfiles = new Map();
  }

  async initialize() {
    if (this.isInitialized) return;
    
    // Load human typing profiles from storage
    await this.loadHumanProfiles();
    
    this.isInitialized = true;
    console.log('⌨️ Keystroke Analyzer initialized');
  }

  async analyze(interaction) {
    const keystrokeData = interaction.keystrokeTimings || [];
    
    if (keystrokeData.length === 0) {
      return { 
        risk: 25, 
        confidence: 0,
        reason: 'No keystroke data available',
        flags: ['NO_KEYSTROKE_DATA']
      };
    }

    const analyses = {
      wpm: this.analyzeTypingSpeed(keystrokeData),
      uniformity: this.analyzeUniformity(keystrokeData),
      pauses: this.analyzePauses(keystrokeData),
      corrections: this.analyzeCorrections(keystrokeData),
      rhythm: this.analyzeRhythm(keystrokeData)
    };

    const risk = this.calculateKeystrokeRisk(analyses);
    const confidence = this.calculateKeystrokeConfidence(keystrokeData);

    return {
      risk,
      confidence,
      analyses,
      flags: this.generateKeystrokeFlags(analyses),
      reason: this.generateReason(analyses)
    };
  }

  analyzeTypingSpeed(keystrokeData) {
    if (keystrokeData.length < 10) return { risk: 0, wpm: 0 };
    
    const totalTime = keystrokeData[keystrokeData.length - 1].timestamp - 
                     keystrokeData[0].timestamp;
    const characters = keystrokeData.length;
    const wpm = Math.round((characters / 5) / (totalTime / 60000));

    let risk = 0;
    if (wpm > 120) risk = 30; // Inhuman speed
    else if (wpm > 100) risk = 15; // Very fast
    else if (wpm < 10) risk = 20; // Too slow (copy-paste)

    return { risk, wpm, totalTime, characters };
  }

  analyzeUniformity(keystrokeData) {
    const intervals = this.calculateIntervals(keystrokeData);
    if (intervals.length < 5) return { risk: 0, uniformity: 0 };

    const uniformity = this.calculateUniformity(intervals);
    
    let risk = 0;
    if (uniformity > 0.95) risk = 25; // Too uniform
    else if (uniformity > 0.9) risk = 15; // Suspicious
    else if (uniformity < 0.3) risk = 10; // Too random

    return { risk, uniformity, intervals: intervals.length };
  }

  analyzePauses(keystrokeData) {
    const pauses = this.extractPauses(keystrokeData);
    
    if (pauses.length === 0) {
      return { risk: 20, reason: 'No natural pauses detected' };
    }

    const naturalPauses = pauses.filter(pause => pause > 1000 && pause < 5000);
    const naturalRatio = naturalPauses.length / pauses.length;
    
    let risk = 0;
    if (naturalRatio < 0.2) risk = 20; // Too few natural pauses
    else if (naturalRatio < 0.4) risk = 10; // Suspicious pause patterns

    return {
      risk,
      totalPauses: pauses.length,
      naturalPauses: naturalPauses.length,
      naturalRatio,
      avgPause: pauses.reduce((sum, val) => sum + val, 0) / pauses.length
    };
  }

  analyzeCorrections(keystrokeData) {
    const corrections = keystrokeData.filter(k => k.key === 'Backspace').length;
    const totalKeystrokes = keystrokeData.length;
    const correctionRatio = corrections / totalKeystrokes;

    let risk = 0;
    if (correctionRatio === 0) risk = 15; // No corrections (suspicious)
    else if (correctionRatio > 0.3) risk = 10; // Too many corrections

    return { risk, corrections, totalKeystrokes, correctionRatio };
  }

  analyzeRhythm(keystrokeData) {
    const intervals = this.calculateIntervals(keystrokeData);
    if (intervals.length < 10) return { risk: 0, rhythm: 0 };

    // Analyze rhythm patterns
    const rhythm = this.calculateRhythm(intervals);
    
    let risk = 0;
    if (rhythm > 0.8) risk = 20; // Too rhythmic (bot-like)
    else if (rhythm < 0.2) risk = 10; // No rhythm at all

    return { risk, rhythm, patterns: this.findRhythmPatterns(intervals) };
  }

  calculateKeystrokeRisk(analyses) {
    const weights = {
      wpm: 0.3,
      uniformity: 0.25,
      pauses: 0.2,
      corrections: 0.15,
      rhythm: 0.1
    };

    return Math.round(
      (analyses.wpm.risk * weights.wpm) +
      (analyses.uniformity.risk * weights.uniformity) +
      (analyses.pauses.risk * weights.pauses) +
      (analyses.corrections.risk * weights.corrections) +
      (analyses.rhythm.risk * weights.rhythm)
    );
  }

  calculateKeystrokeConfidence(keystrokeData) {
    // Confidence based on data quality and quantity
    const dataPoints = keystrokeData.length;
    
    if (dataPoints === 0) return 0;
    if (dataPoints < 10) return 50; // Increased minimum for any data
    if (dataPoints < 50) return 70; // Increased for moderate data
    if (dataPoints < 100) return 85; // Increased for good data
    return 95;
  }

  generateKeystrokeFlags(analyses) {
    const flags = [];
    
    if (analyses.wpm.risk > 20) flags.push('INHUMAN_TYPING_SPEED');
    if (analyses.uniformity.risk > 20) flags.push('UNIFORM_KEYSTROKE_TIMING');
    if (analyses.pauses.risk > 15) flags.push('UNNATURAL_PAUSE_PATTERNS');
    if (analyses.corrections.risk > 10) flags.push('SUSPICIOUS_CORRECTIONS');
    if (analyses.rhythm.risk > 15) flags.push('ROBOTIC_RHYTHM');
    
    return flags;
  }

  generateReason(analyses) {
    const reasons = [];
    
    // Add null checks for all analysis components
    if (analyses && analyses.wpm && analyses.wpm.risk > 20) {
      const wpm = analyses.wpm.wpm || 0;
      reasons.push(`Typing speed: ${wpm} WPM (inhuman)`);
    }
    if (analyses && analyses.uniformity && analyses.uniformity.risk > 20) {
      const uniformity = analyses.uniformity.uniformity || 0;
      reasons.push(`Keystroke uniformity: ${uniformity.toFixed(2)} (too uniform)`);
    }
    if (analyses && analyses.pauses && analyses.pauses.risk > 15) {
      const naturalRatio = analyses.pauses.naturalRatio || 0;
      reasons.push(`Natural pauses: ${naturalRatio.toFixed(2)} ratio (unnatural)`);
    }
    if (analyses && analyses.corrections && analyses.corrections.risk > 15) {
      const correctionRate = analyses.corrections.correctionRate || 0;
      reasons.push(`Correction rate: ${correctionRate.toFixed(2)} (suspicious)`);
    }
    if (analyses && analyses.rhythm && analyses.rhythm.risk > 15) {
      const rhythmScore = analyses.rhythm.rhythmScore || 0;
      reasons.push(`Rhythm pattern: ${rhythmScore.toFixed(2)} (too regular)`);
    }
    
    return reasons.length > 0 ? reasons.join(', ') : 'Normal keystroke patterns';
  }

  // Helper methods
  calculateIntervals(keystrokeData) {
    const intervals = [];
    for (let i = 1; i < keystrokeData.length; i++) {
      intervals.push(keystrokeData[i].timestamp - keystrokeData[i-1].timestamp);
    }
    return intervals;
  }

  calculateUniformity(intervals) {
    if (intervals.length === 0) return 0;
    
    const mean = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev === 0 ? 1 : Math.max(0, 1 - (stdDev / mean));
  }

  extractPauses(keystrokeData) {
    const pauses = [];
    for (let i = 1; i < keystrokeData.length; i++) {
      const interval = keystrokeData[i].timestamp - keystrokeData[i-1].timestamp;
      if (interval > 500) { // Pause longer than 500ms
        pauses.push(interval);
      }
    }
    return pauses;
  }

  calculateRhythm(intervals) {
    // Calculate rhythm by analyzing interval patterns
    const patterns = new Map();
    
    for (let i = 0; i < intervals.length - 1; i++) {
      const pattern = Math.round(intervals[i] / 50) * 50; // Group into 50ms buckets
      patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
    }
    
    const maxOccurrence = Math.max(...patterns.values());
    return maxOccurrence / intervals.length;
  }

  findRhythmPatterns(intervals) {
    const patterns = [];
    
    // Look for repeated patterns
    for (let i = 0; i < intervals.length - 2; i++) {
      const pattern = [intervals[i], intervals[i + 1]];
      let count = 1;
      
      for (let j = i + 2; j < intervals.length - 1; j++) {
        if (this.similarPattern(pattern, [intervals[j], intervals[j + 1]])) {
          count++;
        }
      }
      
      if (count > 3) {
        patterns.push({ pattern, count });
      }
    }
    
    return patterns;
  }

  similarPattern(pattern1, pattern2, tolerance = 50) {
    return Math.abs(pattern1[0] - pattern2[0]) < tolerance &&
           Math.abs(pattern1[1] - pattern2[1]) < tolerance;
  }

  async loadHumanProfiles() {
    // Load human typing profiles from storage
    try {
      const profiles = await new Promise(resolve => {
        chrome.storage.local.get(['human_typing_profiles'], result => {
          resolve(result.human_typing_profiles || {});
        });
      });
      
      Object.entries(profiles).forEach(([key, value]) => {
        this.humanProfiles.set(key, value);
      });
    } catch (error) {
      console.warn('Failed to load human profiles:', error);
    }
  }
}

class TimingAnalyzer {
  constructor() {
    this.isInitialized = false;
    this.sessionData = new Map();
  }

  async initialize() {
    if (this.isInitialized) return;
    
    this.isInitialized = true;
    console.log('⏱️ Timing Analyzer initialized');
  }

  async analyze(interaction) {
    const timingData = {
      sessionDuration: interaction.sessionDuration || 0,
      thinkingTime: interaction.thinkingTime || 0,
      processingTime: interaction.processingTime || 0,
      responseTime: interaction.responseTime || 0,
      timeOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay()
    };

    const analyses = {
      session: this.analyzeSessionTiming(timingData),
      response: this.analyzeResponseTiming(timingData),
      temporal: this.analyzeTemporalPatterns(interaction.walletAddress, timingData),
      consistency: this.analyzeConsistency(interaction.walletAddress, timingData)
    };

    const risk = this.calculateTimingRisk(analyses);
    const confidence = this.calculateTimingConfidence(timingData);

    // Store timing data for future analysis
    this.storeTimingData(interaction.walletAddress, timingData);

    return {
      risk,
      confidence,
      analyses,
      flags: this.generateTimingFlags(analyses),
      reason: this.generateTimingReason(analyses)
    };
  }

  analyzeSessionTiming(timingData) {
    let risk = 0;
    
    // Very short sessions (< 5 seconds) are suspicious
    if (timingData.sessionDuration < 5000) {
      risk += 15;
    }
    
    // Very long sessions (> 30 minutes) without breaks are suspicious
    if (timingData.sessionDuration > 1800000) {
      risk += 10;
    }
    
    return { risk, duration: timingData.sessionDuration };
  }

  analyzeResponseTiming(timingData) {
    let risk = 0;
    
    // Instant responses (< 1 second) are suspicious
    if (timingData.responseTime < 1000) {
      risk += 20;
    }
    
    // No thinking time is suspicious
    if (timingData.thinkingTime === 0) {
      risk += 15;
    }
    
    return { risk, responseTime: timingData.responseTime, thinkingTime: timingData.thinkingTime };
  }

  analyzeTemporalPatterns(walletAddress, timingData) {
    const history = this.getTimingHistory(walletAddress);
    
    if (history.length < 5) {
      return { risk: 0, reason: 'Insufficient history' };
    }

    // Analyze time-of-day patterns
    const timePatterns = this.analyzeTimePatterns(history);
    
    let risk = 0;
    if (timePatterns.tooRegular) risk += 15;
    if (timePatterns.inhuman) risk += 20;
    
    return { risk, patterns: timePatterns };
  }

  analyzeConsistency(walletAddress, timingData) {
    const history = this.getTimingHistory(walletAddress);
    
    if (history.length < 3) {
      return { risk: 0, reason: 'Insufficient history' };
    }

    const consistency = this.calculateConsistency(history);
    
    let risk = 0;
    if (consistency > 0.9) risk += 15; // Too consistent
    if (consistency < 0.1) risk += 10; // Too inconsistent
    
    return { risk, consistency };
  }

  calculateTimingRisk(analyses) {
    const weights = {
      session: 0.3,
      response: 0.4,
      temporal: 0.2,
      consistency: 0.1
    };

    return Math.round(
      (analyses.session.risk * weights.session) +
      (analyses.response.risk * weights.response) +
      (analyses.temporal.risk * weights.temporal) +
      (analyses.consistency.risk * weights.consistency)
    );
  }

  calculateTimingConfidence(timingData) {
    // Higher confidence with more complete timing data
    let confidence = 60; // Increased base confidence
    
    if (timingData.sessionDuration > 0) confidence += 10;
    if (timingData.thinkingTime > 0) confidence += 10;
    if (timingData.responseTime > 0) confidence += 15;
    if (timingData.processingTime > 0) confidence += 5;
    
    return Math.min(95, confidence);
  }

  generateTimingFlags(analyses) {
    const flags = [];
    
    if (analyses.session.risk > 10) flags.push('SUSPICIOUS_SESSION_TIMING');
    if (analyses.response.risk > 15) flags.push('INSTANT_RESPONSE');
    if (analyses.temporal.risk > 15) flags.push('UNNATURAL_TEMPORAL_PATTERNS');
    if (analyses.consistency.risk > 10) flags.push('TIMING_INCONSISTENCY');
    
    return flags;
  }

  generateTimingReason(analyses) {
    const reasons = [];
    
    if (analyses.session.risk > 10) {
      reasons.push(`Session duration: ${analyses.session.duration}ms`);
    }
    if (analyses.response.risk > 15) {
      reasons.push(`Response time: ${analyses.response.responseTime}ms`);
    }
    if (analyses.temporal.risk > 15) {
      reasons.push('Unnatural temporal patterns');
    }
    
    return reasons.join(', ') || 'Normal timing patterns';
  }

  storeTimingData(walletAddress, timingData) {
    if (!this.sessionData.has(walletAddress)) {
      this.sessionData.set(walletAddress, []);
    }
    
    const history = this.sessionData.get(walletAddress);
    history.push({ ...timingData, timestamp: Date.now() });
    
    // Keep only last 100 entries
    if (history.length > 100) {
      history.shift();
    }
  }

  getTimingHistory(walletAddress) {
    return this.sessionData.get(walletAddress) || [];
  }

  analyzeTimePatterns(history) {
    const hours = history.map(h => h.timeOfDay);
    const hourDistribution = new Array(24).fill(0);
    
    hours.forEach(hour => hourDistribution[hour]++);
    
    // Check for too regular patterns
    const activeHours = hourDistribution.filter(count => count > 0).length;
    const tooRegular = activeHours < 3; // Active in less than 3 hours
    
    // Check for inhuman patterns (24/7 activity)
    const inhuman = activeHours > 20; // Active in more than 20 hours
    
    return { tooRegular, inhuman, activeHours, distribution: hourDistribution };
  }

  calculateConsistency(history) {
    const responseTimes = history.map(h => h.responseTime).filter(t => t > 0);
    
    if (responseTimes.length < 3) return 0.5;
    
    const mean = responseTimes.reduce((sum, val) => sum + val, 0) / responseTimes.length;
    const variance = responseTimes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / responseTimes.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev === 0 ? 1 : Math.max(0, 1 - (stdDev / mean));
  }
}

class InteractionAnalyzer {
  constructor() {
    this.isInitialized = false;
    this.interactionHistory = new Map();
  }

  async initialize() {
    if (this.isInitialized) return;
    
    this.isInitialized = true;
    console.log('🖱️ Interaction Analyzer initialized');
  }

  async analyze(interaction) {
    const interactionData = {
      mouseMovements: interaction.mouseMovements || [],
      clickPatterns: interaction.clickPatterns || [],
      navigationFlow: interaction.navigationFlow || [],
      focusChanges: interaction.focusChanges || [],
      scrollBehavior: interaction.scrollBehavior || {}
    };

    const analyses = {
      mouse: this.analyzeMouseBehavior(interactionData.mouseMovements),
      clicks: this.analyzeClickPatterns(interactionData.clickPatterns),
      navigation: this.analyzeNavigationFlow(interactionData.navigationFlow),
      focus: this.analyzeFocusPatterns(interactionData.focusChanges),
      scroll: this.analyzeScrollBehavior(interactionData.scrollBehavior)
    };

    const risk = this.calculateInteractionRisk(analyses);
    const confidence = this.calculateInteractionConfidence(interactionData);

    return {
      risk,
      confidence,
      analyses,
      flags: this.generateInteractionFlags(analyses),
      reason: this.generateInteractionReason(analyses)
    };
  }

  analyzeMouseBehavior(mouseMovements) {
    if (mouseMovements.length < 5) {
      return { risk: 15, reason: 'Insufficient mouse movement data' };
    }

    const movements = {
      straight: this.analyzeStraightMovements(mouseMovements),
      speed: this.analyzeMouseSpeed(mouseMovements),
      acceleration: this.analyzeMouseAcceleration(mouseMovements),
      pauses: this.analyzeMousePauses(mouseMovements)
    };

    let risk = 0;
    if (movements.straight > 0.8) risk += 20; // Too many straight movements
    if (movements.speed.constant > 0.9) risk += 15; // Constant speed
    if (movements.pauses < 0.1) risk += 10; // No pauses
    
    return { risk, movements };
  }

  analyzeClickPatterns(clickPatterns) {
    if (clickPatterns.length < 3) {
      return { risk: 0, reason: 'Insufficient click data' };
    }

    const patterns = {
      timing: this.analyzeClickTiming(clickPatterns),
      location: this.analyzeClickLocations(clickPatterns),
      sequence: this.analyzeClickSequence(clickPatterns)
    };

    let risk = 0;
    if (patterns.timing.tooRegular) risk += 15;
    if (patterns.location.tooAccurate) risk += 10;
    if (patterns.sequence.predictable) risk += 12;
    
    return { risk, patterns };
  }

  analyzeNavigationFlow(navigationFlow) {
    if (navigationFlow.length < 3) {
      return { risk: 0, reason: 'Insufficient navigation data' };
    }

    const flow = {
      efficiency: this.analyzeNavigationEfficiency(navigationFlow),
      patterns: this.analyzeNavigationPatterns(navigationFlow),
      timing: this.analyzeNavigationTiming(navigationFlow)
    };

    let risk = 0;
    if (flow.efficiency > 0.95) risk += 15; // Too efficient
    if (flow.patterns.repetitive) risk += 10; // Repetitive patterns
    
    return { risk, flow };
  }

  analyzeFocusPatterns(focusChanges) {
    if (focusChanges.length < 3) {
      return { risk: 0, reason: 'Insufficient focus data' };
    }

    const focus = {
      duration: this.analyzeFocusDuration(focusChanges),
      switches: this.analyzeFocusSwitches(focusChanges)
    };

    let risk = 0;
    if (focus.duration.constant) risk += 10;
    if (focus.switches.unnatural) risk += 15;
    
    return { risk, focus };
  }

  analyzeScrollBehavior(scrollBehavior) {
    if (!scrollBehavior.events || scrollBehavior.events.length < 3) {
      return { risk: 0, reason: 'Insufficient scroll data' };
    }

    const scroll = {
      speed: this.analyzeScrollSpeed(scrollBehavior.events),
      direction: this.analyzeScrollDirection(scrollBehavior.events),
      smoothness: this.analyzeScrollSmoothness(scrollBehavior.events)
    };

    let risk = 0;
    if (scroll.speed.constant) risk += 10;
    if (scroll.direction.unnatural) risk += 15;
    if (scroll.smoothness < 0.3) risk += 12;
    
    return { risk, scroll };
  }

  calculateInteractionRisk(analyses) {
    const weights = {
      mouse: 0.3,
      clicks: 0.25,
      navigation: 0.2,
      focus: 0.15,
      scroll: 0.1
    };

    return Math.round(
      (analyses.mouse.risk * weights.mouse) +
      (analyses.clicks.risk * weights.clicks) +
      (analyses.navigation.risk * weights.navigation) +
      (analyses.focus.risk * weights.focus) +
      (analyses.scroll.risk * weights.scroll)
    );
  }

  calculateInteractionConfidence(interactionData) {
    let confidence = 50; // Increased base confidence
    
    if (interactionData.mouseMovements.length > 10) confidence += 15;
    if (interactionData.clickPatterns.length > 5) confidence += 10;
    if (interactionData.navigationFlow.length > 3) confidence += 10;
    if (interactionData.focusChanges.length > 3) confidence += 10;
    if (interactionData.scrollBehavior.events && interactionData.scrollBehavior.events.length > 5) confidence += 10;
    
    return Math.min(95, confidence);
  }

  generateInteractionFlags(analyses) {
    const flags = [];
    
    if (analyses.mouse.risk > 15) flags.push('UNNATURAL_MOUSE_MOVEMENT');
    if (analyses.clicks.risk > 10) flags.push('SUSPICIOUS_CLICK_PATTERNS');
    if (analyses.navigation.risk > 10) flags.push('ROBOTIC_NAVIGATION');
    if (analyses.focus.risk > 10) flags.push('UNNATURAL_FOCUS_PATTERNS');
    if (analyses.scroll.risk > 10) flags.push('SUSPICIOUS_SCROLL_BEHAVIOR');
    
    return flags;
  }

  generateInteractionReason(analyses) {
    const reasons = [];
    
    if (analyses.mouse.risk > 15) reasons.push('Unnatural mouse movements');
    if (analyses.clicks.risk > 10) reasons.push('Suspicious click patterns');
    if (analyses.navigation.risk > 10) reasons.push('Robotic navigation');
    
    return reasons.join(', ') || 'Normal interaction patterns';
  }

  // Helper methods for mouse analysis
  analyzeStraightMovements(movements) {
    let straightCount = 0;
    
    for (let i = 2; i < movements.length; i++) {
      const p1 = movements[i-2];
      const p2 = movements[i-1];
      const p3 = movements[i];
      
      if (this.isCollinear(p1, p2, p3)) {
        straightCount++;
      }
    }
    
    return movements.length > 2 ? straightCount / (movements.length - 2) : 0;
  }

  analyzeMouseSpeed(movements) {
    const speeds = [];
    
    for (let i = 1; i < movements.length; i++) {
      const dx = movements[i].x - movements[i-1].x;
      const dy = movements[i].y - movements[i-1].y;
      const dt = movements[i].timestamp - movements[i-1].timestamp;
      
      if (dt > 0) {
        const speed = Math.sqrt(dx*dx + dy*dy) / dt;
        speeds.push(speed);
      }
    }
    
    if (speeds.length === 0) return { constant: 0, avgSpeed: 0 };
    
    const avgSpeed = speeds.reduce((sum, val) => sum + val, 0) / speeds.length;
    const variance = speeds.reduce((sum, val) => sum + Math.pow(val - avgSpeed, 2), 0) / speeds.length;
    const stdDev = Math.sqrt(variance);
    
    const constant = stdDev === 0 ? 1 : Math.max(0, 1 - (stdDev / avgSpeed));
    
    return { constant, avgSpeed, variance };
  }

  analyzeMouseAcceleration(movements) {
    const accelerations = [];
    
    for (let i = 2; i < movements.length; i++) {
      const speed1 = this.calculateSpeedBetween(movements[i-2], movements[i-1]);
      const speed2 = this.calculateSpeedBetween(movements[i-1], movements[i]);
      const dt = movements[i].timestamp - movements[i-1].timestamp;
      
      if (dt > 0) {
        const acceleration = (speed2 - speed1) / dt;
        accelerations.push(acceleration);
      }
    }
    
    return accelerations.length > 0 ? {
      avg: accelerations.reduce((sum, val) => sum + val, 0) / accelerations.length,
      max: Math.max(...accelerations),
      min: Math.min(...accelerations)
    } : { avg: 0, max: 0, min: 0 };
  }

  analyzeMousePauses(movements) {
    let pauseCount = 0;
    
    for (let i = 1; i < movements.length; i++) {
      const timeDiff = movements[i].timestamp - movements[i-1].timestamp;
      if (timeDiff > 100) { // Pause longer than 100ms
        pauseCount++;
      }
    }
    
    return movements.length > 1 ? pauseCount / (movements.length - 1) : 0;
  }

  calculateSpeedBetween(point1, point2) {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    const dt = point2.timestamp - point1.timestamp;
    
    return dt > 0 ? Math.sqrt(dx*dx + dy*dy) / dt : 0;
  }

  isCollinear(p1, p2, p3, tolerance = 5) {
    // Check if three points are collinear (on the same line)
    const area = Math.abs((p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y));
    return area < tolerance;
  }

  // Click pattern analysis helpers
  analyzeClickTiming(clickPatterns) {
    const intervals = [];
    
    for (let i = 1; i < clickPatterns.length; i++) {
      intervals.push(clickPatterns[i].timestamp - clickPatterns[i-1].timestamp);
    }
    
    if (intervals.length < 2) return { tooRegular: false, avgInterval: 0 };
    
    const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    
    const uniformity = stdDev === 0 ? 1 : Math.max(0, 1 - (stdDev / avgInterval));
    
    return { tooRegular: uniformity > 0.9, avgInterval, uniformity };
  }

  analyzeClickLocations(clickPatterns) {
    const distances = [];
    
    for (let i = 1; i < clickPatterns.length; i++) {
      const dx = clickPatterns[i].x - clickPatterns[i-1].x;
      const dy = clickPatterns[i].y - clickPatterns[i-1].y;
      const distance = Math.sqrt(dx*dx + dy*dy);
      distances.push(distance);
    }
    
    // Check for too accurate clicking (always hitting exact same spots)
    const uniqueLocations = new Set(clickPatterns.map(c => `${c.x},${c.y}`));
    const tooAccurate = uniqueLocations.size < clickPatterns.length * 0.5;
    
    return { tooAccurate, avgDistance: distances.reduce((sum, val) => sum + val, 0) / distances.length };
  }

  analyzeClickSequence(clickPatterns) {
    // Look for predictable patterns in click sequences
    const sequences = [];
    
    for (let i = 0; i < clickPatterns.length - 2; i++) {
      const sequence = [
        clickPatterns[i].button,
        clickPatterns[i+1].button,
        clickPatterns[i+2].button
      ];
      sequences.push(sequence.join(','));
    }
    
    const uniqueSequences = new Set(sequences);
    const predictable = uniqueSequences.size < sequences.length * 0.7;
    
    return { predictable, uniqueSequences: uniqueSequences.size, totalSequences: sequences.length };
  }

  // Navigation flow analysis helpers
  analyzeNavigationEfficiency(navigationFlow) {
    if (navigationFlow.length < 3) return 0;
    
    const directPaths = navigationFlow.filter(nav => nav.direct === true).length;
    return directPaths / navigationFlow.length;
  }

  analyzeNavigationPatterns(navigationFlow) {
    const patterns = navigationFlow.map(nav => nav.action);
    const uniquePatterns = new Set(patterns);
    
    return { repetitive: uniquePatterns.size < patterns.length * 0.5 };
  }

  analyzeNavigationTiming(navigationFlow) {
    const timings = [];
    
    for (let i = 1; i < navigationFlow.length; i++) {
      timings.push(navigationFlow[i].timestamp - navigationFlow[i-1].timestamp);
    }
    
    const avgTiming = timings.reduce((sum, val) => sum + val, 0) / timings.length;
    return { avgTiming, timings: timings.length };
  }

  // Focus pattern analysis helpers
  analyzeFocusDuration(focusChanges) {
    const durations = focusChanges.map(focus => focus.duration);
    const avgDuration = durations.reduce((sum, val) => sum + val, 0) / durations.length;
    const variance = durations.reduce((sum, val) => sum + Math.pow(val - avgDuration, 2), 0) / durations.length;
    
    return { constant: variance < 100, avgDuration };
  }

  analyzeFocusSwitches(focusChanges) {
    const switches = focusChanges.length - 1;
    const timeSpan = focusChanges[focusChanges.length - 1].timestamp - focusChanges[0].timestamp;
    const switchRate = switches / (timeSpan / 1000); // switches per second
    
    return { unnatural: switchRate > 2 || switchRate < 0.01, switchRate };
  }

  // Scroll behavior analysis helpers
  analyzeScrollSpeed(scrollEvents) {
    const speeds = scrollEvents.map(event => Math.abs(event.deltaY));
    const avgSpeed = speeds.reduce((sum, val) => sum + val, 0) / speeds.length;
    const variance = speeds.reduce((sum, val) => sum + Math.pow(val - avgSpeed, 2), 0) / speeds.length;
    
    return { constant: variance < 10, avgSpeed };
  }

  analyzeScrollDirection(scrollEvents) {
    const directions = scrollEvents.map(event => event.deltaY > 0 ? 'down' : 'up');
    const changes = directions.filter((dir, i) => i > 0 && dir !== directions[i-1]).length;
    
    return { unnatural: changes < 2, changes };
  }

  analyzeScrollSmoothness(scrollEvents) {
    const deltas = scrollEvents.map(event => event.deltaY);
    const smoothness = this.calculateSmoothness(deltas);
    
    return smoothness;
  }

  calculateSmoothness(values) {
    if (values.length < 3) return 0.5;
    
    let smoothCount = 0;
    
    for (let i = 2; i < values.length; i++) {
      const trend1 = values[i-1] - values[i-2];
      const trend2 = values[i] - values[i-1];
      
      if (Math.sign(trend1) === Math.sign(trend2)) {
        smoothCount++;
      }
    }
    
    return smoothCount / (values.length - 2);
  }
}

class UserHistoryAnalyzer {
  constructor() {
    this.isInitialized = false;
    this.userProfiles = new Map();
  }

  async initialize() {
    if (this.isInitialized) return;
    
    await this.loadUserProfiles();
    
    this.isInitialized = true;
    console.log('📊 User History Analyzer initialized');
  }

  async analyze(interaction) {
    const walletAddress = interaction.walletAddress;
    const profile = this.getUserProfile(walletAddress);
    
    const analyses = {
      consistency: this.analyzeConsistency(profile, interaction),
      evolution: this.analyzeEvolution(profile, interaction),
      patterns: this.analyzePatterns(profile, interaction),
      deviations: this.analyzeDeviations(profile, interaction)
    };

    const risk = this.calculateHistoryRisk(analyses);
    const confidence = this.calculateHistoryConfidence(profile);

    // Update user profile with new interaction
    this.updateUserProfile(walletAddress, interaction);

    return {
      risk,
      confidence,
      analyses,
      flags: this.generateHistoryFlags(analyses),
      reason: this.generateHistoryReason(analyses)
    };
  }

  getUserProfile(walletAddress) {
    if (!this.userProfiles.has(walletAddress)) {
      this.userProfiles.set(walletAddress, {
        interactions: [],
        created: Date.now(),
        lastUpdate: Date.now()
      });
    }
    
    return this.userProfiles.get(walletAddress);
  }

  analyzeConsistency(profile, interaction) {
    if (profile.interactions.length < 5) {
      return { risk: 0, reason: 'Insufficient history' };
    }

    const recentInteractions = profile.interactions.slice(-10);
    const currentBehavior = this.extractBehaviorMetrics(interaction);
    const historicalBehavior = this.calculateAverageBehavior(recentInteractions);

    const consistency = this.calculateBehaviorConsistency(currentBehavior, historicalBehavior);
    
    let risk = 0;
    if (consistency < 0.3) risk = 15; // Too inconsistent
    if (consistency > 0.95) risk = 10; // Too consistent
    
    return { risk, consistency, currentBehavior, historicalBehavior };
  }

  analyzeEvolution(profile, interaction) {
    if (profile.interactions.length < 10) {
      return { risk: 0, reason: 'Insufficient history for evolution analysis' };
    }

    const evolution = this.calculateBehaviorEvolution(profile.interactions);
    
    let risk = 0;
    if (evolution.suddenChanges > 3) risk = 15; // Too many sudden changes
    if (evolution.improvements > 0.8) risk = 10; // Unrealistic improvement
    
    return { risk, evolution };
  }

  analyzePatterns(profile, interaction) {
    if (profile.interactions.length < 3) {
      return { risk: 0, reason: 'Insufficient history for pattern analysis' };
    }

    const patterns = this.findBehaviorPatterns(profile.interactions);
    
    let risk = 0;
    if (patterns.repetitive > 0.9) risk = 15; // Too repetitive
    if (patterns.cyclical > 0.8) risk = 10; // Too cyclical
    
    return { risk, patterns };
  }

  analyzeDeviations(profile, interaction) {
    if (profile.interactions.length < 5) {
      return { risk: 0, reason: 'Insufficient history for deviation analysis' };
    }

    const deviations = this.calculateBehaviorDeviations(profile.interactions, interaction);
    
    let risk = 0;
    if (deviations.major > 3) risk = 15; // Too many major deviations
    if (deviations.severity > 0.8) risk = 12; // High severity deviations
    
    return { risk, deviations };
  }

  calculateHistoryRisk(analyses) {
    const weights = {
      consistency: 0.3,
      evolution: 0.25,
      patterns: 0.25,
      deviations: 0.2
    };

    return Math.round(
      (analyses.consistency.risk * weights.consistency) +
      (analyses.evolution.risk * weights.evolution) +
      (analyses.patterns.risk * weights.patterns) +
      (analyses.deviations.risk * weights.deviations)
    );
  }

  calculateHistoryConfidence(profile) {
    const interactionCount = profile.interactions.length;
    const timeSpan = Date.now() - profile.created;
    
    let confidence = 60; // Increased base confidence
    
    if (interactionCount > 5) confidence += 10; // Lower threshold
    if (interactionCount > 10) confidence += 15;
    if (interactionCount > 50) confidence += 10;
    if (timeSpan > 7 * 24 * 60 * 60 * 1000) confidence += 10; // More than a week
    if (timeSpan > 30 * 24 * 60 * 60 * 1000) confidence += 5; // More than a month
    
    return Math.min(95, confidence);
  }

  generateHistoryFlags(analyses) {
    const flags = [];
    
    if (analyses.consistency.risk > 10) flags.push('INCONSISTENT_BEHAVIOR');
    if (analyses.evolution.risk > 10) flags.push('SUSPICIOUS_EVOLUTION');
    if (analyses.patterns.risk > 10) flags.push('REPETITIVE_PATTERNS');
    if (analyses.deviations.risk > 10) flags.push('BEHAVIORAL_DEVIATIONS');
    
    return flags;
  }

  generateHistoryReason(analyses) {
    const reasons = [];
    
    if (analyses.consistency.risk > 10) {
      reasons.push(`Behavior consistency: ${analyses.consistency.consistency.toFixed(2)}`);
    }
    if (analyses.evolution.risk > 10) {
      reasons.push('Suspicious behavior evolution');
    }
    if (analyses.patterns.risk > 10) {
      reasons.push('Repetitive behavior patterns');
    }
    
    return reasons.join(', ') || 'Normal behavior history';
  }

  updateUserProfile(walletAddress, interaction) {
    const profile = this.getUserProfile(walletAddress);
    
    // Add new interaction to profile
    profile.interactions.push({
      timestamp: Date.now(),
      text: interaction.text,
      responseTime: interaction.responseTime || 0,
      sessionDuration: interaction.sessionDuration || 0,
      qualityScore: interaction.qualityScore || 0,
      behaviorMetrics: this.extractBehaviorMetrics(interaction)
    });
    
    // Keep only last 100 interactions
    if (profile.interactions.length > 100) {
      profile.interactions.shift();
    }
    
    profile.lastUpdate = Date.now();
    
    // Save to storage periodically
    if (profile.interactions.length % 10 === 0) {
      this.saveUserProfile(walletAddress, profile);
    }
  }

  extractBehaviorMetrics(interaction) {
    return {
      responseTime: interaction.responseTime || 0,
      sessionDuration: interaction.sessionDuration || 0,
      textLength: interaction.text ? interaction.text.length : 0,
      keystrokeCount: interaction.keystrokeTimings ? interaction.keystrokeTimings.length : 0,
      mouseMovements: interaction.mouseMovements ? interaction.mouseMovements.length : 0,
      timestamp: Date.now()
    };
  }

  calculateAverageBehavior(interactions) {
    if (interactions.length === 0) return {};
    
    const metrics = interactions.map(i => i.behaviorMetrics).filter(m => m);
    if (metrics.length === 0) return {};
    
    return {
      avgResponseTime: metrics.reduce((sum, m) => sum + m.responseTime, 0) / metrics.length,
      avgSessionDuration: metrics.reduce((sum, m) => sum + m.sessionDuration, 0) / metrics.length,
      avgTextLength: metrics.reduce((sum, m) => sum + m.textLength, 0) / metrics.length,
      avgKeystrokeCount: metrics.reduce((sum, m) => sum + m.keystrokeCount, 0) / metrics.length,
      avgMouseMovements: metrics.reduce((sum, m) => sum + m.mouseMovements, 0) / metrics.length
    };
  }

  calculateBehaviorConsistency(current, historical) {
    if (!historical.avgResponseTime) return 0.5;
    
    const responseTimeDiff = Math.abs(current.responseTime - historical.avgResponseTime) / historical.avgResponseTime;
    const sessionDiff = Math.abs(current.sessionDuration - historical.avgSessionDuration) / (historical.avgSessionDuration || 1);
    const textLengthDiff = Math.abs(current.textLength - historical.avgTextLength) / (historical.avgTextLength || 1);
    
    const avgDiff = (responseTimeDiff + sessionDiff + textLengthDiff) / 3;
    
    return Math.max(0, 1 - avgDiff);
  }

  calculateBehaviorEvolution(interactions) {
    if (interactions.length < 10) return { suddenChanges: 0, improvements: 0 };
    
    const metrics = interactions.map(i => i.behaviorMetrics).filter(m => m);
    let suddenChanges = 0;
    let improvements = 0;
    
    for (let i = 1; i < metrics.length; i++) {
      const prev = metrics[i-1];
      const curr = metrics[i];
      
      // Check for sudden changes
      const responseChange = Math.abs(curr.responseTime - prev.responseTime) / (prev.responseTime || 1);
      if (responseChange > 0.5) suddenChanges++;
      
      // Check for improvements
      if (curr.responseTime < prev.responseTime * 0.8) improvements++;
    }
    
    return {
      suddenChanges,
      improvements: improvements / (metrics.length - 1)
    };
  }

  findBehaviorPatterns(interactions) {
    if (interactions.length < 10) return { repetitive: 0, cyclical: 0 };
    
    const metrics = interactions.map(i => i.behaviorMetrics).filter(m => m);
    const responseTimes = metrics.map(m => Math.round(m.responseTime / 1000)); // Round to seconds
    
    // Check for repetitive patterns
    const unique = new Set(responseTimes);
    const repetitive = 1 - (unique.size / responseTimes.length);
    
    // Check for cyclical patterns
    let cyclical = 0;
    if (responseTimes.length > 5) {
      const patterns = [];
      for (let i = 0; i < responseTimes.length - 3; i++) {
        const pattern = responseTimes.slice(i, i + 3).join(',');
        patterns.push(pattern);
      }
      
      const uniquePatterns = new Set(patterns);
      cyclical = 1 - (uniquePatterns.size / patterns.length);
    }
    
    return { repetitive, cyclical };
  }

  calculateBehaviorDeviations(interactions, currentInteraction) {
    if (interactions.length < 5) return { major: 0, severity: 0 };
    
    const metrics = interactions.map(i => i.behaviorMetrics).filter(m => m);
    const current = this.extractBehaviorMetrics(currentInteraction);
    
    // Calculate average and standard deviation
    const avgResponseTime = metrics.reduce((sum, m) => sum + m.responseTime, 0) / metrics.length;
    const stdDev = Math.sqrt(
      metrics.reduce((sum, m) => sum + Math.pow(m.responseTime - avgResponseTime, 2), 0) / metrics.length
    );
    
    const deviation = Math.abs(current.responseTime - avgResponseTime) / (stdDev || 1);
    
    return {
      major: deviation > 2 ? 1 : 0,
      severity: Math.min(1, deviation / 3)
    };
  }

  async loadUserProfiles() {
    try {
      const profiles = await new Promise(resolve => {
        chrome.storage.local.get(['user_behavior_profiles'], result => {
          resolve(result.user_behavior_profiles || {});
        });
      });
      
      Object.entries(profiles).forEach(([walletAddress, profile]) => {
        this.userProfiles.set(walletAddress, profile);
      });
    } catch (error) {
      console.warn('Failed to load user profiles:', error);
    }
  }

  async saveUserProfile(walletAddress, profile) {
    try {
      const profiles = await new Promise(resolve => {
        chrome.storage.local.get(['user_behavior_profiles'], result => {
          resolve(result.user_behavior_profiles || {});
        });
      });
      
      profiles[walletAddress] = profile;
      
      await new Promise(resolve => {
        chrome.storage.local.set({ 'user_behavior_profiles': profiles }, resolve);
      });
    } catch (error) {
      console.warn('Failed to save user profile:', error);
    }
  }
}

// Export classes for use in other modules
window.BehaviorAnalyzer = BehaviorAnalyzer;
window.KeystrokeAnalyzer = KeystrokeAnalyzer;
window.TimingAnalyzer = TimingAnalyzer;
window.InteractionAnalyzer = InteractionAnalyzer;
window.UserHistoryAnalyzer = UserHistoryAnalyzer;
