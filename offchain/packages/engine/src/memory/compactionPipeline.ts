import type { IMemoryStore } from './store/interface';
import type { CompactionConfig, CompactionResult, EpisodicMemory, MemoryLane } from './types';
import type { ArchivePipeline } from './archivePipeline';

const DEFAULT_LANE_CONFIG: Record<MemoryLane, { hot_window_turns: number; hot_window_ms: number; cold_retention_ms: number }> = {
  self:   { hot_window_turns: 50, hot_window_ms: 86_400_000,  cold_retention_ms: 2_592_000_000 },
  user:   { hot_window_turns: 30, hot_window_ms: 43_200_000,  cold_retention_ms: 1_209_600_000 },
  shared: { hot_window_turns: 50, hot_window_ms: 86_400_000,  cold_retention_ms: 2_592_000_000 },
  market: { hot_window_turns: 10, hot_window_ms: 14_400_000,  cold_retention_ms: 604_800_000 },
};

export class CompactionPipeline {
  constructor(
    private store: IMemoryStore,
    private extractionPipeline: { extractOnSessionClose: Function } | null,
    private archivePipeline: ArchivePipeline | null,
    private config: CompactionConfig,
  ) {}

  async compact(
    agent_passport_id: string,
    namespace: string,
    options?: { session_id?: string; mode?: 'warm' | 'cold' | 'full' },
  ): Promise<CompactionResult> {
    const mode = options?.mode || 'full';
    const result: CompactionResult = {
      sessions_compacted: 0, episodic_archived: 0,
      extraction_triggered: false,
      cold_pruned: 0, snapshot_cid: null,
    };

    // Step 1: Find eligible sessions
    const allSessions = await this.store.listSessions(agent_passport_id);
    let sessions = allSessions.filter(s =>
      (!namespace || s.namespace === namespace) &&
      (s.status === 'closed' || (s.status === 'active' && Date.now() - s.last_activity > this.config.hot_window_ms))
    );
    if (options?.session_id) {
      sessions = sessions.filter(s => s.session_id === options.session_id);
    }

    // Step 2: Warm compaction
    if (mode === 'warm' || mode === 'full') {
      for (const session of sessions) {
        const episodics = await this.store.query({
          agent_passport_id,
          session_id: session.session_id,
          types: ['episodic'],
          status: ['active'],
          order_by: 'turn_index',
          order_dir: 'asc',
          limit: 10000,
        });

        if (episodics.length === 0) continue;

        // Determine hot boundary per lane
        const warmCandidates = episodics.filter(e => {
          const ep = e as EpisodicMemory;
          const lane = (e as any).memory_lane || 'self';
          const laneConfig = this.getLaneConfig(lane as MemoryLane);
          const maxTurn = Math.max(...episodics.map(x => (x as EpisodicMemory).turn_index));
          const isHotByTurn = ep.turn_index > maxTurn - laneConfig.hot_window_turns;
          const isHotByTime = Date.now() - e.created_at < laneConfig.hot_window_ms;
          return !isHotByTurn && !isHotByTime;  // OR-logic: hot if EITHER condition
        });

        // Skip already-compacted ranges
        const uncompacted = warmCandidates.filter(e =>
          (e as EpisodicMemory).turn_index > session.last_compacted_turn_index
        );

        if (uncompacted.length === 0) continue;

        // Run extraction on warm range
        // Note: extraction operates on all unextracted episodics in the session,
        // which may be broader than the compacted range. This is intentional --
        // extraction is session-scoped, compaction is turn-scoped.
        if (this.extractionPipeline) {
          await this.extractionPipeline.extractOnSessionClose(
            session.session_id, agent_passport_id, session.namespace,
          );
          result.extraction_triggered = true;
        }

        // Archive warm episodic entries
        await this.store.archiveBatch(uncompacted.map(e => e.memory_id));
        result.episodic_archived += uncompacted.length;

        // Update watermark
        const maxCompactedTurn = Math.max(...uncompacted.map(e => (e as EpisodicMemory).turn_index));
        await this.store.updateCompactionWatermark(session.session_id, maxCompactedTurn);

        result.sessions_compacted++;
      }
    }

    // Step 3: Cold compaction
    if (mode === 'cold' || mode === 'full') {
      const archived = await this.store.query({
        agent_passport_id,
        namespace: namespace || undefined,
        status: ['archived'],
        limit: 10000,
        order_by: 'created_at',
        order_dir: 'asc',
      });

      const coldCandidates = archived.filter(e => {
        const lane = (e as any).memory_lane || 'self';
        const laneConfig = this.getLaneConfig(lane as MemoryLane);
        return Date.now() - e.created_at > laneConfig.cold_retention_ms;
      });

      if (coldCandidates.length > 0 && this.config.cold_requires_snapshot) {
        const maxCreatedAt = Math.max(...coldCandidates.map(e => e.created_at));
        const snapshots = await this.store.listSnapshots(agent_passport_id);
        const CLOCK_SKEW_BUFFER = 60_000;
        const hasCoveringSnapshot = snapshots.some(s =>
          s.created_at >= maxCreatedAt + CLOCK_SKEW_BUFFER
        );

        if (!hasCoveringSnapshot && this.archivePipeline) {
          const { cid } = await this.archivePipeline.createSnapshot(
            agent_passport_id, 'archive', namespace || undefined,
          );
          result.snapshot_cid = cid;
        } else if (!hasCoveringSnapshot && !this.archivePipeline) {
          return result;
        }
      }

      if (coldCandidates.length > 0) {
        // Emit delete provenance BEFORE hard-deleting rows
        for (const entry of coldCandidates) {
          await this.store.writeProvenance({
            agent_passport_id,
            namespace: entry.namespace,
            memory_id: entry.memory_id,
            operation: 'delete',
            content_hash: entry.content_hash,
            prev_hash: entry.prev_hash,
            created_at: Date.now(),
          });
        }
        await this.store.deleteBatch(coldCandidates.map(e => e.memory_id));
        result.cold_pruned = coldCandidates.length;
      }
    }

    return result;
  }

  private getLaneConfig(lane: MemoryLane): { hot_window_turns: number; hot_window_ms: number; cold_retention_ms: number } {
    const override = this.config.lane_overrides?.[lane];
    const defaults = DEFAULT_LANE_CONFIG[lane];
    return {
      hot_window_turns: override?.hot_window_turns ?? this.config.hot_window_turns ?? defaults.hot_window_turns,
      hot_window_ms: override?.hot_window_ms ?? this.config.hot_window_ms ?? defaults.hot_window_ms,
      cold_retention_ms: override?.cold_retention_ms ?? this.config.cold_retention_ms ?? defaults.cold_retention_ms,
    };
  }
}
