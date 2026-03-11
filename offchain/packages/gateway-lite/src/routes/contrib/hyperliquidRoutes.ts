/**
 * Hyperliquid API Routes
 * 
 * REST endpoints for n8n workflows to execute Hyperliquid trading operations
 * with Privy embedded wallets and session signers.
 */

import { Router, Request, Response } from 'express';
import { HyperliquidTradingService } from '../../../../contrib/integrations/hyperliquid/tradingService';
import { verifyPrivyToken, PrivyRequest } from '../../middleware/privyAuth';

const router = Router();

// Initialize trading service (mainnet by default, can be configured)
const isTestnet = process.env.HYPERLIQUID_NETWORK === 'testnet';
const tradingService = new HyperliquidTradingService(isTestnet);

// =============================================================================
// Trading Operations
// =============================================================================

/**
 * POST /api/hyperliquid/place-order
 * Place a new order on Hyperliquid
 */
router.post('/place-order', async (req: Request, res: Response) => {
  try {
    const {
      userId,
      symbol,
      side,
      orderType,
      size,
      price,
      triggerPrice,
      trailAmount,
      reduceOnly,
      postOnly,
      timeInForce,
      n8nWorkflowId,
      n8nExecutionId
    } = req.body;

    // Validate required fields
    if (!userId || !symbol || !side || !orderType || !size) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userId', 'symbol', 'side', 'orderType', 'size']
      });
    }

    // Validate order type specific requirements
    if (orderType === 'limit' && !price) {
      return res.status(400).json({
        error: 'Price is required for limit orders'
      });
    }

    if ((orderType === 'stop-loss' || orderType === 'take-profit') && !triggerPrice) {
      return res.status(400).json({
        error: 'Trigger price is required for stop-loss and take-profit orders'
      });
    }

    const result = await tradingService.placeOrder({
      userId,
      symbol,
      side,
      orderType,
      size,
      price,
      triggerPrice,
      trailAmount,
      reduceOnly,
      postOnly,
      timeInForce,
      n8nWorkflowId,
      n8nExecutionId
    });

    res.json({
      success: true,
      data: result,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Place order error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/hyperliquid/cancel-order
 * Cancel an existing order
 */
router.post('/cancel-order', async (req: Request, res: Response) => {
  try {
    const { userId, orderId, symbol, n8nWorkflowId, n8nExecutionId } = req.body;

    if (!userId || !orderId || !symbol) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userId', 'orderId', 'symbol']
      });
    }

    const result = await tradingService.cancelOrder({
      userId,
      orderId,
      symbol,
      n8nWorkflowId,
      n8nExecutionId
    });

    res.json({
      success: true,
      data: result,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/hyperliquid/cancel-all-orders
 * Cancel all orders for a symbol or all symbols
 */
router.post('/cancel-all-orders', async (req: Request, res: Response) => {
  try {
    const { userId, symbol, n8nWorkflowId, n8nExecutionId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'Missing required field: userId'
      });
    }

    const result = await tradingService.cancelAllOrders({
      userId,
      symbol,
      n8nWorkflowId,
      n8nExecutionId
    });

    res.json({
      success: true,
      data: result,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Cancel all orders error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/hyperliquid/modify-order
 * Modify an existing order
 */
router.post('/modify-order', async (req: Request, res: Response) => {
  try {
    const { userId, orderId, symbol, newPrice, newSize, n8nWorkflowId, n8nExecutionId } = req.body;

    if (!userId || !orderId || !symbol) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userId', 'orderId', 'symbol']
      });
    }

    if (!newPrice && !newSize) {
      return res.status(400).json({
        error: 'Must provide either newPrice or newSize'
      });
    }

    const result = await tradingService.modifyOrder({
      userId,
      orderId,
      symbol,
      newPrice,
      newSize,
      n8nWorkflowId,
      n8nExecutionId
    });

    res.json({
      success: true,
      data: result,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Modify order error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/hyperliquid/close-position
 * Close an open position
 */
router.post('/close-position', async (req: Request, res: Response) => {
  try {
    const { userId, symbol, percentage, n8nWorkflowId, n8nExecutionId } = req.body;

    if (!userId || !symbol) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userId', 'symbol']
      });
    }

    const result = await tradingService.closePosition({
      userId,
      symbol,
      percentage: percentage || 100,
      n8nWorkflowId,
      n8nExecutionId
    });

    res.json({
      success: true,
      data: result,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Close position error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/hyperliquid/update-leverage
 * Update leverage for a trading pair
 */
router.post('/update-leverage', async (req: Request, res: Response) => {
  try {
    const { userId, symbol, leverage, crossMargin, n8nWorkflowId, n8nExecutionId } = req.body;

    if (!userId || !symbol || !leverage) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userId', 'symbol', 'leverage']
      });
    }

    if (leverage < 1 || leverage > 50) {
      return res.status(400).json({
        error: 'Leverage must be between 1 and 50'
      });
    }

    const result = await tradingService.updateLeverage({
      userId,
      symbol,
      leverage,
      crossMargin: crossMargin || false
    });

    res.json({
      success: true,
      data: result,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Update leverage error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =============================================================================
// Health Check
// =============================================================================

/**
 * GET /api/hyperliquid/health
 * Check Hyperliquid service health
 */
router.get('/health', async (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    network: isTestnet ? 'testnet' : 'mainnet',
    timestamp: Date.now()
  });
});

export const hyperliquidRouter = router;
