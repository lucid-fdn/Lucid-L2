// offchain/src/routes/shareRoutes.ts
// REST API routes for share token operations

import express from 'express';
import { getTokenLauncher } from '../../../../engine/src/identity/shares';
import { getPassportManager } from '../../../../engine/src/identity/passport/passportManager';
import { getPermanentStorage } from '../../../../engine/src/shared/depin';

export const shareRouter = express.Router();

/**
 * POST /v1/passports/:id/token/launch
 * Launch a share token for a passport
 */
shareRouter.post('/v1/passports/:id/token/launch', async (req, res) => {
  try {
    const passportId = req.params.id;
    const manager = getPassportManager();
    const passport = await manager.getPassport(passportId);

    if (!passport.ok || !passport.data) {
      return res.status(404).json({ success: false, error: 'Passport not found' });
    }

    const { name, symbol, totalSupply, decimals } = req.body;
    if (!name || !symbol || !totalSupply) {
      return res.status(400).json({ success: false, error: 'name, symbol, and totalSupply are required' });
    }

    // Upload token metadata to DePIN (respects kill switch)
    const metadataJson = {
      name,
      symbol,
      description: `Share token for Lucid ${passport.data.type} passport: ${passport.data.name || passportId}`,
      passport_id: passportId,
      passport_type: passport.data.type,
    };

    let metadataUri = '';
    if (process.env.DEPIN_UPLOAD_ENABLED !== 'false') {
      const uploadResult = await getPermanentStorage().uploadJSON(metadataJson, {
        tags: { 'Content-Type': 'application/json', 'lucid-share-token': 'true' },
      });
      metadataUri = uploadResult.url;
    }

    const launcher = getTokenLauncher();
    const result = await launcher.launchToken({
      passportId,
      name,
      symbol,
      uri: metadataUri,
      totalSupply: Number(totalSupply),
      decimals: decimals ? Number(decimals) : undefined,
      owner: passport.data.owner,
    });

    // Store token mint on passport
    await manager.updatePassport(passportId, {
      metadata: { ...passport.data.metadata, share_token_mint: result.mint },
    });

    res.status(201).json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Token launch failed' });
  }
});

/**
 * GET /v1/passports/:id/token
 * Get token info for a passport
 */
shareRouter.get('/v1/passports/:id/token', async (req, res) => {
  try {
    const passportId = req.params.id;
    const launcher = getTokenLauncher();
    const info = await launcher.getTokenInfo(passportId);

    if (!info) {
      return res.status(404).json({ success: false, error: 'No share token found for this passport' });
    }

    res.json({ success: true, ...info });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to get token info' });
  }
});

/**
 * POST /v1/passports/:id/token/airdrop
 * Trigger revenue airdrop for share token holders (admin only)
 */
shareRouter.post('/v1/passports/:id/token/airdrop', async (req, res) => {
  try {
    const passportId = req.params.id;
    const { amountLamports } = req.body;

    if (!amountLamports || Number(amountLamports) <= 0) {
      return res.status(400).json({ success: false, error: 'amountLamports must be a positive number' });
    }

    // Get the token mint from the passport
    const manager = getPassportManager();
    const passport = await manager.getPassport(passportId);
    if (!passport.ok || !passport.data) {
      return res.status(404).json({ success: false, error: 'Passport not found' });
    }

    const tokenMint = passport.data.share_token_mint || passport.data.metadata?.share_token_mint;
    if (!tokenMint) {
      return res.status(400).json({ success: false, error: 'No share token found for this passport. Launch a token first.' });
    }

    const { runRevenueAirdrop } = require('../../../engine/src/payment/airdrop/revenueAirdrop');
    const result = await runRevenueAirdrop(passportId, tokenMint, Number(amountLamports));

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Airdrop failed' });
  }
});
