import { EventEmitter } from 'events';
import type { MemoryEntry, CompactionResult } from '../types';

export type MemoryEventType =
  | 'memory.created'
  | 'memory.updated'
  | 'memory.archived'
  | 'memory.deleted'
  | 'memory.compacted'
  | 'memory.snapshotted'
  | 'memory.embedding.ready'
  | 'session.created'
  | 'session.closed';

export interface MemoryEvent {
  type: MemoryEventType;
  timestamp: number;
  agent_passport_id: string;
  namespace: string;
}

export interface MemoryCreatedEvent extends MemoryEvent {
  type: 'memory.created';
  entry: MemoryEntry;
}

export interface MemoryArchivedEvent extends MemoryEvent {
  type: 'memory.archived';
  memory_ids: string[];
}

export interface MemoryDeletedEvent extends MemoryEvent {
  type: 'memory.deleted';
  memory_ids: string[];
  content_hashes: string[];
}

export interface MemoryCompactedEvent extends MemoryEvent {
  type: 'memory.compacted';
  result: CompactionResult;
}

export interface MemorySnapshottedEvent extends MemoryEvent {
  type: 'memory.snapshotted';
  snapshot_cid: string;
  entry_count: number;
}

export interface EmbeddingReadyEvent extends MemoryEvent {
  type: 'memory.embedding.ready';
  memory_id: string;
  model: string;
}

export interface SessionCreatedEvent extends MemoryEvent {
  type: 'session.created';
  session_id: string;
}

export interface SessionClosedEvent extends MemoryEvent {
  type: 'session.closed';
  session_id: string;
  summary?: string;
}

// Singleton event bus with reset for test isolation
let bus = new EventEmitter();
bus.setMaxListeners(50);

export function getMemoryEventBus(): EventEmitter {
  return bus;
}

export function resetMemoryEventBus(): void {
  bus.removeAllListeners();
  bus = new EventEmitter();
  bus.setMaxListeners(50);
}

export function emitMemoryEvent(event: MemoryEvent): void {
  bus.emit(event.type, event);
  bus.emit('*', event);
}
