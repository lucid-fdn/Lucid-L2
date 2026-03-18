/**
 * A2A Protocol — Comprehensive Tests
 *
 * Tests:
 * - Agent Card: generateAgentCard, validateAgentCard
 * - A2A Server: createA2ATask, updateTaskState, addTaskArtifact, extractText, createTaskStore
 * - A2A Client: discoverAgent, sendTask, getTaskStatus, cancelTask
 */

import {
  generateAgentCard,
  validateAgentCard,
  AgentCard,
} from '../compute/control-plane/agent/a2a/agentCard';
import {
  createA2ATask,
  updateTaskState,
  addTaskArtifact,
  extractText,
  createTaskStore,
  A2ATask,
  A2AMessage,
} from '../compute/control-plane/agent/a2a/a2aServer';
import {
  discoverAgent,
  sendTask,
  getTaskStatus,
  cancelTask,
} from '../compute/control-plane/agent/a2a/a2aClient';

const PASSPORT_ID = 'passport_a2a_test_123';
const AGENT_URL = 'https://agent.example.com';

// ---------------------------------------------------------------------------
// Mock global fetch for A2A client
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;
let mockFetch: jest.Mock;

beforeEach(() => {
  mockFetch = jest.fn();
  global.fetch = mockFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ===========================================================================
// Agent Card Generation
// ===========================================================================

describe('generateAgentCard', () => {
  function makeDescriptor(overrides: Record<string, any> = {}): any {
    return {
      agent_config: {
        system_prompt: 'You are a helpful research agent with broad capabilities.',
        model_passport_id: 'passport_model_abc',
        mcp_servers: ['builtin:github', 'builtin:search'],
        skill_slugs: ['code-review'],
        a2a_enabled: true,
        a2a_capabilities: ['research', 'code-review'],
        ...overrides,
      },
    };
  }

  it('should generate a valid AgentCard from a descriptor', () => {
    const card = generateAgentCard(PASSPORT_ID, makeDescriptor(), AGENT_URL);
    expect(card.name).toBe(PASSPORT_ID);
    expect(card.url).toBe(AGENT_URL);
    expect(card.version).toBe('1.0.0');
    expect(card.capabilities).toEqual(['research', 'code-review']);
    expect(card.authentication.type).toBe('bearer');
    expect(card.defaultInputModes).toContain('text');
    expect(card.defaultOutputModes).toContain('text');
  });

  it('should include the system prompt as description (truncated to 500 chars)', () => {
    const longPrompt = 'A'.repeat(600);
    const desc = makeDescriptor({ system_prompt: longPrompt });
    const card = generateAgentCard(PASSPORT_ID, desc, AGENT_URL);
    expect(card.description).toHaveLength(500);
  });

  it('should map MCP servers to skills', () => {
    const card = generateAgentCard(PASSPORT_ID, makeDescriptor(), AGENT_URL);
    const skillNames = card.skills.map(s => s.name);
    expect(skillNames).toContain('builtin:github');
    expect(skillNames).toContain('builtin:search');
  });

  it('should map skill slugs to skills', () => {
    const card = generateAgentCard(PASSPORT_ID, makeDescriptor(), AGENT_URL);
    const skillNames = card.skills.map(s => s.name);
    expect(skillNames).toContain('code-review');
  });

  it('should add a default "chat" skill when no MCP servers or skill slugs', () => {
    const desc = makeDescriptor({
      mcp_servers: [],
      skill_slugs: [],
    });
    const card = generateAgentCard(PASSPORT_ID, desc, AGENT_URL);
    expect(card.skills).toHaveLength(1);
    expect(card.skills[0].name).toBe('chat');
    expect(card.skills[0].inputSchema).toBeDefined();
  });

  it('should include provider information', () => {
    const card = generateAgentCard(PASSPORT_ID, makeDescriptor(), AGENT_URL);
    expect(card.provider).toBeDefined();
    expect(card.provider!.organization).toBe('Lucid');
    expect(card.provider!.url).toBeTruthy();
  });

  it('should handle empty agent_config gracefully', () => {
    const card = generateAgentCard(PASSPORT_ID, {}, AGENT_URL);
    expect(card.name).toBe(PASSPORT_ID);
    expect(card.skills.length).toBeGreaterThan(0);
  });

  it('should handle descriptor with no a2a_capabilities', () => {
    const desc = makeDescriptor({ a2a_capabilities: undefined });
    const card = generateAgentCard(PASSPORT_ID, desc, AGENT_URL);
    expect(card.capabilities).toEqual([]);
  });
});

// ===========================================================================
// Agent Card Validation
// ===========================================================================

describe('validateAgentCard', () => {
  function makeValidCard(): AgentCard {
    return {
      name: 'test-agent',
      description: 'A test agent',
      url: 'https://agent.example.com',
      version: '1.0.0',
      capabilities: ['research'],
      authentication: { type: 'bearer' },
      skills: [{ name: 'chat', description: 'General chat' }],
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
    };
  }

  it('should validate a complete and correct card', () => {
    const result = validateAgentCard(makeValidCard());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject a card with missing name', () => {
    const card = makeValidCard();
    delete (card as any).name;
    const result = validateAgentCard(card);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing name');
  });

  it('should reject a card with missing url', () => {
    const card = makeValidCard();
    delete (card as any).url;
    const result = validateAgentCard(card);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing url');
  });

  it('should reject a card with missing version', () => {
    const card = makeValidCard();
    delete (card as any).version;
    const result = validateAgentCard(card);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing version');
  });

  it('should reject a card with missing skills', () => {
    const card = makeValidCard();
    delete (card as any).skills;
    const result = validateAgentCard(card);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing or invalid skills array');
  });

  it('should reject a card with non-array skills', () => {
    const card = { ...makeValidCard(), skills: 'not-an-array' } as any;
    const result = validateAgentCard(card);
    expect(result.valid).toBe(false);
  });

  it('should reject a card with missing defaultInputModes', () => {
    const card = makeValidCard();
    delete (card as any).defaultInputModes;
    const result = validateAgentCard(card);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing defaultInputModes');
  });

  it('should reject a card with missing defaultOutputModes', () => {
    const card = makeValidCard();
    delete (card as any).defaultOutputModes;
    const result = validateAgentCard(card);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing defaultOutputModes');
  });

  it('should collect multiple errors at once', () => {
    const result = validateAgentCard({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });

  it('should validate an empty name as falsy', () => {
    const card = { ...makeValidCard(), name: '' };
    const result = validateAgentCard(card);
    expect(result.valid).toBe(false);
  });
});

// ===========================================================================
// A2A Server
// ===========================================================================

describe('A2A Server', () => {
  describe('createA2ATask', () => {
    it('should create a task with submitted state', () => {
      const message: A2AMessage = {
        role: 'user',
        parts: [{ type: 'text', text: 'Hello, agent!' }],
      };
      const task = createA2ATask(message);
      expect(task.id).toMatch(/^task_/);
      expect(task.status.state).toBe('submitted');
      expect(task.status.timestamp).toBeTruthy();
      expect(task.messages).toHaveLength(1);
      expect(task.messages[0]).toEqual(message);
    });

    it('should include metadata when provided', () => {
      const message: A2AMessage = {
        role: 'user',
        parts: [{ type: 'text', text: 'Test' }],
      };
      const metadata = { source: 'test', priority: 'high' };
      const task = createA2ATask(message, metadata);
      expect(task.metadata).toEqual(metadata);
    });

    it('should generate unique task IDs', () => {
      const msg: A2AMessage = { role: 'user', parts: [{ type: 'text', text: 'a' }] };
      const t1 = createA2ATask(msg);
      const t2 = createA2ATask(msg);
      expect(t1.id).not.toBe(t2.id);
    });
  });

  describe('updateTaskState', () => {
    it('should update the task status state', () => {
      const msg: A2AMessage = { role: 'user', parts: [{ type: 'text', text: 'hi' }] };
      const task = createA2ATask(msg);
      updateTaskState(task, 'working');
      expect(task.status.state).toBe('working');
    });

    it('should update the timestamp', () => {
      const msg: A2AMessage = { role: 'user', parts: [{ type: 'text', text: 'hi' }] };
      const task = createA2ATask(msg);
      const before = task.status.timestamp;
      // Give a tiny delay to ensure different timestamp
      updateTaskState(task, 'completed');
      expect(task.status.timestamp).toBeTruthy();
      expect(task.status.state).toBe('completed');
    });

    it('should include optional message', () => {
      const msg: A2AMessage = { role: 'user', parts: [{ type: 'text', text: 'hi' }] };
      const task = createA2ATask(msg);
      updateTaskState(task, 'failed', 'Something went wrong');
      expect(task.status.message).toBe('Something went wrong');
    });

    it('should transition through all valid states', () => {
      const msg: A2AMessage = { role: 'user', parts: [{ type: 'text', text: 'hi' }] };
      const task = createA2ATask(msg);

      const states: Array<'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled'> =
        ['working', 'input-required', 'working', 'completed'];

      for (const state of states) {
        updateTaskState(task, state);
        expect(task.status.state).toBe(state);
      }
    });
  });

  describe('addTaskArtifact', () => {
    it('should add a text artifact to the task', () => {
      const msg: A2AMessage = { role: 'user', parts: [{ type: 'text', text: 'hi' }] };
      const task = createA2ATask(msg);
      addTaskArtifact(task, 'Here is the result', 'result');
      expect(task.artifacts).toHaveLength(1);
      expect(task.artifacts![0].name).toBe('result');
      expect(task.artifacts![0].parts).toHaveLength(1);
      expect(task.artifacts![0].parts[0].type).toBe('text');
      expect(task.artifacts![0].parts[0].text).toBe('Here is the result');
    });

    it('should initialize artifacts array if not present', () => {
      const msg: A2AMessage = { role: 'user', parts: [{ type: 'text', text: 'hi' }] };
      const task = createA2ATask(msg);
      expect(task.artifacts).toBeUndefined();
      addTaskArtifact(task, 'Result');
      expect(task.artifacts).toBeDefined();
      expect(task.artifacts).toHaveLength(1);
    });

    it('should append multiple artifacts', () => {
      const msg: A2AMessage = { role: 'user', parts: [{ type: 'text', text: 'hi' }] };
      const task = createA2ATask(msg);
      addTaskArtifact(task, 'Result 1', 'first');
      addTaskArtifact(task, 'Result 2', 'second');
      expect(task.artifacts).toHaveLength(2);
    });

    it('should work without a name', () => {
      const msg: A2AMessage = { role: 'user', parts: [{ type: 'text', text: 'hi' }] };
      const task = createA2ATask(msg);
      addTaskArtifact(task, 'Anonymous result');
      expect(task.artifacts![0].name).toBeUndefined();
    });
  });

  describe('extractText', () => {
    it('should extract text from text parts', () => {
      const msg: A2AMessage = {
        role: 'user',
        parts: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'World' },
        ],
      };
      expect(extractText(msg)).toBe('Hello\nWorld');
    });

    it('should skip non-text parts', () => {
      const msg: A2AMessage = {
        role: 'agent',
        parts: [
          { type: 'text', text: 'Response' },
          { type: 'data', data: { key: 'value' } },
          { type: 'file', file: { name: 'test.txt', mimeType: 'text/plain' } },
        ],
      };
      expect(extractText(msg)).toBe('Response');
    });

    it('should return empty string for message with no text parts', () => {
      const msg: A2AMessage = {
        role: 'user',
        parts: [{ type: 'data', data: { key: 'value' } }],
      };
      expect(extractText(msg)).toBe('');
    });

    it('should skip text parts with undefined text', () => {
      const msg: A2AMessage = {
        role: 'user',
        parts: [
          { type: 'text' },
          { type: 'text', text: 'Only this' },
        ],
      };
      expect(extractText(msg)).toBe('Only this');
    });
  });

  describe('createTaskStore', () => {
    it('should create a store with an empty tasks map', () => {
      const store = createTaskStore();
      expect(store.tasks).toBeInstanceOf(Map);
      expect(store.tasks.size).toBe(0);
    });

    it('should allow storing and retrieving tasks', () => {
      const store = createTaskStore();
      const msg: A2AMessage = { role: 'user', parts: [{ type: 'text', text: 'test' }] };
      const task = createA2ATask(msg);
      store.tasks.set(task.id, task);
      expect(store.tasks.get(task.id)).toBe(task);
    });
  });
});

// ===========================================================================
// A2A Client
// ===========================================================================

describe('A2A Client', () => {
  describe('discoverAgent', () => {
    it('should fetch and return a valid agent card', async () => {
      const validCard: AgentCard = {
        name: 'remote-agent',
        description: 'A remote agent',
        url: AGENT_URL,
        version: '1.0.0',
        capabilities: ['research'],
        authentication: { type: 'bearer' },
        skills: [{ name: 'chat', description: 'General chat' }],
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => validCard,
      });

      const card = await discoverAgent(AGENT_URL);
      expect(card).not.toBeNull();
      expect(card!.name).toBe('remote-agent');
    });

    it('should fetch from /.well-known/agent.json path', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          name: 'test',
          url: AGENT_URL,
          version: '1.0.0',
          skills: [],
          defaultInputModes: ['text'],
          defaultOutputModes: ['text'],
        }),
      });

      await discoverAgent(AGENT_URL);
      expect(mockFetch.mock.calls[0][0]).toBe(`${AGENT_URL}/.well-known/agent.json`);
    });

    it('should strip trailing slash from agent URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          name: 'test',
          url: AGENT_URL,
          version: '1.0.0',
          skills: [],
          defaultInputModes: ['text'],
          defaultOutputModes: ['text'],
        }),
      });

      await discoverAgent(`${AGENT_URL}/`);
      expect(mockFetch.mock.calls[0][0]).toBe(`${AGENT_URL}/.well-known/agent.json`);
    });

    it('should return null when HTTP response is not OK', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      const card = await discoverAgent(AGENT_URL);
      expect(card).toBeNull();
    });

    it('should return null when agent card is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ name: 'incomplete' }), // missing required fields
      });

      const card = await discoverAgent(AGENT_URL);
      expect(card).toBeNull();
    });

    it('should return null on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network unreachable'));
      const card = await discoverAgent(AGENT_URL);
      expect(card).toBeNull();
    });

    it('should pass auth token in Authorization header when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          name: 'test',
          url: AGENT_URL,
          version: '1.0.0',
          skills: [],
          defaultInputModes: ['text'],
          defaultOutputModes: ['text'],
        }),
      });

      await discoverAgent(AGENT_URL, { auth_token: 'secret123' });
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers).toHaveProperty('Authorization', 'Bearer secret123');
    });
  });

  describe('sendTask', () => {
    it('should send a task and return the result', async () => {
      const taskResult: A2ATask = {
        id: 'task_abc',
        status: { state: 'completed', timestamp: new Date().toISOString() },
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
        artifacts: [{ parts: [{ type: 'text', text: 'response' }] }],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => taskResult,
      });

      const result = await sendTask(AGENT_URL, 'hello');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('task_abc');
      expect(result!.status.state).toBe('completed');
    });

    it('should POST to /tasks/send endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'task_1',
          status: { state: 'submitted', timestamp: '' },
          messages: [],
        }),
      });

      await sendTask(AGENT_URL, 'test message');
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(`${AGENT_URL}/tasks/send`);
      expect(opts.method).toBe('POST');

      const body = JSON.parse(opts.body);
      expect(body.message.role).toBe('user');
      expect(body.message.parts[0].text).toBe('test message');
    });

    it('should return null when HTTP response is not OK', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      const result = await sendTask(AGENT_URL, 'fail');
      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));
      const result = await sendTask(AGENT_URL, 'fail');
      expect(result).toBeNull();
    });

    it('should pass auth token when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'task_1', status: { state: 'completed', timestamp: '' }, messages: [] }),
      });

      await sendTask(AGENT_URL, 'msg', { auth_token: 'tok_123' });
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBe('Bearer tok_123');
    });
  });

  describe('getTaskStatus', () => {
    it('should fetch task status by ID', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'task_xyz',
          status: { state: 'working', timestamp: new Date().toISOString() },
          messages: [],
        }),
      });

      const result = await getTaskStatus(AGENT_URL, 'task_xyz');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('task_xyz');
      expect(result!.status.state).toBe('working');
    });

    it('should call the correct URL with task ID', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'task_1', status: { state: 'completed', timestamp: '' }, messages: [] }),
      });

      await getTaskStatus(AGENT_URL, 'task_1');
      expect(mockFetch.mock.calls[0][0]).toBe(`${AGENT_URL}/tasks/task_1`);
    });

    it('should return null when not found', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      const result = await getTaskStatus(AGENT_URL, 'nonexistent');
      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      mockFetch.mockRejectedValue(new Error('timeout'));
      const result = await getTaskStatus(AGENT_URL, 'task_1');
      expect(result).toBeNull();
    });
  });

  describe('cancelTask', () => {
    it('should send DELETE request and return true on success', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const result = await cancelTask(AGENT_URL, 'task_cancel_me');
      expect(result).toBe(true);
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });

    it('should return false when cancel fails', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      const result = await cancelTask(AGENT_URL, 'task_nonexistent');
      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const result = await cancelTask(AGENT_URL, 'task_1');
      expect(result).toBe(false);
    });
  });
});
