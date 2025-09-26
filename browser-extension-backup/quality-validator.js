/**
 * Phase 8.5: Quality Validation System
 * Validates content quality and originality to detect low-effort farming
 */

class QualityValidator {
  constructor() {
    this.isInitialized = false;
    this.spamPatterns = new Set();
    this.qualityMetrics = new Map();
    this.contentCache = new Map();
  }

  async initialize() {
    if (this.isInitialized) return;
    
    // Load spam patterns and quality metrics
    await this.loadSpamPatterns();
    await this.loadQualityMetrics();
    
    this.isInitialized = true;
    console.log('🔍 Quality Validator initialized');
  }

  async validate(interaction) {
    try {
      const content = interaction.text || '';
      const analyses = {
        length: this.analyzeLength(content),
        originality: this.analyzeOriginality(content),
        spam: this.analyzeSpam(content),
        coherence: this.analyzeCoherence(content),
        effort: this.analyzeEffort(content, interaction)
      };

      const riskScore = this.calculateQualityRisk(analyses);
      const confidence = this.calculateQualityConfidence(content, analyses);

      // Cache content for future originality checks
      this.cacheContent(interaction.walletAddress, content);

      return {
        riskScore,
        confidence,
        analyses,
        flags: this.generateQualityFlags(analyses),
        reason: this.generateQualityReason(analyses)
      };
    } catch (error) {
      console.error('Quality validation failed:', error);
      return {
        riskScore: 10, // Default low-medium risk
        confidence: 0,
        error: error.message,
        fallback: true
      };
    }
  }

  analyzeLength(content) {
    const length = content.length;
    
    let risk = 0;
    if (length < 5) risk = 20; // Too short
    else if (length < 10) risk = 15; // Very short
    else if (length > 1000) risk = 10; // Suspiciously long
    
    return { risk, length, category: this.categorizeLength(length) };
  }

  analyzeOriginality(content) {
    const hash = this.hashContent(content);
    const duplicates = this.findDuplicates(content);
    
    let risk = 0;
    if (duplicates.exact > 0) risk += 25; // Exact duplicates
    if (duplicates.similar > 2) risk += 15; // Too many similar
    if (this.isCommonPhrase(content)) risk += 10; // Common phrases
    
    return { 
      risk, 
      hash, 
      duplicates, 
      similarity: this.calculateSimilarity(content) 
    };
  }

  analyzeSpam(content) {
    const spamScore = this.calculateSpamScore(content);
    const patterns = this.detectSpamPatterns(content);
    
    let risk = 0;
    if (spamScore > 0.8) risk = 30; // High spam score
    else if (spamScore > 0.6) risk = 20; // Medium spam score
    else if (spamScore > 0.4) risk = 10; // Low spam score
    
    return { risk, spamScore, patterns };
  }

  analyzeCoherence(content) {
    const coherenceScore = this.calculateCoherence(content);
    const grammar = this.analyzeGrammar(content);
    
    let risk = 0;
    if (coherenceScore < 0.3) risk = 15; // Very incoherent
    else if (coherenceScore < 0.5) risk = 10; // Somewhat incoherent
    if (grammar.errors > content.length * 0.1) risk += 10; // Too many errors
    
    return { risk, coherenceScore, grammar };
  }

  analyzeEffort(content, interaction) {
    const effort = this.calculateEffort(content, interaction);
    const complexity = this.analyzeComplexity(content);
    
    let risk = 0;
    if (effort < 0.2) risk = 25; // Very low effort
    else if (effort < 0.4) risk = 15; // Low effort
    if (complexity < 0.3) risk += 10; // Too simple
    
    return { risk, effort, complexity };
  }

  calculateQualityRisk(analyses) {
    const weights = {
      length: 0.15,
      originality: 0.3,
      spam: 0.25,
      coherence: 0.2,
      effort: 0.1
    };

    return Math.round(
      (analyses.length.risk * weights.length) +
      (analyses.originality.risk * weights.originality) +
      (analyses.spam.risk * weights.spam) +
      (analyses.coherence.risk * weights.coherence) +
      (analyses.effort.risk * weights.effort)
    );
  }

  calculateQualityConfidence(content, analyses) {
    let confidence = 50;
    
    if (content.length > 20) confidence += 15;
    if (content.length > 100) confidence += 10;
    if (analyses.coherence.coherenceScore > 0.7) confidence += 15;
    if (analyses.originality.duplicates.exact === 0) confidence += 10;
    
    return Math.min(90, confidence);
  }

