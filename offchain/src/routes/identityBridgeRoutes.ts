/**
 * Identity Bridge Routes
 *
 * REST API for cross-chain identity linking via CAIP-10.
 * CAIP-10 addresses contain colons, so we use wildcard params (0 = everything after prefix).
 */

import { Router } from 'express';
import { getIdentityBridgeService } from '../services/identityBridgeService';

export const identityBridgeRouter = Router();

/**
 * POST /v2/identity/link
 * Link two CAIP-10 addresses together.
 */
identityBridgeRouter.post('/v2/identity/link', async (req, res) => {
  try {
    const { primaryCaip10, linkedCaip10, proof } = req.body;

    if (!primaryCaip10 || !linkedCaip10) {
      res.status(400).json({
        success: false,
        error: 'primaryCaip10 and linkedCaip10 are required',
      });
      return;
    }

    const service = getIdentityBridgeService();
    await service.init();
    const link = await service.linkIdentity(primaryCaip10, linkedCaip10, proof);

    res.json({
      success: true,
      link: {
        linkId: link.linkId,
        primaryCaip10: link.primaryCaip10,
        linkedCaip10: link.linkedCaip10,
        createdAt: link.createdAt,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to link identities',
    });
  }
});

/**
 * POST /v2/identity/resolve
 * Resolve all linked identities for a CAIP-10 address.
 * Uses POST with body to avoid URL-encoding issues with CAIP-10 colons.
 */
identityBridgeRouter.post('/v2/identity/resolve', async (req, res) => {
  try {
    const { caip10 } = req.body;

    if (!caip10) {
      res.status(400).json({ success: false, error: 'caip10 is required' });
      return;
    }

    const service = getIdentityBridgeService();
    await service.init();
    const resolution = service.resolveIdentity(caip10);

    res.json({ success: true, ...resolution });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resolve identity',
    });
  }
});

/**
 * GET /v2/identity/resolve?caip10=...
 * Resolve all linked identities (GET variant with query param).
 */
identityBridgeRouter.get('/v2/identity/resolve', async (req, res) => {
  try {
    const caip10 = req.query.caip10 as string;

    if (!caip10) {
      res.status(400).json({ success: false, error: 'caip10 query param required' });
      return;
    }

    const service = getIdentityBridgeService();
    await service.init();
    const resolution = service.resolveIdentity(caip10);

    res.json({ success: true, ...resolution });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resolve identity',
    });
  }
});

/**
 * GET /v2/identity/chains?caip10=...
 * List all chains a CAIP-10 address is linked to.
 */
identityBridgeRouter.get('/v2/identity/chains', async (req, res) => {
  try {
    const caip10 = req.query.caip10 as string;

    if (!caip10) {
      res.status(400).json({ success: false, error: 'caip10 query param required' });
      return;
    }

    const service = getIdentityBridgeService();
    await service.init();
    const chains = service.getLinkedChains(caip10);

    res.json({ success: true, caip10, chains });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get linked chains',
    });
  }
});

/**
 * POST /v2/identity/unlink
 * Remove an identity link.
 */
identityBridgeRouter.post('/v2/identity/unlink', async (req, res) => {
  try {
    const { primaryCaip10, linkedCaip10 } = req.body;

    if (!primaryCaip10 || !linkedCaip10) {
      res.status(400).json({
        success: false,
        error: 'primaryCaip10 and linkedCaip10 are required',
      });
      return;
    }

    const service = getIdentityBridgeService();
    await service.init();
    const deleted = await service.unlinkIdentity(primaryCaip10, linkedCaip10);

    if (!deleted) {
      res.status(404).json({ success: false, error: 'Link not found' });
      return;
    }

    res.json({ success: true, deleted: true });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete link',
    });
  }
});
