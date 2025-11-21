// Reward Routes - API endpoints for reward system
import express from 'express';
import { getRewardService } from '../services/rewardService';

const router = express.Router();

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
      totalShares: (user.total_shares || 0) + 1
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
