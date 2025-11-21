// Reward Service - Backend implementation of reward system
// Ported from browser-extension/reward-system.js
// Using direct PostgreSQL connection

import { Pool } from 'pg';

// Initialize PostgreSQL connection pool (direct connection)
const getPassword = (): string => {
  const pwd = process.env.POSTGRES_PASSWORD || process.env.SUPABASE_DB_PASSWORD;
  if (!pwd) {
    console.warn('⚠️  No PostgreSQL password found in environment variables');
    return '';
  }
  return String(pwd);
};

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'postgres',
  user: process.env.POSTGRES_USER || 'postgres',
  password: getPassword(),
  ssl: { rejectUnauthorized: false },
  // Serverless-optimized connection pool settings
  max: 5,                              // Smaller pool for serverless
  idleTimeoutMillis: 10000,           // 10 seconds instead of 30
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: true,              // Let pool close when idle
});

// Test connection on module load
pool.on('connect', () => {
  console.log('✅ PostgreSQL pool connected for reward service');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err);
});

// Types
interface QualityMetrics {
  creativity: number;
  complexity: number;
  coherence: number;
  uniqueness: number;
  aiEngagement: number;
}

interface QualityAssessment {
  score: number;
  breakdown: QualityMetrics;
  tier: 'excellent' | 'good' | 'average' | 'basic';
}

interface EarningsBreakdown {
  base: number;
  quality: number;
  streak: number;
  firstDaily: number;
  timeBonus: number;
}

interface EarningsResult {
  total: number;
  breakdown: EarningsBreakdown;
}

interface ConversationData {
  userId: string;
  messageType: 'user' | 'assistant';
  content: string;
  inputTokens?: number;
  outputTokens?: number;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  reward: number;
  requirement: string;
  threshold: number;
  icon: string;
}

export class RewardService {
  private qualityThresholds = {
    excellent: 0.9,
    good: 0.7,
    average: 0.5
  };

  private streakMultipliers: { [key: number]: number } = {
    3: 1.1,
    7: 1.25,
    14: 1.5,
    30: 2.0
  };

  private conversionRate = 100;

