export interface ProjectableEntry {
  memory_id: string;
  agent_passport_id: string;
  type: string;
  namespace: string;
  memory_lane: string;
  content: string;
  content_hash: string;
  created_at: number;
  metadata: Record<string, unknown>;
  embedding?: number[];
  embedding_model?: string;
  idempotency_key: string;
  [key: string]: unknown;
}

export interface IProjectionSink {
  readonly name: string;
  project(entry: ProjectableEntry): Promise<void>;
  projectBatch(entries: ProjectableEntry[]): Promise<void>;
  remove(memory_ids: string[]): Promise<void>;
  healthCheck(): Promise<boolean>;
}
