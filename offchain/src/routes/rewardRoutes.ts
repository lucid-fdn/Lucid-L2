// Reward Routes - API endpoints for reward system
import express from 'express';
import { getRewardService } from '../services/rewardService';

const router = express.Router();

/**
 * POST /api/rewards/earn
 * Record mGas earnings from thought processing
 */
router.post('/earn', async (req, res) => {
  try {
    const { userId, mGasEarned, thoughtText, qualityScore, qualityTier, streakDays, timestamp } = req.body;

    if (!userId || !mGasEarned) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId and mGasEarned are required'
      });
    }

    console.log(`💰 Recording ${mGasEarned} mGas earnings for user ${userId}`);

    const rewardService = getRewardService();
    const user = await rewardService.getOrCreateUser(userId);

    // Update user's balance
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'postgres',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || process.env.SUPABASE_DB_PASSWORD || '',
    });

    await pool.query(
      `UPDATE rewards 
       SET mgas_balance = mgas_balance + $1, 
           lifetime_mgas_earned = lifetime_mgas_earned + $1,
           total_thoughts = total_thoughts + 1
       WHERE user_id = $2`,
      [mGasEarned, user.id]
    );

    // Record the thought in conversations table
    await pool.query(
      `INSERT INTO conversations (user_id, message_type, content, input_tokens, output_tokens, mgas_earned, quality_score, quality_tier, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [user.id, 'thought', thoughtText, 0, 0, mGasEarned, qualityScore || 0.5, qualityTier || 'average', new Date(timestamp || Date.now())]
    );

    // Get updated balance
    const balanceResult = await pool.query(
      'SELECT mgas_balance, lucid_balance, lifetime_mgas_earned, total_thoughts FROM rewards WHERE user_id = $1',
      [user.id]
    );

    await pool.end();

    const balance = balanceResult.rows[0] || { mgas_balance: 0, lucid_balance: 0 };

    console.log(`✅ Earnings recorded. New balance: ${balance.mgas_balance} mGas`);

    res.json({
      success: true,
      earned: mGasEarned,
      balance: {
        mGas: balance.mgas_balance,
        lucid: balance.lucid_balance,
        lifetimeEarned: balance.lifetime_mgas_earned,
        totalThoughts: balance.total_thoughts
      }
    });
  } catch (error) {
    console.error('Error recording earnings:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/rewards/process-conversation
 * Process a ChatGPT conversation message and award rewards
 * This is the core endpoint called by the browser extension
 */
router.post('/process-conversation', async (req, res) => {
  try {
    const { userId, messageType, content, inputTokens, outputTokens } = req.body;

    if (!userId || !messageType || !content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, messageType, and content are required'
      });
    }

    if (messageType !== 'user' && messageType !== 'assistant') {
      return res.status(400).json({
        success: false,
        error: 'Invalid messageType. Must be "user" or "assistant"'
      });
    }

    console.log(`📝 Processing conversation for user ${userId}, type: ${messageType}`);

    const rewardService = getRewardService();
    const result = await rewardService.processConversation({
      userId,
      messageType,
      content,
      inputTokens,
      outputTokens
    });

    console.log(`✅ Conversation processed: ${result.earned} mGas earned`);

    res.json(result);
  } catch (error) {
    console.error('Error processing conversation:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/rewards/balance/:userId
 * Get user's current reward balance and stats
 */
router.get('/balance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId parameter is required'
      });
    }

    console.log(`📊 Fetching rewards balance for user ${userId}`);

    const rewardService = getRewardService();
    const rewards = await rewardService.getUserRewards(userId);

    res.json({
      success: true,
      rewards
    });
  } catch (error) {
    console.error('Error fetching rewards:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/rewards/history/:userId
 * Get user's conversation history
 */
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId parameter is required'
      });
    }

    console.log(`📜 Fetching conversation history for user ${userId}`);

    const rewardService = getRewardService();
    const history = await rewardService.getConversationHistory(userId, limit);

    res.json({
      success: true,
      count: history.length,
      history
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/rewards/convert
 * Convert mGas to LUCID tokens
 */
router.post('/convert', async (req, res) => {
  try {
    const { userId, mGasAmount } = req.body;

    if (!userId || !mGasAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId and mGasAmount are required'
      });
    }

    if (typeof mGasAmount !== 'number' || mGasAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'mGasAmount must be a positive number'
      });
    }

    console.log(`💱 Converting ${mGasAmount} mGas to LUCID for user ${userId}`);

    const rewardService = getRewardService();
    const result = await rewardService.convertMGasToLUCID(userId, mGasAmount);

    console.log(`✅ Conversion complete: ${result.lucidReceived} LUCID`);

    res.json(result);
  } catch (error) {
    console.error('Error converting mGas:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/rewards/achievements/:userId
 * Get user's achievements
 */
router.get('/achievements/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId parameter is required'
      });
    }

    console.log(`🏆 Fetching achievements for user ${userId}`);

    const rewardService = getRewardService();
    const rewards = await rewardService.getUserRewards(userId);

    res.json({
      success: true,
      achievements: rewards.achievements,
      totalUnlocked: rewards.achievements.length
    });
  } catch (error) {
    console.error('Error fetching achievements:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/rewards/sync
 * Sync rewards state (useful for extension to update its UI)
 * This combines balance, achievements, and recent history in one call
 */
router.post('/sync', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`🔄 Syncing rewards state for user ${userId}`);

    const rewardService = getRewardService();
    
    // Get all relevant data in parallel
    const [rewards, history] = await Promise.all([
      rewardService.getUserRewards(userId),
      rewardService.getConversationHistory(userId, 10) // Last 10 for quick sync
    ]);

    res.json({
      success: true,
      sync: {
        timestamp: new Date().toISOString(),
        rewards,
        recentHistory: history
      }
    });
  } catch (error) {
    console.error('Error syncing rewards:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/rewards/share
 * Increment user's share count (for social features)
 */
router.post('/share', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`📢 Recording share for user ${userId}`);

    const rewardService = getRewardService();
    const user = await rewardService.getOrCreateUser(userId);

    // Update share count in database (using direct PostgreSQL connection)
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'postgres',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || process.env.SUPABASE_DB_PASSWORD || '',
    });

    await pool.query(
      'UPDATE users SET total_shares = total_shares + 1 WHERE id = $1',
      [user.id]
    );
    
    await pool.end();

    res.json({
      success: true,
      message: 'Share recorded successfully',
      totalShares: (user.totalShares || 0) + 1
    });
  } catch (error) {
    console.error('Error recording share:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/rewards/events
 * Get current active events (weekend bonus, monthly challenge, etc.)
 */
router.get('/events', async (req, res) => {
  try {
    console.log('🎪 Fetching active events');
    
    const rewardService = getRewardService();
    const events = rewardService.getCurrentEvents();
    
    res.json({
      success: true,
      events: events,
      count: events.length
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/rewards/leaderboard
 * Get top users by earnings, streak, or achievements
 * Query params: category (total_earnings|streak|achievements), limit (default 10)
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const category = (req.query.category as string) || 'total_earnings';
    const limit = parseInt(req.query.limit as string) || 10;
    
    console.log(`🏆 Fetching leaderboard: ${category}, limit: ${limit}`);
    
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'postgres',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || process.env.SUPABASE_DB_PASSWORD || '',
      ssl: { rejectUnauthorized: false }
    });
    
    let query = '';
    
    switch (category) {
      case 'total_earnings':
        query = `
          SELECT u.privy_user_id, u.wallet_address, r.lifetime_mgas_earned as value
          FROM users u
          JOIN rewards r ON u.id = r.user_id
          ORDER BY r.lifetime_mgas_earned DESC
          LIMIT $1
        `;
        break;
      case 'streak':
        query = `
          SELECT u.privy_user_id, u.wallet_address, u.streak_days as value
          FROM users u
          ORDER BY u.streak_days DESC
          LIMIT $1
        `;
        break;
      case 'achievements':
        query = `
          SELECT u.privy_user_id, u.wallet_address, COUNT(ua.id) as value
          FROM users u
          LEFT JOIN user_achievements ua ON u.id = ua.user_id
          GROUP BY u.id, u.privy_user_id, u.wallet_address
          ORDER BY COUNT(ua.id) DESC
          LIMIT $1
        `;
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid category. Use: total_earnings, streak, or achievements'
        });
    }
    
    const result = await pool.query(query, [limit]);
    await pool.end();
    
    const leaderboard = result.rows.map((row, index) => ({
      rank: index + 1,
      userId: row.privy_user_id,
      address: row.wallet_address ? 
        `${row.wallet_address.slice(0, 6)}...${row.wallet_address.slice(-4)}` : 
        'Anonymous',
      value: parseInt(row.value) || 0,
      category: category
    }));
    
    res.json({
      success: true,
      category: category,
      leaderboard: leaderboard
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/rewards/stats
 * Get overall system statistics (for admin/monitoring)
 */
router.get('/stats', async (req, res) => {
  try {
    console.log('📈 Fetching system reward stats');

    const { Pool } = await import('pg');
    const pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'postgres',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || process.env.SUPABASE_DB_PASSWORD || '',
    });

    // Get aggregate stats
    const  [usersResult, rewardsResult, convsResult, achievsResult] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT mgas_balance, lifetime_mgas_earned FROM rewards'),
      pool.query('SELECT COUNT(*) FROM conversations'),
      pool.query('SELECT COUNT(*) FROM user_achievements')
    ]);

    const totalUsers = parseInt(usersResult.rows[0].count);
    const totalRewards = rewardsResult.rows;
    const totalConversations = parseInt(convsResult.rows[0].count);
    const totalAchievements = parseInt(achievsResult.rows[0].count);

    const totalMGasInCirculation = totalRewards.reduce((sum: number, r: any) => sum + (r.mgas_balance || 0), 0);
    const totalMGasEarned = totalRewards.reduce((sum: number, r: any) => sum + (r.lifetime_mgas_earned || 0), 0);
    
    await pool.end();

    res.json({
      success: true,
      stats: {
        totalUsers: totalUsers || 0,
        totalConversations: totalConversations || 0,
        totalAchievementsUnlocked: totalAchievements || 0,
        totalMGasInCirculation,
        totalMGasEarned,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
