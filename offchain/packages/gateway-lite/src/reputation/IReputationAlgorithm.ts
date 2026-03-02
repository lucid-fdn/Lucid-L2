/**
 * Reputation Algorithm Interface
 *
 * Pluggable scoring algorithms for the reputation marketplace.
 * Each algorithm can compute a score from different data sources.
 */

export interface AlgorithmScore {
  /** Overall score (0-100) */
  overall: number;

  /** Component scores (algorithm-specific) */
  components: Record<string, number>;

  /** Raw metadata from the computation */
  metadata?: Record<string, any>;

  /** When the score was computed */
  computedAt: number;
}

export interface ReputationContext {
  /** Chain IDs to consider */
  chainIds?: string[];

  /** Time range (unix seconds) */
  fromTimestamp?: number;
  toTimestamp?: number;

  /** Additional algorithm-specific params */
  params?: Record<string, any>;
}

export interface IReputationAlgorithm {
  /** Unique algorithm identifier */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Semantic version */
  readonly version: string;

  /** Algorithm description */
  readonly description: string;

  /** Compute a reputation score for an agent */
  compute(agentId: string, context: ReputationContext): Promise<AlgorithmScore>;
}
