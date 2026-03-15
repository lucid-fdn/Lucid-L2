import express from 'express';
import { getMMRService } from '../../../../engine/src/epoch/services/mmrService';
import { logger } from '../../../../engine/src/lib/logger';

export const systemApiRouter = express.Router();

/**
 * System status and health check
 * GET /system/status
 */
async function handleSystemStatus(req: express.Request, res: express.Response) {
  try {
    const mmrService = getMMRService();
    const agents = mmrService.listAgents();
    const storageHealthy = await mmrService.checkStorageHealth();

    // Get blockchain connection status - test connection without initializing full program
    let blockchainConnected = false;
    let blockchainError = null;
    try {
      const { getConnection } = await import('../../../../engine/src/chain/solana/client');
      const connection = getConnection();
      const slot = await connection.getSlot();
      blockchainConnected = slot > 0;
    } catch (error) {
      blockchainError = error instanceof Error ? error.message : 'Unknown blockchain error';
      logger.info('Blockchain connection check failed:', blockchainError);
    }

    res.json({
      success: true,
      system: {
        status: 'operational',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      },
      blockchain: {
        connected: blockchainConnected,
        error: blockchainError
      },
      storage: {
        healthy: storageHealthy,
        type: 'depin'
      },
      agents: {
        total: agents.length,
        registered: agents
      },
      message: blockchainConnected
        ? 'System status retrieved successfully'
        : 'System operational (blockchain connection issue - see error details)'
    });
  } catch (error) {
    logger.error('Error in handleSystemStatus:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

systemApiRouter.get('/system/status', handleSystemStatus);