  generateQualityFlags(analyses) {
    const flags = [];
    
    if (analyses.length.risk > 15) flags.push('LOW_QUALITY_LENGTH');
    if (analyses.originality.risk > 20) flags.push('DUPLICATE_CONTENT');
    if (analyses.spam.risk > 20) flags.push('SPAM_DETECTED');
    if (analyses.coherence.risk > 10) flags.push('INCOHERENT_CONTENT');
    if (analyses.effort.risk > 20) flags.push('LOW_EFFORT_CONTENT');
    
    return flags;
  }

  generateQualityReason(analyses) {
    const reasons = [];
    
    if (analyses.length.risk > 15) {
      reasons.push(`Content length: ${analyses.length.length} characters`);
    }
    if (analyses.originality.risk > 20) {
      reasons.push(`Duplicate content detected`);
    }
    if (analyses.spam.risk > 20) {
      reasons.push(`Spam score: ${analyses.spam.spamScore.toFixed(2)}`);
    }
    if (analyses.coherence.risk > 10) {
      reasons.push(`Low coherence: ${analyses.coherence.coherenceScore.toFixed(2)}`);
    }
    
    return reasons.join(', ') || 'Content quality acceptable';
  }

  categorizeLength(length) {
    if (length < 5) return 'very_short';
    if (length < 20) return 'short';
    if (length < 100) return 'medium';
    if (length < 500) return 'long';
    return 'very_long';
  }

