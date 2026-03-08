import {
  InMemorySpentProofsStore,
  RedisSpentProofsStore,
  SpentProofsStoreFactory,
} from '../../payment/spentProofsStore';

// ---------------------------------------------------------------------------
// InMemorySpentProofsStore
// ---------------------------------------------------------------------------

describe('InMemorySpentProofsStore', () => {
  let store: InMemorySpentProofsStore;

  beforeEach(() => {
    store = new InMemorySpentProofsStore();
  });

  it('isSpent returns false for an unknown hash', async () => {
    expect(await store.isSpent('0xdeadbeef')).toBe(false);
  });

  it('markSpent makes isSpent return true', async () => {
    await store.markSpent('0xabc123');
    expect(await store.isSpent('0xabc123')).toBe(true);
  });

  it('normalizes tx hashes to lowercase', async () => {
    await store.markSpent('0xABC123');
    expect(await store.isSpent('0xabc123')).toBe(true);
    expect(await store.isSpent('0xABC123')).toBe(true);
  });

  it('count() returns the number of tracked proofs', async () => {
    expect(await store.count()).toBe(0);
    await store.markSpent('0x01');
    await store.markSpent('0x02');
    expect(await store.count()).toBe(2);
  });

  it('close() clears all proofs', async () => {
    await store.markSpent('0x01');
    await store.close!();
    expect(await store.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

describe('SpentProofsStoreFactory', () => {
  it('createInMemory returns an InMemorySpentProofsStore', () => {
    const store = SpentProofsStoreFactory.createInMemory();
    expect(store).toBeInstanceOf(InMemorySpentProofsStore);
  });

  it('create() returns in-memory when REDIS_URL is unset', () => {
    const prev = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      const store = SpentProofsStoreFactory.create();
      expect(store).toBeInstanceOf(InMemorySpentProofsStore);
    } finally {
      if (prev !== undefined) process.env.REDIS_URL = prev;
    }
  });
});

// ---------------------------------------------------------------------------
// RedisSpentProofsStore (requires REDIS_URL)
// ---------------------------------------------------------------------------

const redisUrl = process.env.REDIS_URL;
const describeRedis = redisUrl ? describe : describe.skip;

describeRedis('RedisSpentProofsStore', () => {
  let store: RedisSpentProofsStore;

  beforeAll(() => {
    store = new RedisSpentProofsStore(redisUrl!, 'lucid:x402:test:spent:');
  });

  afterAll(async () => {
    // Clean up test keys
    const client = store.client;
    let cursor = '0';
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        'lucid:x402:test:spent:*',
        'COUNT',
        200,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== '0');

    await store.close!();
  });

  it('markSpent + isSpent round-trip', async () => {
    const hash = '0xRedisRoundTrip' + Date.now();
    expect(await store.isSpent(hash)).toBe(false);
    await store.markSpent(hash, 60);
    expect(await store.isSpent(hash)).toBe(true);
  });

  it('normalizes hashes to lowercase in Redis', async () => {
    const hash = '0xUPPER' + Date.now();
    await store.markSpent(hash, 60);
    expect(await store.isSpent(hash.toLowerCase())).toBe(true);
    expect(await store.isSpent(hash.toUpperCase())).toBe(true);
  });

  it('count() reflects stored keys', async () => {
    const before = await store.count();
    await store.markSpent('0xCountTest' + Date.now(), 60);
    const after = await store.count();
    expect(after).toBe(before + 1);
  });
});
