// offchain/packages/gateway-lite/src/routes/agentMarketplaceRoutes.ts
// REST API routes for the agent marketplace.

import express from 'express';
import { verifyAdminAuth } from '../../middleware/adminAuth';

// Lazy import to avoid circular deps
function getMarketplace() {
  const { getMarketplaceService } = require('../../../engine/src/agent/marketplace');
  return getMarketplaceService();
}

export const agentMarketplaceRouter = express.Router();

/**
 * GET /v1/marketplace/agents
 * Browse marketplace listings
 */
agentMarketplaceRouter.get('/v1/marketplace/agents', async (req, res) => {
  try {
    const {
      category,
      listing_type,
      featured,
      min_rating,
      search,
      page,
      per_page,
      sort_by,
      sort_order,
    } = req.query;

    const marketplace = getMarketplace();
    const result = await marketplace.listListings({
      category: category as string,
      listing_type: listing_type as string,
      featured: featured === 'true' ? true : undefined,
      min_rating: min_rating ? parseFloat(min_rating as string) : undefined,
      search: search as string,
      page: page ? parseInt(page as string, 10) : undefined,
      per_page: per_page ? parseInt(per_page as string, 10) : undefined,
      sort_by: sort_by as any,
      sort_order: sort_order as any,
    });

    return res.json({
      success: true,
      listings: result.items,
      total: result.total,
    });
  } catch (error) {
    console.error('Error in GET /v1/marketplace/agents:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/marketplace/agents/:passportId
 * Get listing details
 */
agentMarketplaceRouter.get('/v1/marketplace/agents/:passportId', async (req, res) => {
  try {
    const { passportId } = req.params;

    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }

    const marketplace = getMarketplace();
    const listing = await marketplace.getListing(passportId);

    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    return res.json({ success: true, listing });
  } catch (error) {
    console.error('Error in GET /v1/marketplace/agents/:passportId:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/marketplace/agents/:passportId/reviews
 * Get reviews for an agent listing
 */
agentMarketplaceRouter.get('/v1/marketplace/agents/:passportId/reviews', async (req, res) => {
  try {
    const { passportId } = req.params;

    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }

    const marketplace = getMarketplace();
    const reviews = await marketplace.getReviews(passportId);

    return res.json({ success: true, reviews });
  } catch (error) {
    console.error('Error in GET /v1/marketplace/agents/:passportId/reviews:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /v1/marketplace/agents/:passportId/reviews
 * Add a review to an agent listing
 */
agentMarketplaceRouter.post('/v1/marketplace/agents/:passportId/reviews', verifyAdminAuth, async (req, res) => {
  try {
    const { passportId } = req.params;
    const { reviewer_tenant_id, rating, review_text } = req.body || {};

    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }
    if (!reviewer_tenant_id) {
      return res.status(400).json({ success: false, error: 'Missing required field: reviewer_tenant_id' });
    }
    if (rating === undefined || rating === null) {
      return res.status(400).json({ success: false, error: 'Missing required field: rating' });
    }

    const marketplace = getMarketplace();
    const review = await marketplace.addReview(passportId, reviewer_tenant_id, rating, review_text);

    return res.status(201).json({ success: true, review });
  } catch (error) {
    console.error('Error in POST /v1/marketplace/agents/:passportId/reviews:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/marketplace/agents/:passportId/stats
 * Get usage statistics for an agent
 */
agentMarketplaceRouter.get('/v1/marketplace/agents/:passportId/stats', async (req, res) => {
  try {
    const { passportId } = req.params;

    if (!passportId) {
      return res.status(400).json({ success: false, error: 'Missing passportId parameter' });
    }

    const marketplace = getMarketplace();
    const stats = await marketplace.getUsageStats(passportId);

    return res.json({ success: true, stats });
  } catch (error) {
    console.error('Error in GET /v1/marketplace/agents/:passportId/stats:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});
