import type { MemoryType, MemoryLane } from '../types';

export interface QueryIntent {
  type_boosts: Record<string, number>;
  lane_boosts: Record<string, number>;
  classification: 'fact' | 'policy' | 'recent' | 'market' | 'default';
}

const SEMANTIC_KEYWORDS = ['prefer', 'fact', 'profile', 'balance', 'name', 'email', 'like', 'dislike', 'favorite', 'setting'];
const PROCEDURAL_KEYWORDS = ['should', 'rule', 'policy', 'instruction', 'behavior', 'respond', 'greeting', 'always', 'never', 'must'];
const EPISODIC_KEYWORDS = ['recent', 'just', 'happened', 'last', 'previous', 'earlier', 'session', 'conversation', 'said'];
const MARKET_KEYWORDS = ['price', 'market', 'protocol', 'chain', 'token', 'tvl', 'volume', 'rate', 'state'];
const USER_KEYWORDS = ['user', 'preference', 'their', 'customer', 'client'];
const SELF_KEYWORDS = ['my', 'self', 'internal', 'strategy', 'plan'];
const SHARED_KEYWORDS = ['team', 'shared', 'org', 'organization', 'company', 'workspace'];

function hasKeyword(query: string, keywords: string[]): boolean {
  const lower = query.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

/**
 * Classification priority (highest wins):
 *   1. episodic ('recent')  — temporal queries take precedence
 *   2. procedural ('policy') — behavioral/rule queries
 *   3. semantic ('fact')    — factual/preference queries
 *   4. market              — only wins if no type matched
 *   5. 'default'           — no keywords matched
 *
 * Type boosts are additive — all matching categories boost independently.
 * Only `classification` (the primary label) follows this precedence.
 */
export function classifyQueryIntent(query: string): QueryIntent {
  const type_boosts: Record<string, number> = { episodic: 0, semantic: 0, procedural: 0 };
  const lane_boosts: Record<string, number> = { self: 0, user: 0, shared: 0, market: 0 };
  let classification: QueryIntent['classification'] = 'default';

  const hasSemantic = hasKeyword(query, SEMANTIC_KEYWORDS);
  const hasProcedural = hasKeyword(query, PROCEDURAL_KEYWORDS);
  const hasEpisodic = hasKeyword(query, EPISODIC_KEYWORDS);

  if (hasSemantic) type_boosts.semantic = 0.3;
  if (hasProcedural) type_boosts.procedural = 0.3;
  if (hasEpisodic) type_boosts.episodic = 0.3;

  // Classification follows priority: episodic > procedural > semantic
  if (hasSemantic) classification = 'fact';
  if (hasProcedural) classification = 'policy';
  if (hasEpisodic) classification = 'recent';

  // Lane boosts
  if (hasKeyword(query, MARKET_KEYWORDS)) {
    lane_boosts.market = 0.2;
    if (classification === 'default') classification = 'market';
  }
  if (hasKeyword(query, USER_KEYWORDS)) lane_boosts.user = 0.2;
  if (hasKeyword(query, SELF_KEYWORDS)) lane_boosts.self = 0.2;
  if (hasKeyword(query, SHARED_KEYWORDS)) lane_boosts.shared = 0.2;

  return { type_boosts, lane_boosts, classification };
}
