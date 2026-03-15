// Reward Service - Backend implementation of reward system
// Now integrated with profiles + identity_links schema via sessionService
// Using shared PostgreSQL connection pool to prevent connection exhaustion

import { PoolClient } from 'pg';
import pool, { getClient } from '../../../engine/src/shared/db/pool';
import { resolveInternalUserId, ResolvedUser } from '../lib/auth/sessionService';

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
  userId: string;  // This is now the Privy user ID
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

// Extended user data for rewards (combines profiles with reward-specific fields)
interface RewardUserData {
  id: string;           // profiles.id
  privyUserId: string;  // From identity_links
  handle: string | null;
  email: string | null;
  walletAddress: string | null;
  streakDays: number;
  lastActiveDate: string | null;
  totalThoughtsProcessed: number;
  totalShares: number;
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

  // ============================================================================
  // USER MANAGEMENT - Now uses profiles + identity_links via sessionService
  // ============================================================================

  /**
   * Get or create user using the unified profiles + identity_links schema.
   * Accepts an optional client to reuse an existing connection (avoids pool exhaustion).
   */
  async getOrCreateUser(privyUserId: string, walletAddress?: string, existingClient?: PoolClient): Promise<RewardUserData> {
    // Use the new sessionService to resolve Privy ID to internal user ID
    const resolvedUser = await resolveInternalUserId(privyUserId);
    const userId = resolvedUser.userId;

    const client = existingClient || await getClient();
    try {
      // Check if user already has reward-specific data in the users table
      const existingRewardUser = await client.query(
        'SELECT * FROM users WHERE privy_user_id = $1',
        [privyUserId]
      );

      if (existingRewardUser.rows.length > 0) {
        const row = existingRewardUser.rows[0];
        return {
          id: userId,
          privyUserId: privyUserId,
          handle: resolvedUser.profile.handle,
          email: resolvedUser.profile.email,
          walletAddress: row.wallet_address || walletAddress,
          streakDays: row.streak_days || 0,
          lastActiveDate: row.last_active_date,
          totalThoughtsProcessed: row.total_thoughts_processed || 0,
          totalShares: row.total_shares || 0
        };
      }

      // Create reward-specific user record if it doesn't exist
      const newUserResult = await client.query(
        `INSERT INTO users (privy_user_id, wallet_address, streak_days, last_active_date, total_thoughts_processed, total_shares)
         VALUES ($1, $2, 0, CURRENT_DATE, 0, 0)
         ON CONFLICT (privy_user_id) DO UPDATE SET wallet_address = COALESCE(users.wallet_address, $2)
         RETURNING *`,
        [privyUserId, walletAddress]
      );

      const newUser = newUserResult.rows[0];

      // Create initial rewards record if it doesn't exist
      await client.query(
        `INSERT INTO rewards (user_id, mgas_balance, lucid_balance, lifetime_mgas_earned, lifetime_lucid_earned)
         VALUES ($1, 0, 0, 0, 0)
         ON CONFLICT (user_id) DO NOTHING`,
        [newUser.id]
      );

      return {
        id: userId,
        privyUserId: privyUserId,
        handle: resolvedUser.profile.handle,
        email: resolvedUser.profile.email,
        walletAddress: newUser.wallet_address,
        streakDays: newUser.streak_days || 0,
        lastActiveDate: newUser.last_active_date,
        totalThoughtsProcessed: newUser.total_thoughts_processed || 0,
        totalShares: newUser.total_shares || 0
      };
    } finally {
      // Only release if we acquired the client ourselves
      if (!existingClient) {
        client.release();
      }
    }
  }