  private achievements: Achievement[] = [
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
    }
  ];

  // ============================================================================
  // USER MANAGEMENT
  // ============================================================================

  async getOrCreateUser(privyUserId: string, walletAddress?: string): Promise<any> {
    const client = await pool.connect();
    try {
      // Check if user exists
      const existingResult = await client.query(
        'SELECT * FROM users WHERE privy_user_id = $1',
        [privyUserId]
      );

      if (existingResult.rows.length > 0) {
        return existingResult.rows[0];
      }

      // Create new user
      const newUserResult = await client.query(
        `INSERT INTO users (privy_user_id, wallet_address, streak_days, last_active_date, total_thoughts_processed, total_shares)
         VALUES ($1, $2, 0, CURRENT_DATE, 0, 0)
         RETURNING *`,
        [privyUserId, walletAddress]
      );

      const newUser = newUserResult.rows[0];

      // Create initial rewards record
      await client.query(
        `INSERT INTO rewards (user_id, mgas_balance, lucid_balance, lifetime_mgas_earned, lifetime_lucid_earned)
         VALUES ($1, 0, 0, 0, 0)`,
        [newUser.id]
      );

      return newUser;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // QUALITY ASSESSMENT
  // ============================================================================

  async assessQuality(text: string, aiResponse?: string): Promise<QualityAssessment> {
    const metrics: QualityMetrics = {
      creativity: this.assessCreativity(text),
      complexity: this.assessComplexity(text),
      coherence: this.assessCoherence(text),
      uniqueness: await this.assessUniqueness(text),
      aiEngagement: this.assessAIEngagement(aiResponse || '')
    };

    const weights = {
      creativity: 0.25,
      complexity: 0.2,
      coherence: 0.2,
      uniqueness: 0.2,
      aiEngagement: 0.15
    };

    const qualityScore = Object.keys(metrics).reduce((total, key) => {
      return total + (metrics[key as keyof QualityMetrics] * weights[key as keyof typeof weights]);
    }, 0);

    return {
      score: qualityScore,
      breakdown: metrics,
      tier: this.getQualityTier(qualityScore)
    };
  }

  private assessCreativity(text: string): number {
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

  private assessComplexity(text: string): number {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    const words = text.split(/\s+/);
    const avgSentenceLength = words.length / sentences.length;

    const complexWords = words.filter(word => word.length > 6).length;
    const complexityRatio = complexWords / words.length;

    return Math.min((avgSentenceLength / 15) * 0.6 + complexityRatio * 0.4, 1);
  }

  private assessCoherence(text: string): number {
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

  private async assessUniqueness(text: string): Promise<number> {
    return 0.8;
  }

  private assessAIEngagement(response: string): number {
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

  private getQualityTier(score: number): 'excellent' | 'good' | 'average' | 'basic' {
    if (score >= this.qualityThresholds.excellent) return 'excellent';
    if (score >= this.qualityThresholds.good) return 'good';
    if (score >= this.qualityThresholds.average) return 'average';
    return 'basic';
  }

  // ============================================================================
  // EARNINGS CALCULATION
  // ============================================================================

  calculateEarnings(
    baseReward: number,
    qualityAssessment: QualityAssessment,
    streakDays: number,
    isFirstDaily: boolean = false
  ): EarningsResult {
    let totalEarnings = baseReward;

    const qualityBonus = this.calculateQualityBonus(baseReward, qualityAssessment);
    totalEarnings += qualityBonus;

    const streakMultiplier = this.getStreakMultiplier(streakDays);
    totalEarnings *= streakMultiplier;

    if (isFirstDaily) {
      totalEarnings += 5;
    }

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

  private calculateQualityBonus(baseReward: number, qualityAssessment: QualityAssessment): number {
    const multipliers = {
      excellent: 0.5,
      good: 0.3,
      average: 0.1,
      basic: 0
    };

    return Math.round(baseReward * multipliers[qualityAssessment.tier]);
  }

  private getStreakMultiplier(streakDays: number): number {
    const sortedStreaks = Object.keys(this.streakMultipliers)
      .map(Number)
      .sort((a, b) => b - a);

    for (const days of sortedStreaks) {
      if (streakDays >= days) {
        return this.streakMultipliers[days];
      }
    }
    return 1.0;
  }

  private getTimeBonusMultiplier(): number {
    const hour = new Date().getHours();
    const peakHours = [9, 10, 11, 14, 15, 16, 19, 20, 21];
    return peakHours.includes(hour) ? 1.1 : 1.0;
  }

  // ============================================================================
  // CONVERSATION PROCESSING
  // ============================================================================

  async processConversation(conversationData: ConversationData): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get or create user
      const user = await this.getOrCreateUser(conversationData.userId);

      // Only process user messages for rewards
      if (conversationData.messageType !== 'user') {
        await client.query(
          `INSERT INTO conversations (user_id, message_type, content, input_tokens, output_tokens)
           VALUES ($1, $2, $3, $4, $5)`,
          [user.id, conversationData.messageType, conversationData.content, conversationData.inputTokens, conversationData.outputTokens]
        );
        await client.query('COMMIT');
        return { success: true, earned: 0, message: 'Assistant message saved (no rewards)' };
      }

      // Assess quality
      const qualityAssessment = await this.assessQuality(conversationData.content);

      // Update streak
      const { isFirstDaily, streakDays } = await this.updateStreak(user.id, client);

      // Calculate earnings
      const baseReward = 5;
      const earnings = this.calculateEarnings(baseReward, qualityAssessment, streakDays, isFirstDaily);

      // Save conversation
      await client.query(
        `INSERT INTO conversations (user_id, message_type, content, input_tokens, output_tokens, quality_score, quality_tier, quality_breakdown)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [user.id, conversationData.messageType, conversationData.content, conversationData.inputTokens, conversationData.outputTokens,
         qualityAssessment.score, qualityAssessment.tier, JSON.stringify(qualityAssessment.breakdown)]
      );

      // Update rewards
      await client.query(
        `UPDATE rewards 
         SET mgas_balance = mgas_balance + $1, lifetime_mgas_earned = lifetime_mgas_earned + $1
         WHERE user_id = $2`,
        [earnings.total, user.id]
      );

      // Create transaction record
      await client.query(
        `INSERT INTO reward_transactions (user_id, transaction_type, mgas_amount, source, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, 'earn', earnings.total, 'conversation', JSON.stringify({
          quality_score: qualityAssessment.score,
          quality_tier: qualityAssessment.tier,
          quality_breakdown: qualityAssessment.breakdown,
          earnings_breakdown: earnings.breakdown,
          streak_days: streakDays,
          is_first_daily: isFirstDaily
        })]
      );

      // Update user stats
      await client.query(
        'UPDATE users SET total_thoughts_processed = total_thoughts_processed + 1 WHERE id = $1',
        [user.id]
      );

      // Check achievements
      const newAchievements = await this.checkAchievements(user.id, client);

      // Get updated balance
      const rewardsResult = await client.query('SELECT * FROM rewards WHERE user_id = $1', [user.id]);
      const updatedRewards = rewardsResult.rows[0];

      await client.query('COMMIT');

      return {
        success: true,
        earned: earnings.total,
        qualityScore: qualityAssessment.score,
        qualityTier: qualityAssessment.tier,
        streakDays: streakDays,
        isFirstDaily: isFirstDaily,
        newAchievements: newAchievements,
        balance: {
          mGas: updatedRewards?.mgas_balance || 0,
          lucid: parseFloat(updatedRewards?.lucid_balance || '0')
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // STREAK MANAGEMENT
  // ============================================================================

  private async updateStreak(userId: string, client: any): Promise<{ isFirstDaily: boolean; streakDays: number }> {
    const userResult = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    if (!user) {
      throw new Error('User not found');
    }

    const today = new Date().toISOString().split('T')[0];
    const lastActiveDate = user.last_active_date;

    let isFirstDaily = false;
    let newStreakDays = user.streak_days;

    if (lastActiveDate !== today) {
      isFirstDaily = true;

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (lastActiveDate === yesterdayStr) {
        newStreakDays += 1;
      } else if (lastActiveDate && lastActiveDate < yesterdayStr) {
        newStreakDays = 1;
      } else {
        newStreakDays = 1;
      }

      await client.query(
        'UPDATE users SET last_active_date = $1, streak_days = $2 WHERE id = $3',
        [today, newStreakDays, userId]
      );
    }

    return { isFirstDaily, streakDays: newStreakDays };
  }

  // ============================================================================
  // ACHIEVEMENTS
  // ============================================================================

  async checkAchievements(userId: string, client: any): Promise<Achievement[]> {
    const stats = await this.calculateUserStats(userId, client);
    const newAchievements: Achievement[] = [];

    const unlockedResult = await client.query(
      'SELECT achievement_id FROM user_achievements WHERE user_id = $1',
      [userId]
    );
    const unlockedIds = new Set(unlockedResult.rows.map((r: any) => r.achievement_id));

    for (const achievement of this.achievements) {
      if (unlockedIds.has(achievement.id)) continue;

      if (this.meetsRequirement(achievement, stats)) {
        newAchievements.push(achievement);

        await client.query(
          `INSERT INTO user_achievements (user_id, achievement_id, achievement_title, mgas_reward)
           VALUES ($1, $2, $3, $4)`,
          [userId, achievement.id, achievement.title, achievement.reward]
        );

        await client.query(
          `UPDATE rewards 
           SET mgas_balance = mgas_balance + $1, lifetime_mgas_earned = lifetime_mgas_earned + $1
           WHERE user_id = $2`,
          [achievement.reward, userId]
        );

        await client.query(
          `INSERT INTO reward_transactions (user_id, transaction_type, mgas_amount, source, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, 'achievement', achievement.reward, 'achievement', JSON.stringify({
            achievement_id: achievement.id,
            achievement_title: achievement.title
          })]
        );
      }
    }

    return newAchievements;
  }

  private async calculateUserStats(userId: string, client: any): Promise<any> {
    const userResult = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    const convsResult = await client.query(
      'SELECT quality_tier, quality_score FROM conversations WHERE user_id = $1',
      [userId]
    );
    const conversations = convsResult.rows;

    const conversionsResult = await client.query(
      'SELECT id FROM mgas_conversions WHERE user_id = $1',
      [userId]
    );

    const excellentCount = conversations.filter((c: any) => c.quality_tier === 'excellent').length;
    const qualityScores = conversations.map((c: any) => c.quality_score || 0.5);
    const averageQuality = qualityScores.length > 0
      ? qualityScores.reduce((a: number, b: number) => a + b, 0) / qualityScores.length
      : 0;

    return {
      thoughts_processed: user?.total_thoughts_processed || 0,
      excellent_quality: excellentCount,
      max_streak: user?.streak_days || 0,
      conversions: conversionsResult.rows.length,
      shares: user?.total_shares || 0,
      average_quality: averageQuality
    };
  }

  private meetsRequirement(achievement: Achievement, stats: any): boolean {
    const statValue = stats[achievement.requirement];
    return statValue >= achievement.threshold;
  }

  // ============================================================================
  // REWARD QUERIES
  // ============================================================================

  async getUserRewards(privyUserId: string): Promise<any> {
    const client = await pool.connect();
    try {
      const user = await this.getOrCreateUser(privyUserId);

      const rewardsResult = await client.query('SELECT * FROM rewards WHERE user_id = $1', [user.id]);
      const rewards = rewardsResult.rows[0];

      const achievementsResult = await client.query('SELECT * FROM user_achievements WHERE user_id = $1', [user.id]);
      const achievements = achievementsResult.rows;

      return {
        userId: user.privy_user_id,
        walletAddress: user.wallet_address,
        balance: {
          mGas: rewards?.mgas_balance || 0,
          lucid: parseFloat(rewards?.lucid_balance || '0')
        },
        lifetime: {
          mGas: rewards?.lifetime_mgas_earned || 0,
          lucid: parseFloat(rewards?.lifetime_lucid_earned || '0')
        },
        streakDays: user.streak_days,
        totalThoughts: user.total_thoughts_processed,
        achievements: achievements,
        lastActive: user.last_active_date
      };
    } finally {
      client.release();
    }
  }

  async getConversationHistory(privyUserId: string, limit: number = 50): Promise<any[]> {
    const client = await pool.connect();
    try {
      const user = await this.getOrCreateUser(privyUserId);

      const result = await client.query(
        'SELECT * FROM conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
        [user.id, limit]
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // CONVERSION
  // ============================================================================

  async convertMGasToLUCID(privyUserId: string, mGasAmount: number): Promise<any> {
    if (mGasAmount < this.conversionRate) {
      throw new Error(`Minimum ${this.conversionRate} mGas required for conversion`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const user = await this.getOrCreateUser(privyUserId);

      const rewardsResult = await client.query('SELECT * FROM rewards WHERE user_id = $1', [user.id]);
      const currentRewards = rewardsResult.rows[0];

      if ((currentRewards?.mgas_balance || 0) < mGasAmount) {
        throw new Error('Insufficient mGas balance');
      }

      const lucidAmount = Math.floor(mGasAmount / this.conversionRate);
      const remainingMGas = mGasAmount % this.conversionRate;
      const txSignature = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      await client.query(
        `UPDATE rewards 
         SET mgas_balance = mgas_balance - $1, lucid_balance = lucid_balance + $2
         WHERE user_id = $3`,
        [mGasAmount - remainingMGas, lucidAmount, user.id]
      );

      await client.query(
        `INSERT INTO mgas_conversions (user_id, mgas_converted, lucid_received, conversion_rate, tx_signature)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, mGasAmount - remainingMGas, lucidAmount, this.conversionRate, txSignature]
      );

      await client.query(
        `INSERT INTO reward_transactions (user_id, transaction_type, mgas_amount, lucid_amount, source, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, 'convert', -(mGasAmount - remainingMGas), lucidAmount, 'conversion', JSON.stringify({
          conversion_rate: this.conversionRate,
          tx_signature: txSignature
        })]
      );

      await client.query('COMMIT');

      return {
        success: true,
        lucidReceived: lucidAmount,
        remainingMGas: remainingMGas,
        txSignature: txSignature
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

// Export singleton instance
let rewardServiceInstance: RewardService | null = null;

export function getRewardService(): RewardService {
  if (!rewardServiceInstance) {
    rewardServiceInstance = new RewardService();
  }
  return rewardServiceInstance;
}
