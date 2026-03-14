import { CompactionPipeline } from '../compactionPipeline';
import { SQLiteMemoryStore } from '../store/sqlite/store';
import type { CompactionConfig } from '../types';
import { getDefaultCompactionConfig } from '../types';

describe('Compaction E2E (SQLite)', () => {
  let store: SQLiteMemoryStore;

  beforeEach(() => {
    store = new SQLiteMemoryStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  function writeEpisodic(
    sessionId: string,
    turnIndex: number,
    content: string,
    lane: string = 'self',
  ) {
    return store.write({
      agent_passport_id: 'agent-1',
      type: 'episodic',
      namespace: 'ns',
      content,
      metadata: {},
      session_id: sessionId,
      role: 'user',
      tokens: 10,
      turn_index: turnIndex,
      content_hash: `hash-${sessionId}-${turnIndex}`,
      prev_hash: turnIndex > 0 ? `hash-${sessionId}-${turnIndex - 1}` : null,
      memory_lane: lane,
    } as any);
  }

  test('warm compaction: archives oldest episodics beyond hot window', async () => {
    const config: CompactionConfig = {
      ...getDefaultCompactionConfig(),
      hot_window_turns: 2,
      hot_window_ms: 0, // disable time-based hot window for deterministic test
      cold_requires_snapshot: false,
    };
    const pipeline = new CompactionPipeline(store, null, null, config);

    // Create a closed session
    await store.createSession({
      session_id: 'sess-1',
      agent_passport_id: 'agent-1',
      namespace: 'ns',
      status: 'closed',
    });

    // Write 5 episodic entries (turns 0-4)
    for (let i = 0; i < 5; i++) {
      await writeEpisodic('sess-1', i, `Turn ${i}`);
    }

    // Compact warm: hot_window_turns=2 means turns 3-4 are hot, turns 0-2 should be archived
    const result = await pipeline.compact('agent-1', 'ns', { mode: 'warm' });

    expect(result.episodic_archived).toBe(3); // turns 0, 1, 2
    expect(result.sessions_compacted).toBe(1);

    // Verify the oldest 3 are archived
    const archived = await store.query({
      agent_passport_id: 'agent-1',
      status: ['archived'],
      types: ['episodic'],
      limit: 100,
    });
    expect(archived.length).toBe(3);

    // Verify the newest 2 are still active
    const active = await store.query({
      agent_passport_id: 'agent-1',
      status: ['active'],
      types: ['episodic'],
      limit: 100,
    });
    expect(active.length).toBe(2);
  });

  test('cold compaction: deletes archived entries and preserves provenance', async () => {
    const config: CompactionConfig = {
      ...getDefaultCompactionConfig(),
      hot_window_turns: 2,
      hot_window_ms: 0,
      cold_retention_ms: 0, // immediate cold eligibility
      cold_requires_snapshot: false,
    };
    const pipeline = new CompactionPipeline(store, null, null, config);

    await store.createSession({
      session_id: 'sess-1',
      agent_passport_id: 'agent-1',
      namespace: 'ns',
      status: 'closed',
    });

    // Write 5 episodics
    for (let i = 0; i < 5; i++) {
      await writeEpisodic('sess-1', i, `Turn ${i}`);
    }

    // First, warm compact to archive the old ones
    await pipeline.compact('agent-1', 'ns', { mode: 'warm' });

    // Verify some are archived
    const archivedBefore = await store.query({
      agent_passport_id: 'agent-1',
      status: ['archived'],
      limit: 100,
    });
    expect(archivedBefore.length).toBeGreaterThan(0);

    // Now cold compact to delete the archived ones
    const coldResult = await pipeline.compact('agent-1', 'ns', { mode: 'cold' });

    expect(coldResult.cold_pruned).toBe(archivedBefore.length);

    // Verify archived entries are gone
    const archivedAfter = await store.query({
      agent_passport_id: 'agent-1',
      status: ['archived'],
      limit: 100,
    });
    expect(archivedAfter.length).toBe(0);

    // Verify provenance records exist for deleted entries
    const provenance = await store.getProvenanceChain('agent-1', 'ns', 100);
    const deleteOps = provenance.filter(p => p.operation === 'delete');
    expect(deleteOps.length).toBe(archivedBefore.length);
  });

  test('snapshot safety gate: cold compact aborts without archive pipeline', async () => {
    const config: CompactionConfig = {
      ...getDefaultCompactionConfig(),
      hot_window_turns: 2,
      hot_window_ms: 0,
      cold_retention_ms: 0,
      cold_requires_snapshot: true, // Require snapshot before cold deletion
    };
    // No archive pipeline provided (null)
    const pipeline = new CompactionPipeline(store, null, null, config);

    await store.createSession({
      session_id: 'sess-1',
      agent_passport_id: 'agent-1',
      namespace: 'ns',
      status: 'closed',
    });

    for (let i = 0; i < 5; i++) {
      await writeEpisodic('sess-1', i, `Turn ${i}`);
    }

    // Warm compact first
    await pipeline.compact('agent-1', 'ns', { mode: 'warm' });

    // Verify entries are archived
    const archived = await store.query({
      agent_passport_id: 'agent-1',
      status: ['archived'],
      limit: 100,
    });
    expect(archived.length).toBeGreaterThan(0);

    // Cold compact should NOT delete because cold_requires_snapshot=true
    // and there is no archive pipeline to create a snapshot
    const coldResult = await pipeline.compact('agent-1', 'ns', { mode: 'cold' });

    expect(coldResult.cold_pruned).toBe(0);
    expect(coldResult.snapshot_cid).toBeNull();

    // Archived entries should still be there
    const stillArchived = await store.query({
      agent_passport_id: 'agent-1',
      status: ['archived'],
      limit: 100,
    });
    expect(stillArchived.length).toBe(archived.length);
  });

  test('full compaction cycle: write -> warm -> verify archived -> cold -> verify deleted', async () => {
    const config: CompactionConfig = {
      ...getDefaultCompactionConfig(),
      hot_window_turns: 2,
      hot_window_ms: 0,
      cold_retention_ms: 0,
      cold_requires_snapshot: false,
    };
    const pipeline = new CompactionPipeline(store, null, null, config);

    await store.createSession({
      session_id: 'sess-full',
      agent_passport_id: 'agent-1',
      namespace: 'ns',
      status: 'closed',
    });

    // Write 5 episodics
    for (let i = 0; i < 5; i++) {
      await writeEpisodic('sess-full', i, `Full cycle turn ${i}`);
    }

    // Verify all 5 are active
    const allActive = await store.query({
      agent_passport_id: 'agent-1',
      status: ['active'],
      types: ['episodic'],
      limit: 100,
    });
    expect(allActive.length).toBe(5);

    // Full compaction
    const result = await pipeline.compact('agent-1', 'ns', { mode: 'full' });

    // Warm should have archived some
    expect(result.episodic_archived).toBe(3); // turns 0, 1, 2

    // Cold should have deleted the archived ones
    expect(result.cold_pruned).toBe(3);

    // Only 2 active entries should remain
    const remaining = await store.query({
      agent_passport_id: 'agent-1',
      status: ['active'],
      types: ['episodic'],
      limit: 100,
    });
    expect(remaining.length).toBe(2);

    // No archived entries should remain
    const archivedAfter = await store.query({
      agent_passport_id: 'agent-1',
      status: ['archived'],
      limit: 100,
    });
    expect(archivedAfter.length).toBe(0);
  });
});
