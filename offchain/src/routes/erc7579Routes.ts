/**
 * ERC-7579 Module Routes
 *
 * REST API for smart account module management.
 */

import { Router } from 'express';
import { getERC7579Service } from '../services/identity/erc7579Service';

export const erc7579Router = Router();

/**
 * POST /v2/modules/install
 * Install a module on a smart account.
 */
erc7579Router.post('/v2/modules/install', async (req, res) => {
  try {
    const { chainId, account, moduleType, moduleAddress, initData } = req.body;

    if (!chainId || !account || !moduleType || !moduleAddress) {
      res.status(400).json({
        success: false,
        error: 'chainId, account, moduleType, and moduleAddress are required',
      });
      return;
    }

    const service = getERC7579Service();
    const result = await service.installModule(
      chainId, account, moduleType, moduleAddress, initData,
    );

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to install module',
    });
  }
});

/**
 * POST /v2/modules/uninstall
 * Uninstall a module from a smart account.
 */
erc7579Router.post('/v2/modules/uninstall', async (req, res) => {
  try {
    const { chainId, account, moduleType, moduleAddress } = req.body;

    if (!chainId || !account || !moduleType || !moduleAddress) {
      res.status(400).json({
        success: false,
        error: 'chainId, account, moduleType, and moduleAddress are required',
      });
      return;
    }

    const service = getERC7579Service();
    const result = await service.uninstallModule(
      chainId, account, moduleType, moduleAddress,
    );

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to uninstall module',
    });
  }
});

/**
 * POST /v2/modules/policy/configure
 * Configure allowed policy hashes on the policy module.
 */
erc7579Router.post('/v2/modules/policy/configure', async (req, res) => {
  try {
    const { chainId, account, policyHashes } = req.body;

    if (!chainId || !account || !policyHashes) {
      res.status(400).json({
        success: false,
        error: 'chainId, account, and policyHashes are required',
      });
      return;
    }

    const service = getERC7579Service();
    const result = await service.configurePolicyModule(chainId, account, policyHashes);

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to configure policy module',
    });
  }
});

/**
 * POST /v2/modules/payout/configure
 * Configure payout split on the payout module.
 */
erc7579Router.post('/v2/modules/payout/configure', async (req, res) => {
  try {
    const { chainId, account, recipients, basisPoints } = req.body;

    if (!chainId || !account || !recipients || !basisPoints) {
      res.status(400).json({
        success: false,
        error: 'chainId, account, recipients, and basisPoints are required',
      });
      return;
    }

    const service = getERC7579Service();
    const result = await service.configurePayoutModule(
      chainId, account, recipients, basisPoints,
    );

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to configure payout module',
    });
  }
});

/**
 * GET /v2/modules/:chainId/:account
 * List installed modules for an account.
 */
erc7579Router.get('/v2/modules/:chainId/:account', async (req, res) => {
  try {
    const { chainId, account } = req.params;

    const service = getERC7579Service();
    const modules = service.listInstalledModules(chainId, account);

    res.json({ success: true, modules });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list modules',
    });
  }
});
