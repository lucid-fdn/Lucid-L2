/**
 * SpentProofsStore — replay-protection for x402 payment proofs.
 *
 * Two implementations:
 *  - RedisSpentProofsStore  : production (ioredis, key prefix + TTL)
 *  - InMemorySpentProofsStore : fallback / tests (Set-based)
 *
 * Factory helpers auto-detect REDIS_URL when available.
 *
 * @module spentProofsStore
 */

import Redis from 'ioredis';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SpentProofsStore {
  /** Returns true if the tx hash has already been spent. */
  isSpent(txHash: string): Promise<boolean>;

  /** Mark a tx hash as spent, with an optional TTL in seconds. */
  markSpent(txHash: string, ttlSeconds?: number): Promise<void>;

  /** Return the number of tracked spent proofs. */
  count(): Promise<number>;

  /** Graceful shutdown (Redis disconnect, etc.). */
  close?(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Redis implementation
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'lucid:x402:spent:';
const DEFAULT_TTL_SECONDS = 86_400; // 24 h

export class RedisSpentProofsStore implements SpentProofsStore {
  private readonly redis: Redis;
  private readonly prefix: string;

  constructor(redisUrl: string, prefix: string = KEY_PREFIX) {
    this.prefix = prefix;
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  private key(txHash: string): string {
    return `${this.prefix}${txHash.toLowerCase()}`;
  }

  async isSpent(txHash: string): Promise<boolean> {
    const exists = await this.redis.exists(this.key(txHash));
    return exists === 1;
  }

  async markSpent(txHash: string, ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<void> {
    await this.redis.set(this.key(txHash), '1', 'EX', ttlSeconds);
  }

  async count(): Promise<number> {
    // SCAN-based count — safe for large key spaces.
    let cursor = '0';
    let total = 0;
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.prefix}*`,
        'COUNT',
        200,
      );
      cursor = nextCursor;
      total += keys.length;
    } while (cursor !== '0');
    return total;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  /** Expose underlying client for health checks / testing. */
  get client(): Redis {
    return this.redis;
  }
}

// ---------------------------------------------------------------------------
// In-memory implementation (fallback / tests)
// ---------------------------------------------------------------------------

export class InMemorySpentProofsStore implements SpentProofsStore {
  private readonly spent = new Set<string>();

  async isSpent(txHash: string): Promise<boolean> {
    return this.spent.has(txHash.toLowerCase());
  }

  async markSpent(txHash: string, _ttlSeconds?: number): Promise<void> {
    this.spent.add(txHash.toLowerCase());
  }

  async count(): Promise<number> {
    return this.spent.size;
  }

  async close(): Promise<void> {
    this.spent.clear();
  }
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

export const SpentProofsStoreFactory = {
  /** Create a Redis-backed store. */
  createRedis(url: string): RedisSpentProofsStore {
    return new RedisSpentProofsStore(url);
  },

  /** Create an in-memory store. */
  createInMemory(): InMemorySpentProofsStore {
    return new InMemorySpentProofsStore();
  },

  /**
   * Auto-detect: use Redis if REDIS_URL is set, otherwise fall back to
   * in-memory.
   */
  create(): SpentProofsStore {
    const url = process.env.REDIS_URL;
    if (url) {
      return SpentProofsStoreFactory.createRedis(url);
    }
    return SpentProofsStoreFactory.createInMemory();
  },
};