  /**
   * Get the legacy users table ID for reward operations.
   * Accepts an optional client to reuse an existing connection (avoids pool exhaustion).
   */
  private async getLegacyUserId(privyUserId: string, existingClient?: PoolClient): Promise<string> {
    const client = existingClient || await getClient();
    try {
      const result = await client.query(
        'SELECT id FROM users WHERE privy_user_id = $1',
        [privyUserId]
      );
      if (result.rows.length === 0) {
        throw new Error(`No legacy user found for Privy ID: ${privyUserId}`);
      }
      return result.rows[0].id;
    } finally {
      if (!existingClient) {
        client.release();
      }
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
  // EVENT SYSTEM - Weekend/Monthly Bonus (aligned with extension)
  // ============================================================================

  getCurrentEvents(): Array<{
    type: string;
    title: string;
    description: string;
    multiplier: number;
    icon: string;
  }> {
    const now = new Date();
    const events = [];

    if (now.getDay() === 0 || now.getDay() === 6) {
      events.push({
        type: 'weekend_bonus',
        title: 'Weekend Bonus',
        description: '+20% mGas earnings all weekend!',
        multiplier: 1.2,
        icon: '🎉'
      });
    }

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

  applyEventMultipliers(earnings: number): number {
    const events = this.getCurrentEvents();
    let totalMultiplier = 1.0;

    events.forEach(event => {
      if (event.multiplier) {
        totalMultiplier *= event.multiplier;
      }
    });

    return Math.round(earnings * totalMultiplier);
  }

  // ============================================================================
  // CONVERSATION PROCESSING
  // ============================================================================

  /**
   * Process a conversation message and award rewards.
   * 
   * KEY FIX: Uses a single client for the entire operation, passing it to
   * sub-methods (getOrCreateUser, getLegacyUserId) to avoid nested pool.connect()
   * calls that caused connection pool deadlocks.
   */
  async processConversation(conversationData: ConversationData): Promise<any> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Get or create user — reuse the same client to avoid pool exhaustion
      const user = await this.getOrCreateUser(conversationData.userId, undefined, client);
      
      // Get the legacy user ID — reuse the same client
      const legacyUserId = await this.getLegacyUserId(conversationData.userId, client);

      // Only process user messages for rewards
      if (conversationData.messageType !== 'user') {
        await client.query(
          `INSERT INTO conversations (user_id, message_type, content, input_tokens, output_tokens)
           VALUES ($1, $2, $3, $4, $5)`,
          [legacyUserId, conversationData.messageType, conversationData.content, conversationData.inputTokens, conversationData.outputTokens]
        );
        await client.query('COMMIT');
        return { success: true, earned: 0, message: 'Assistant message saved (no rewards)' };
      }

      // Assess quality
      const qualityAssessment = await this.assessQuality(conversationData.content);

      // Update streak
      const { isFirstDaily, streakDays } = await this.updateStreak(legacyUserId, client);

      // Calculate earnings
      const baseReward = 5;
      const earnings = this.calculateEarnings(baseReward, qualityAssessment, streakDays, isFirstDaily);

      // Save conversation
      await client.query(
        `INSERT INTO conversations (user_id, message_type, content, input_tokens, output_tokens, quality_score, quality_tier, quality_breakdown)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [legacyUserId, conversationData.messageType, conversationData.content, conversationData.inputTokens, conversationData.outputTokens,
         qualityAssessment.score, qualityAssessment.tier, JSON.stringify(qualityAssessment.breakdown)]
      );

      // Update rewards
      await client.query(
        `UPDATE rewards 
         SET mgas_balance = mgas_balance + $1, lifetime_mgas_earned = lifetime_mgas_earned + $1
         WHERE user_id = $2`,
        [earnings.total, legacyUserId]
      );

      // Create transaction record
      await client.query(
        `INSERT INTO reward_transactions (user_id, transaction_type, mgas_amount, source, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [legacyUserId, 'earn', earnings.total, 'conversation', JSON.stringify({
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
        [legacyUserId]
      );

      // Check achievements
      const newAchievements = await this.checkAchievements(legacyUserId, client);

      // Get updated balance
      const rewardsResult = await client.query('SELECT * FROM rewards WHERE user_id = $1', [legacyUserId]);
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
        },
        user: {
          id: user.id,
          handle: user.handle,
          email: user.email
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
      'SELECT quality_tier, quality_score, metadata FROM conversations WHERE user_id = $1',
      [userId]
    );
    const conversations = convsResult.rows;

    const conversionsResult = await client.query(
      'SELECT id FROM mgas_conversions WHERE user_id = $1',
      [userId]
    );

    const batchThoughtsCount = conversations.filter((c: any) => {
      try {
        const metadata = typeof c.metadata === 'string' ? JSON.parse(c.metadata) : c.metadata;
        return metadata?.is_batch === true;
      } catch {
        return false;
      }
    }).length;

    const referralsCount = user?.referred_users?.length || 0;

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
      average_quality: averageQuality,
      batch_thoughts: batchThoughtsCount,
      referrals: referralsCount
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
    const client = await getClient();
    try {
      // Get unified user info — reuse client
      const user = await this.getOrCreateUser(privyUserId, undefined, client);
      const legacyUserId = await this.getLegacyUserId(privyUserId, client);

      const rewardsResult = await client.query('SELECT * FROM rewards WHERE user_id = $1', [legacyUserId]);
      const rewards = rewardsResult.rows[0];

      const achievementsResult = await client.query('SELECT * FROM user_achievements WHERE user_id = $1', [legacyUserId]);
      const achievements = achievementsResult.rows;

      const legacyUserResult = await client.query('SELECT * FROM users WHERE id = $1', [legacyUserId]);
      const legacyUser = legacyUserResult.rows[0];

      return {
        userId: user.id,
        privyUserId: privyUserId,
        handle: user.handle,
        email: user.email,
        walletAddress: user.walletAddress,
        balance: {
          mGas: rewards?.mgas_balance || 0,
          lucid: parseFloat(rewards?.lucid_balance || '0')
        },
        lifetime: {
          mGas: rewards?.lifetime_mgas_earned || 0,
          lucid: parseFloat(rewards?.lifetime_lucid_earned || '0')
        },
        streakDays: legacyUser?.streak_days || 0,
        totalThoughts: legacyUser?.total_thoughts_processed || 0,
        achievements: achievements,
        lastActive: legacyUser?.last_active_date
      };
    } finally {
      client.release();
    }
  }

  async getConversationHistory(privyUserId: string, limit: number = 50): Promise<any[]> {
    const client = await getClient();
    try {
      await this.getOrCreateUser(privyUserId, undefined, client);
      const legacyUserId = await this.getLegacyUserId(privyUserId, client);

      const result = await client.query(
        'SELECT * FROM conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
        [legacyUserId, limit]
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

    const client = await getClient();
    try {
      await client.query('BEGIN');

      await this.getOrCreateUser(privyUserId, undefined, client);
      const legacyUserId = await this.getLegacyUserId(privyUserId, client);

      const rewardsResult = await client.query('SELECT * FROM rewards WHERE user_id = $1', [legacyUserId]);
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
        [mGasAmount - remainingMGas, lucidAmount, legacyUserId]
      );

      await client.query(
        `INSERT INTO mgas_conversions (user_id, mgas_converted, lucid_received, conversion_rate, tx_signature)
         VALUES ($1, $2, $3, $4, $5)`,
        [legacyUserId, mGasAmount - remainingMGas, lucidAmount, this.conversionRate, txSignature]
      );

      await client.query(
        `INSERT INTO reward_transactions (user_id, transaction_type, mgas_amount, lucid_amount, source, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [legacyUserId, 'convert', -(mGasAmount - remainingMGas), lucidAmount, 'conversion', JSON.stringify({
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