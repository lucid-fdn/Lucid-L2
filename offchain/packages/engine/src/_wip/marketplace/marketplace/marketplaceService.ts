/**
 * Agent Marketplace Service
 *
 * Manages agent listings, discovery, usage tracking, and reviews.
 * Uses in-memory storage (same pattern as PassportStore).
 */

import * as crypto from 'crypto';

export interface MarketplaceListing {
  id: string;
  agent_passport_id: string;
  listing_type: 'free' | 'per_call' | 'subscription' | 'token_gated';
  price_per_call_usd?: number;
  monthly_price_usd?: number;
  token_gate_mint?: string;
  category: string;
  featured: boolean;
  total_calls: number;
  total_revenue_usd: number;
  avg_rating: number;
  review_count: number;
  created_at: number;
  updated_at: number;
}

export interface AgentReview {
  id: string;
  agent_passport_id: string;
  reviewer_tenant_id: string;
  rating: number;
  review_text?: string;
  created_at: number;
}

export interface AgentUsageRecord {
  id: string;
  agent_passport_id: string;
  caller_tenant_id: string;
  session_id?: string;
  tool_calls: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  duration_ms: number;
  status: 'success' | 'error' | 'timeout';
  created_at: number;
}

export interface ListingFilters {
  category?: string;
  listing_type?: string;
  featured?: boolean;
  min_rating?: number;
  search?: string;
  page?: number;
  per_page?: number;
  sort_by?: 'total_calls' | 'avg_rating' | 'created_at' | 'total_revenue_usd';
  sort_order?: 'asc' | 'desc';
}

export class MarketplaceService {
  private listings = new Map<string, MarketplaceListing>();
  private reviews = new Map<string, AgentReview[]>();
  private usage = new Map<string, AgentUsageRecord[]>();

  // --- Listings ---

  async createListing(
    agentPassportId: string,
    params: {
      listing_type: MarketplaceListing['listing_type'];
      price_per_call_usd?: number;
      monthly_price_usd?: number;
      token_gate_mint?: string;
      category?: string;
    }
  ): Promise<MarketplaceListing> {
    const id = crypto.randomUUID();
    const listing: MarketplaceListing = {
      id,
      agent_passport_id: agentPassportId,
      listing_type: params.listing_type,
      price_per_call_usd: params.price_per_call_usd,
      monthly_price_usd: params.monthly_price_usd,
      token_gate_mint: params.token_gate_mint,
      category: params.category || 'general',
      featured: false,
      total_calls: 0,
      total_revenue_usd: 0,
      avg_rating: 0,
      review_count: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    this.listings.set(agentPassportId, listing);
    console.log(`Marketplace listing created: ${agentPassportId} (${params.listing_type})`);
    return listing;
  }

  async getListing(agentPassportId: string): Promise<MarketplaceListing | null> {
    return this.listings.get(agentPassportId) || null;
  }

  async listListings(filters?: ListingFilters): Promise<{ items: MarketplaceListing[]; total: number }> {
    let items = Array.from(this.listings.values());

    // Apply filters
    if (filters?.category) items = items.filter(l => l.category === filters.category);
    if (filters?.listing_type) items = items.filter(l => l.listing_type === filters.listing_type);
    if (filters?.featured !== undefined) items = items.filter(l => l.featured === filters.featured);
    if (filters?.min_rating) items = items.filter(l => l.avg_rating >= filters.min_rating!);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      items = items.filter(l => l.agent_passport_id.toLowerCase().includes(q) || l.category.toLowerCase().includes(q));
    }

    // Sort
    const sortBy = filters?.sort_by || 'created_at';
    const sortOrder = filters?.sort_order || 'desc';
    items.sort((a, b) => {
      const aVal = (a as any)[sortBy] || 0;
      const bVal = (b as any)[sortBy] || 0;
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });

    const total = items.length;
    const page = filters?.page || 1;
    const perPage = filters?.per_page || 20;
    items = items.slice((page - 1) * perPage, page * perPage);

    return { items, total };
  }

  async deleteListing(agentPassportId: string): Promise<boolean> {
    return this.listings.delete(agentPassportId);
  }

  // --- Reviews ---

  async addReview(
    agentPassportId: string,
    reviewerTenantId: string,
    rating: number,
    reviewText?: string
  ): Promise<AgentReview> {
    if (rating < 1 || rating > 5) throw new Error('Rating must be between 1 and 5');

    const review: AgentReview = {
      id: crypto.randomUUID(),
      agent_passport_id: agentPassportId,
      reviewer_tenant_id: reviewerTenantId,
      rating,
      review_text: reviewText,
      created_at: Date.now(),
    };

    const reviews = this.reviews.get(agentPassportId) || [];
    // Replace existing review from same tenant
    const existingIdx = reviews.findIndex(r => r.reviewer_tenant_id === reviewerTenantId);
    if (existingIdx >= 0) reviews[existingIdx] = review;
    else reviews.push(review);
    this.reviews.set(agentPassportId, reviews);

    // Update listing stats
    const listing = this.listings.get(agentPassportId);
    if (listing) {
      listing.review_count = reviews.length;
      listing.avg_rating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      listing.updated_at = Date.now();
    }

    return review;
  }

  async getReviews(agentPassportId: string): Promise<AgentReview[]> {
    return this.reviews.get(agentPassportId) || [];
  }

  // --- Usage Tracking ---

  async trackUsage(record: Omit<AgentUsageRecord, 'id' | 'created_at'>): Promise<AgentUsageRecord> {
    const usage: AgentUsageRecord = {
      ...record,
      id: crypto.randomUUID(),
      created_at: Date.now(),
    };

    const records = this.usage.get(record.agent_passport_id) || [];
    records.push(usage);
    this.usage.set(record.agent_passport_id, records);

    // Update listing stats
    const listing = this.listings.get(record.agent_passport_id);
    if (listing) {
      listing.total_calls++;
      listing.total_revenue_usd += record.cost_usd;
      listing.updated_at = Date.now();
    }

    return usage;
  }

  async getUsageStats(agentPassportId: string): Promise<{
    total_calls: number;
    total_revenue_usd: number;
    avg_duration_ms: number;
    success_rate: number;
  }> {
    const records = this.usage.get(agentPassportId) || [];
    if (records.length === 0) return { total_calls: 0, total_revenue_usd: 0, avg_duration_ms: 0, success_rate: 0 };

    const successful = records.filter(r => r.status === 'success').length;
    return {
      total_calls: records.length,
      total_revenue_usd: records.reduce((sum, r) => sum + r.cost_usd, 0),
      avg_duration_ms: records.reduce((sum, r) => sum + r.duration_ms, 0) / records.length,
      success_rate: successful / records.length,
    };
  }
}

// Singleton
let instance: MarketplaceService | null = null;
export function getMarketplaceService(): MarketplaceService {
  if (!instance) instance = new MarketplaceService();
  return instance;
}
export function resetMarketplaceService(): void { instance = null; }
