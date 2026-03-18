/**
 * A2A Protocol Server
 *
 * Implements the server-side A2A protocol for receiving tasks from external agents.
 * Each deployed agent gets an A2A server endpoint.
 */

export type A2ATaskState = 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';

export interface A2AMessage {
  role: 'user' | 'agent';
  parts: A2APart[];
}

export interface A2APart {
  type: 'text' | 'file' | 'data';
  text?: string;
  file?: { name: string; mimeType: string; bytes?: string; uri?: string };
  data?: Record<string, unknown>;
}

export interface A2ATask {
  id: string;
  status: {
    state: A2ATaskState;
    message?: string;
    timestamp: string;
  };
  messages: A2AMessage[];
  artifacts?: Array<{
    name?: string;
    parts: A2APart[];
  }>;
  metadata?: Record<string, unknown>;
}

export interface A2ATaskStore {
  tasks: Map<string, A2ATask>;
}

/**
 * Create a new A2A task from an incoming request.
 */
export function createA2ATask(message: A2AMessage, metadata?: Record<string, unknown>): A2ATask {
  const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  return {
    id,
    status: {
      state: 'submitted',
      timestamp: new Date().toISOString(),
    },
    messages: [message],
    metadata,
  };
}

/**
 * Update task state.
 */
export function updateTaskState(task: A2ATask, state: A2ATaskState, message?: string): void {
  task.status = {
    state,
    message,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Add an artifact (result) to a task.
 */
export function addTaskArtifact(task: A2ATask, text: string, name?: string): void {
  if (!task.artifacts) task.artifacts = [];
  task.artifacts.push({
    name,
    parts: [{ type: 'text', text }],
  });
}

/**
 * Extract text from an A2A message.
 */
export function extractText(message: A2AMessage): string {
  return message.parts
    .filter(p => p.type === 'text' && p.text)
    .map(p => p.text!)
    .join('\n');
}

/**
 * Create an A2A task store.
 */
export function createTaskStore(): A2ATaskStore {
  return { tasks: new Map() };
}

// ── Shared singleton task store ──────────────────────────────────────
// Used by gateway routes so tasks persist across requests within the process.
let sharedStore: A2ATaskStore | null = null;

export function getSharedTaskStore(): A2ATaskStore {
  if (!sharedStore) sharedStore = createTaskStore();
  return sharedStore;
}

/** Save a task to the shared store. */
export function storeTask(task: A2ATask): void {
  getSharedTaskStore().tasks.set(task.id, task);
}

/** Retrieve a task by ID from the shared store. */
export function getTask(taskId: string): A2ATask | null {
  return getSharedTaskStore().tasks.get(taskId) ?? null;
}

/** List tasks, optionally filtered by agent passport and/or state. */
export function listTasks(opts?: { agentPassportId?: string; state?: A2ATaskState }): A2ATask[] {
  const tasks = Array.from(getSharedTaskStore().tasks.values());
  return tasks.filter(t => {
    if (opts?.agentPassportId && t.metadata?.agent_passport_id !== opts.agentPassportId) return false;
    if (opts?.state && t.status.state !== opts.state) return false;
    return true;
  });
}

/** Reset the shared store (for testing). */
export function resetSharedTaskStore(): void {
  sharedStore = null;
}
