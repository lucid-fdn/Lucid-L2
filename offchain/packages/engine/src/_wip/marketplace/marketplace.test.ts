/**
 * Marketplace Service — Comprehensive Tests
 *
 * Tests:
 * - Listings: createListing, getListing, listListings (search, filter, sort, paginate), deleteListing
 * - Reviews: addReview, getReviews (including avg_rating computation and duplicate replacement)
 * - Usage Tracking: trackUsage, getUsageStats (with revenue and success rate)
 * - Factory: getMarketplaceService, resetMarketplaceService
 */

import {
  MarketplaceService,
  getMarketplaceService,
  resetMarketplaceService,
} from '../agent/marketplace/marketplaceService';
import type {
  MarketplaceListing,
  AgentReview,
  AgentUsageRecord,
} from '../agent/marketplace/marketplaceService';

const PASSPORT_A = 'passport_marketplace_a';
const PASSPORT_B = 'passport_marketplace_b';
const PASSPORT_C = 'passport_marketplace_c';

// ===========================================================================
// Listings
// ===========================================================================

describe('MarketplaceService — Listings', () => {
  let service: MarketplaceService;

  beforeEach(() => {
    service = new MarketplaceService();
  });

  describe('createListing', () => {
    it('should create a listing with correct default values', async () => {
      const listing = await service.createListing(PASSPORT_A, {
        listing_type: 'per_call',
        price_per_call_usd: 0.01,
        category: 'research',
      });

      expect(listing.id).toBeTruthy();
      expect(listing.agent_passport_id).toBe(PASSPORT_A);
      expect(listing.listing_type).toBe('per_call');
      expect(listing.price_per_call_usd).toBe(0.01);
      expect(listing.category).toBe('research');
      expect(listing.featured).toBe(false);
      expect(listing.total_calls).toBe(0);
      expect(listing.total_revenue_usd).toBe(0);
      expect(listing.avg_rating).toBe(0);
      expect(listing.review_count).toBe(0);
      expect(listing.created_at).toBeTruthy();
      expect(listing.updated_at).toBeTruthy();
    });

    it('should default category to "general" when not provided', async () => {
      const listing = await service.createListing(PASSPORT_A, {
        listing_type: 'free',
      });
      expect(listing.category).toBe('general');
    });

    it('should support all listing types', async () => {
      const types: Array<'free' | 'per_call' | 'subscription' | 'token_gated'> =
        ['free', 'per_call', 'subscription', 'token_gated'];

      for (const type of types) {
        const listing = await service.createListing(`agent_${type}`, {
          listing_type: type,
        });
        expect(listing.listing_type).toBe(type);
      }
    });

    it('should support optional subscription and token gate fields', async () => {
      const listing = await service.createListing(PASSPORT_A, {
        listing_type: 'subscription',
        monthly_price_usd: 29.99,
      });
      expect(listing.monthly_price_usd).toBe(29.99);

      const gated = await service.createListing(PASSPORT_B, {
        listing_type: 'token_gated',
        token_gate_mint: 'mint_xyz',
      });
      expect(gated.token_gate_mint).toBe('mint_xyz');
    });
  });

  describe('getListing', () => {
    it('should return the listing by passport ID', async () => {
      await service.createListing(PASSPORT_A, {
        listing_type: 'per_call',
        price_per_call_usd: 0.05,
      });

      const listing = await service.getListing(PASSPORT_A);
      expect(listing).not.toBeNull();
      expect(listing!.agent_passport_id).toBe(PASSPORT_A);
      expect(listing!.price_per_call_usd).toBe(0.05);
    });

    it('should return null for non-existent listing', async () => {
      const listing = await service.getListing('nonexistent');
      expect(listing).toBeNull();
    });
  });

  describe('listListings', () => {
    beforeEach(async () => {
      await service.createListing(PASSPORT_A, {
        listing_type: 'per_call',
        price_per_call_usd: 0.01,
        category: 'research',
      });
      await service.createListing(PASSPORT_B, {
        listing_type: 'free',
        category: 'coding',
      });
      await service.createListing(PASSPORT_C, {
        listing_type: 'subscription',
        monthly_price_usd: 9.99,
        category: 'research',
      });
    });

    it('should return all listings without filters', async () => {
      const result = await service.listListings();
      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(3);
    });

    it('should filter by category', async () => {
      const result = await service.listListings({ category: 'research' });
      expect(result.total).toBe(2);
      expect(result.items.every(l => l.category === 'research')).toBe(true);
    });

    it('should filter by listing_type', async () => {
      const result = await service.listListings({ listing_type: 'free' });
      expect(result.total).toBe(1);
      expect(result.items[0].listing_type).toBe('free');
    });

    it('should filter by search term (matches passport ID or category)', async () => {
      const result = await service.listListings({ search: 'coding' });
      expect(result.total).toBe(1);
      expect(result.items[0].category).toBe('coding');
    });

    it('should sort by created_at desc by default', async () => {
      const result = await service.listListings();
      // Most recent first
      expect(result.items[0].created_at).toBeGreaterThanOrEqual(result.items[1].created_at);
    });

    it('should support ascending sort order', async () => {
      const result = await service.listListings({ sort_by: 'created_at', sort_order: 'asc' });
      expect(result.items[0].created_at).toBeLessThanOrEqual(
        result.items[result.items.length - 1].created_at,
      );
    });

    it('should paginate results', async () => {
      const page1 = await service.listListings({ page: 1, per_page: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(3);

      const page2 = await service.listListings({ page: 2, per_page: 2 });
      expect(page2.items).toHaveLength(1);
      expect(page2.total).toBe(3);
    });

    it('should return empty results for out-of-range page', async () => {
      const result = await service.listListings({ page: 100, per_page: 20 });
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(3);
    });

    it('should filter by min_rating', async () => {
      // No reviews yet, all avg_rating=0
      const result = await service.listListings({ min_rating: 3 });
      expect(result.total).toBe(0);
    });
  });

  describe('deleteListing', () => {
    it('should delete an existing listing', async () => {
      await service.createListing(PASSPORT_A, { listing_type: 'free' });
      const deleted = await service.deleteListing(PASSPORT_A);
      expect(deleted).toBe(true);
      expect(await service.getListing(PASSPORT_A)).toBeNull();
    });

    it('should return false for non-existent listing', async () => {
      const deleted = await service.deleteListing('nonexistent');
      expect(deleted).toBe(false);
    });
  });
});

// ===========================================================================
// Reviews
// ===========================================================================

describe('MarketplaceService — Reviews', () => {
  let service: MarketplaceService;

  beforeEach(async () => {
    service = new MarketplaceService();
    await service.createListing(PASSPORT_A, {
      listing_type: 'per_call',
      price_per_call_usd: 0.01,
    });
  });

  describe('addReview', () => {
    it('should create a review with correct fields', async () => {
      const review = await service.addReview(PASSPORT_A, 'tenant_1', 4, 'Great agent!');
      expect(review.id).toBeTruthy();
      expect(review.agent_passport_id).toBe(PASSPORT_A);
      expect(review.reviewer_tenant_id).toBe('tenant_1');
      expect(review.rating).toBe(4);
      expect(review.review_text).toBe('Great agent!');
      expect(review.created_at).toBeTruthy();
    });

    it('should throw when rating is below 1', async () => {
      await expect(service.addReview(PASSPORT_A, 'tenant_1', 0)).rejects.toThrow(
        'Rating must be between 1 and 5',
      );
    });

    it('should throw when rating is above 5', async () => {
      await expect(service.addReview(PASSPORT_A, 'tenant_1', 6)).rejects.toThrow(
        'Rating must be between 1 and 5',
      );
    });

    it('should update listing avg_rating and review_count', async () => {
      await service.addReview(PASSPORT_A, 'tenant_1', 5);
      await service.addReview(PASSPORT_A, 'tenant_2', 3);

      const listing = await service.getListing(PASSPORT_A);
      expect(listing!.review_count).toBe(2);
      expect(listing!.avg_rating).toBe(4); // (5 + 3) / 2
    });

    it('should replace existing review from same tenant', async () => {
      await service.addReview(PASSPORT_A, 'tenant_1', 5, 'Original');
      await service.addReview(PASSPORT_A, 'tenant_1', 2, 'Updated');

      const reviews = await service.getReviews(PASSPORT_A);
      expect(reviews).toHaveLength(1);
      expect(reviews[0].rating).toBe(2);
      expect(reviews[0].review_text).toBe('Updated');

      const listing = await service.getListing(PASSPORT_A);
      expect(listing!.review_count).toBe(1);
      expect(listing!.avg_rating).toBe(2);
    });

    it('should work without a listing (review stored, no listing update)', async () => {
      const review = await service.addReview('no_listing_agent', 'tenant_1', 4);
      expect(review.rating).toBe(4);
      const reviews = await service.getReviews('no_listing_agent');
      expect(reviews).toHaveLength(1);
    });

    it('should create a review without review_text', async () => {
      const review = await service.addReview(PASSPORT_A, 'tenant_1', 5);
      expect(review.review_text).toBeUndefined();
    });
  });

  describe('getReviews', () => {
    it('should return all reviews for an agent', async () => {
      await service.addReview(PASSPORT_A, 'tenant_1', 5);
      await service.addReview(PASSPORT_A, 'tenant_2', 4);
      await service.addReview(PASSPORT_A, 'tenant_3', 3);

      const reviews = await service.getReviews(PASSPORT_A);
      expect(reviews).toHaveLength(3);
    });

    it('should return empty array for agent with no reviews', async () => {
      const reviews = await service.getReviews('no_reviews_agent');
      expect(reviews).toEqual([]);
    });
  });
});

// ===========================================================================
// Usage Tracking
// ===========================================================================

describe('MarketplaceService — Usage Tracking', () => {
  let service: MarketplaceService;

  beforeEach(async () => {
    service = new MarketplaceService();
    await service.createListing(PASSPORT_A, {
      listing_type: 'per_call',
      price_per_call_usd: 0.01,
    });
  });

  describe('trackUsage', () => {
    it('should record a usage event with correct fields', async () => {
      const record = await service.trackUsage({
        agent_passport_id: PASSPORT_A,
        caller_tenant_id: 'caller_1',
        session_id: 'sess_123',
        tool_calls: 5,
        tokens_in: 100,
        tokens_out: 200,
        cost_usd: 0.05,
        duration_ms: 3000,
        status: 'success',
      });

      expect(record.id).toBeTruthy();
      expect(record.agent_passport_id).toBe(PASSPORT_A);
      expect(record.caller_tenant_id).toBe('caller_1');
      expect(record.tool_calls).toBe(5);
      expect(record.cost_usd).toBe(0.05);
      expect(record.status).toBe('success');
      expect(record.created_at).toBeTruthy();
    });

    it('should increment listing total_calls and total_revenue_usd', async () => {
      await service.trackUsage({
        agent_passport_id: PASSPORT_A,
        caller_tenant_id: 'c1',
        tool_calls: 1,
        tokens_in: 50,
        tokens_out: 100,
        cost_usd: 0.01,
        duration_ms: 1000,
        status: 'success',
      });
      await service.trackUsage({
        agent_passport_id: PASSPORT_A,
        caller_tenant_id: 'c2',
        tool_calls: 2,
        tokens_in: 80,
        tokens_out: 150,
        cost_usd: 0.02,
        duration_ms: 2000,
        status: 'success',
      });

      const listing = await service.getListing(PASSPORT_A);
      expect(listing!.total_calls).toBe(2);
      expect(listing!.total_revenue_usd).toBeCloseTo(0.03, 5);
    });

    it('should track error and timeout statuses', async () => {
      await service.trackUsage({
        agent_passport_id: PASSPORT_A,
        caller_tenant_id: 'c1',
        tool_calls: 0,
        tokens_in: 10,
        tokens_out: 0,
        cost_usd: 0,
        duration_ms: 30000,
        status: 'timeout',
      });

      await service.trackUsage({
        agent_passport_id: PASSPORT_A,
        caller_tenant_id: 'c2',
        tool_calls: 1,
        tokens_in: 50,
        tokens_out: 0,
        cost_usd: 0,
        duration_ms: 500,
        status: 'error',
      });

      const stats = await service.getUsageStats(PASSPORT_A);
      expect(stats.total_calls).toBe(2);
      expect(stats.success_rate).toBe(0); // no successful calls
    });
  });

  describe('getUsageStats', () => {
    it('should return zeros for agent with no usage', async () => {
      const stats = await service.getUsageStats('no_usage_agent');
      expect(stats.total_calls).toBe(0);
      expect(stats.total_revenue_usd).toBe(0);
      expect(stats.avg_duration_ms).toBe(0);
      expect(stats.success_rate).toBe(0);
    });

    it('should compute correct aggregate stats', async () => {
      await service.trackUsage({
        agent_passport_id: PASSPORT_A,
        caller_tenant_id: 'c1',
        tool_calls: 3,
        tokens_in: 100,
        tokens_out: 200,
        cost_usd: 0.05,
        duration_ms: 2000,
        status: 'success',
      });
      await service.trackUsage({
        agent_passport_id: PASSPORT_A,
        caller_tenant_id: 'c2',
        tool_calls: 1,
        tokens_in: 50,
        tokens_out: 100,
        cost_usd: 0.02,
        duration_ms: 4000,
        status: 'success',
      });
      await service.trackUsage({
        agent_passport_id: PASSPORT_A,
        caller_tenant_id: 'c3',
        tool_calls: 0,
        tokens_in: 10,
        tokens_out: 0,
        cost_usd: 0,
        duration_ms: 500,
        status: 'error',
      });

      const stats = await service.getUsageStats(PASSPORT_A);
      expect(stats.total_calls).toBe(3);
      expect(stats.total_revenue_usd).toBeCloseTo(0.07, 5);
      expect(stats.avg_duration_ms).toBeCloseTo((2000 + 4000 + 500) / 3, 1);
      expect(stats.success_rate).toBeCloseTo(2 / 3, 5);
    });
  });
});

// ===========================================================================
// Factory (Singleton)
// ===========================================================================

describe('Marketplace Factory', () => {
  beforeEach(() => {
    resetMarketplaceService();
  });

  afterAll(() => {
    resetMarketplaceService();
  });

  it('should return a MarketplaceService instance', () => {
    const service = getMarketplaceService();
    expect(service).toBeInstanceOf(MarketplaceService);
  });

  it('should return the same singleton on repeated calls', () => {
    const s1 = getMarketplaceService();
    const s2 = getMarketplaceService();
    expect(s1).toBe(s2);
  });

  it('should return a new instance after reset', () => {
    const s1 = getMarketplaceService();
    resetMarketplaceService();
    const s2 = getMarketplaceService();
    expect(s1).not.toBe(s2);
  });
});
