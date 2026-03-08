import { Router } from 'express';
import { calculatePayoutSplit, createPayoutFromReceipt, getPayout, storePayout, verifyPayoutSplit } from '../../../engine/src/finance/payoutService';

export const payoutRouter = Router();

/**
 * POST /v1/payouts/calculate
 * Calculate payout split for a run
 */
payoutRouter.post('/v1/payouts/calculate', async (req, res) => {
  try {
    const input = req.body || {};
    const required = ['run_id', 'total_amount_lamports', 'compute_wallet'];
    for (const k of required) {
      if (input[k] === undefined || input[k] === null) {
        return res.status(400).json({ success: false, error: `Missing required field: ${k}` });
      }
    }

    // Convert string to BigInt if needed
    const totalAmount = typeof input.total_amount_lamports === 'string'
      ? BigInt(input.total_amount_lamports)
      : BigInt(input.total_amount_lamports);

    // Map SDK config field names to backend expected names
    // SDK uses: compute_bp, model_bp, orchestrator_bp
    // Backend expects: compute_provider_bp, model_provider_bp, protocol_treasury_bp, orchestrator_bp
    let config = input.config;
    if (config) {
      config = {
        compute_provider_bp: config.compute_provider_bp ?? config.compute_bp ?? 7000,
        model_provider_bp: config.model_provider_bp ?? config.model_bp ?? 2000,
        protocol_treasury_bp: config.protocol_treasury_bp ?? 1000, // SDK doesn't send this, default to 10%
        orchestrator_bp: config.orchestrator_bp ?? 0,
      };
    }

    const payout = calculatePayoutSplit({
      run_id: input.run_id,
      total_amount_lamports: totalAmount,
      compute_wallet: input.compute_wallet,
      model_wallet: input.model_wallet,
      orchestrator_wallet: input.orchestrator_wallet,
      config,
    });

    // Store the payout
    await storePayout(payout);

    // Convert BigInt to string for JSON serialization
    const payoutJson = {
      ...payout,
      total_amount_lamports: payout.total_amount_lamports.toString(),
      recipients: payout.recipients.map(r => ({
        ...r,
        amount_lamports: r.amount_lamports.toString(),
      })),
    };

    return res.json({ success: true, payout: payoutJson });
  } catch (error) {
    console.error('Error in POST /v1/payouts/calculate:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * POST /v1/payouts/from-receipt
 * Create payout split from receipt token data
 */
payoutRouter.post('/v1/payouts/from-receipt', async (req, res) => {
  try {
    const input = req.body || {};
    const required = ['run_id', 'tokens_in', 'tokens_out', 'price_per_1k_tokens_lamports', 'compute_wallet'];
    for (const k of required) {
      if (input[k] === undefined || input[k] === null) {
        return res.status(400).json({ success: false, error: `Missing required field: ${k}` });
      }
    }

    const pricePer1k = typeof input.price_per_1k_tokens_lamports === 'string'
      ? BigInt(input.price_per_1k_tokens_lamports)
      : BigInt(input.price_per_1k_tokens_lamports);

    const payout = createPayoutFromReceipt({
      run_id: input.run_id,
      tokens_in: input.tokens_in,
      tokens_out: input.tokens_out,
      price_per_1k_tokens_lamports: pricePer1k,
      compute_wallet: input.compute_wallet,
      model_wallet: input.model_wallet,
      orchestrator_wallet: input.orchestrator_wallet,
      config: input.config,
    });

    // Store the payout
    await storePayout(payout);

    // Convert BigInt to string for JSON serialization
    const payoutJson = {
      ...payout,
      total_amount_lamports: payout.total_amount_lamports.toString(),
      recipients: payout.recipients.map(r => ({
        ...r,
        amount_lamports: r.amount_lamports.toString(),
      })),
    };

    return res.json({ success: true, payout: payoutJson });
  } catch (error) {
    console.error('Error in POST /v1/payouts/from-receipt:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /v1/payouts/:run_id
 * Get payout split by run_id
 */
payoutRouter.get('/v1/payouts/:run_id', async (req, res) => {
  try {
    const { run_id } = req.params;
    const payout = await getPayout(run_id);
    if (!payout) {
      return res.status(404).json({ success: false, error: 'Payout not found' });
    }

    // Convert BigInt to string for JSON serialization
    const payoutJson = {
      ...payout,
      total_amount_lamports: payout.total_amount_lamports.toString(),
      recipients: payout.recipients.map(r => ({
        ...r,
        amount_lamports: r.amount_lamports.toString(),
      })),
    };

    return res.json({ success: true, payout: payoutJson });
  } catch (error) {
    console.error('Error in GET /v1/payouts/:run_id:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /v1/payouts/:run_id/verify
 * Verify payout split integrity
 */
payoutRouter.get('/v1/payouts/:run_id/verify', async (req, res) => {
  try {
    const { run_id } = req.params;
    const payout = await getPayout(run_id);
    if (!payout) {
      return res.status(404).json({ success: false, error: 'Payout not found' });
    }

    const result = verifyPayoutSplit(payout);
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error in GET /v1/payouts/:run_id/verify:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