  hashContent(content) {
    // Simple hash function for content
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  findDuplicates(content) {
    const hash = this.hashContent(content);
    const cached = Array.from(this.contentCache.values());
    
    let exact = 0;
    let similar = 0;
    
    cached.forEach(cachedContent => {
      if (cachedContent.hash === hash) {
        exact++;
      } else if (this.calculateTextSimilarity(content, cachedContent.content) > 0.8) {
        similar++;
      }
    });
    
    return { exact, similar };
  }

  calculateSimilarity(content) {
    const cached = Array.from(this.contentCache.values());
    const similarities = cached.map(cached => 
      this.calculateTextSimilarity(content, cached.content)
    );
    
    return similarities.length > 0 ? Math.max(...similarities) : 0;
  }

  calculateTextSimilarity(text1, text2) {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const intersection = words1.filter(word => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];
    
    return intersection.length / union.length;
  }

  isCommonPhrase(content) {
    const commonPhrases = [
      'hello', 'hi', 'thanks', 'ok', 'yes', 'no', 'good', 'bad',
      'nice', 'cool', 'awesome', 'great', 'perfect', 'exactly',
      'sure', 'absolutely', 'definitely', 'maybe', 'perhaps'
    ];
    
    const words = content.toLowerCase().split(/\s+/);
    return words.length <= 3 && words.every(word => commonPhrases.includes(word));
  }

  calculateSpamScore(content) {
    let score = 0;
    
    // Check for excessive repetition
    const words = content.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const repetitionRatio = 1 - (uniqueWords.size / words.length);
    score += repetitionRatio * 0.3;
    
    // Check for excessive capitals
    const capitals = content.match(/[A-Z]/g) || [];
    const capitalRatio = capitals.length / content.length;
    if (capitalRatio > 0.5) score += 0.2;
    
    // Check for excessive punctuation
    const punctuation = content.match(/[!?]{2,}/g) || [];
    if (punctuation.length > 0) score += 0.1;
    
    // Check for promotional keywords
    const promoWords = ['buy', 'sell', 'cheap', 'free', 'win', 'prize', 'offer'];
    const promoCount = words.filter(word => promoWords.includes(word)).length;
    score += (promoCount / words.length) * 0.2;
    
    return Math.min(1, score);
  }

  detectSpamPatterns(content) {
    const patterns = [];
    
    // Detect URL patterns
    if (content.match(/https?:\/\/[^\s]+/)) {
      patterns.push('URL_DETECTED');
    }
    
    // Detect email patterns
    if (content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)) {
      patterns.push('EMAIL_DETECTED');
    }
    
    // Detect phone patterns
    if (content.match(/\d{3}-\d{3}-\d{4}|\(\d{3}\)\s*\d{3}-\d{4}/)) {
      patterns.push('PHONE_DETECTED');
    }
    
    // Detect excessive emojis
    const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu) || []).length;
    if (emojiCount > content.length * 0.1) {
      patterns.push('EXCESSIVE_EMOJIS');
    }
    
    return patterns;
  }

  calculateCoherence(content) {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length < 2) return 0.7; // Single sentence gets neutral score
    
    let coherenceScore = 0;
    const words = content.toLowerCase().split(/\s+/);
    
    // Check for logical flow indicators
    const flowWords = ['however', 'therefore', 'because', 'since', 'although', 'meanwhile'];
    const flowCount = words.filter(word => flowWords.includes(word)).length;
    coherenceScore += (flowCount / sentences.length) * 0.3;
    
    // Check for consistent topic (simple word overlap)
    let topicConsistency = 0;
    for (let i = 1; i < sentences.length; i++) {
      const sent1Words = sentences[i-1].toLowerCase().split(/\s+/);
      const sent2Words = sentences[i].toLowerCase().split(/\s+/);
      const overlap = sent1Words.filter(word => sent2Words.includes(word)).length;
      topicConsistency += overlap / Math.max(sent1Words.length, sent2Words.length);
    }
    coherenceScore += (topicConsistency / (sentences.length - 1)) * 0.4;
    
    // Base coherence for grammar structure
    coherenceScore += 0.3;
    
    return Math.min(1, coherenceScore);
  }

  analyzeGrammar(content) {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    let errors = 0;
    
    sentences.forEach(sentence => {
      const words = sentence.trim().split(/\s+/);
      
      // Check for basic capitalization
      if (words.length > 0 && words[0][0] && words[0][0] !== words[0][0].toUpperCase()) {
        errors++;
      }
      
      // Check for very short sentences
      if (words.length < 2) {
        errors++;
      }
      
      // Check for excessive length
      if (words.length > 50) {
        errors++;
      }
    });
    
    return { errors, sentences: sentences.length };
  }

  calculateEffort(content, interaction) {
    let effort = 0;
    
    // Length factor
    effort += Math.min(0.3, content.length / 200);
    
    // Timing factor
    const responseTime = interaction.responseTime || 0;
    if (responseTime > 5000) effort += 0.2; // Took time to think
    if (responseTime > 15000) effort += 0.1; // Took significant time
    
    // Keystroke factor
    const keystrokeCount = interaction.keystrokeTimings ? interaction.keystrokeTimings.length : 0;
    if (keystrokeCount > content.length * 0.8) effort += 0.2; // Typed most characters
    
    // Complexity factor
    const complexity = this.analyzeComplexity(content);
    effort += complexity.score * 0.3;
    
    return Math.min(1, effort);
  }

  analyzeComplexity(content) {
    const words = content.split(/\s+/);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let complexity = 0;
    
    // Vocabulary diversity
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    const diversity = uniqueWords.size / words.length;
    complexity += diversity * 0.4;
    
    // Average word length
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    complexity += Math.min(0.3, avgWordLength / 10);
    
    // Sentence structure
    const avgSentenceLength = words.length / sentences.length;
    if (avgSentenceLength > 8 && avgSentenceLength < 20) complexity += 0.3;
    
    return { score: Math.min(1, complexity), diversity, avgWordLength, avgSentenceLength };
  }

  cacheContent(walletAddress, content) {
    const key = `${walletAddress}_${Date.now()}`;
    this.contentCache.set(key, {
      content,
      hash: this.hashContent(content),
      timestamp: Date.now()
    });
    
    // Keep only last 1000 entries
    if (this.contentCache.size > 1000) {
      const oldestKey = this.contentCache.keys().next().value;
      this.contentCache.delete(oldestKey);
    }
  }

  async loadSpamPatterns() {
    // Load common spam patterns from storage
    try {
      const patterns = await new Promise(resolve => {
        chrome.storage.local.get(['spam_patterns'], result => {
          resolve(result.spam_patterns || []);
        });
      });
      
      patterns.forEach(pattern => this.spamPatterns.add(pattern));
    } catch (error) {
      console.warn('Failed to load spam patterns:', error);
    }
  }

  async loadQualityMetrics() {
    // Load quality metrics from storage
    try {
      const metrics = await new Promise(resolve => {
        chrome.storage.local.get(['quality_metrics'], result => {
          resolve(result.quality_metrics || {});
        });
      });
      
      Object.entries(metrics).forEach(([key, value]) => {
        this.qualityMetrics.set(key, value);
      });
    } catch (error) {
      console.warn('Failed to load quality metrics:', error);
    }
  }
}

// Export for use in other modules
window.QualityValidator = QualityValidator;
