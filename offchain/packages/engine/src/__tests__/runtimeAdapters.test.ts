/**
 * Runtime Adapters — Comprehensive Tests
 *
 * Tests all 7 runtime adapters:
 * - VercelAIAdapter
 * - OpenClawAdapter
 * - OpenAIAgentsAdapter
 * - LangGraphAdapter
 * - CrewAIAdapter
 * - GoogleADKAdapter
 * - DockerAdapter
 *
 * Also tests factory functions: getRuntimeAdapter, selectBestAdapter, listAdapterNames
 */

import { VercelAIAdapter } from '../compute/runtime/VercelAIAdapter';
import { OpenClawAdapter } from '../compute/runtime/OpenClawAdapter';
import { OpenAIAgentsAdapter } from '../compute/runtime/OpenAIAgentsAdapter';
import { LangGraphAdapter } from '../compute/runtime/LangGraphAdapter';
import { CrewAIAdapter } from '../compute/runtime/CrewAIAdapter';
import { GoogleADKAdapter } from '../compute/runtime/GoogleADKAdapter';
import { DockerAdapter } from '../compute/runtime/DockerAdapter';
import {
  getRuntimeAdapter,
  selectBestAdapter,
  listAdapterNames,
  resetRuntimeAdapters,
} from '../compute/runtime';
import type { IRuntimeAdapter, RuntimeArtifact } from '../compute/runtime/IRuntimeAdapter';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

function makeDescriptor(overrides: Record<string, any> = {}): any {
  return {
    agent_config: {
      system_prompt: 'You are a helpful research agent.',
      model_passport_id: 'passport_model_abc',
      tool_passport_ids: ['passport_tool1'],
      skill_slugs: ['web-search'],
      mcp_servers: ['builtin:github'],
      autonomy_level: 'semi_autonomous',
      stop_conditions: [
        { type: 'max_steps', value: 100 },
        { type: 'max_cost_usd', value: 5.0 },
      ],
      guardrails: [{ type: 'budget_limit', config: { max_usd: 10 } }],
      memory_enabled: true,
      memory_provider: 'supabase',
      memory_window_size: 20,
      workflow_type: 'single',
      channels: [{ type: 'web', config: {} }],
      a2a_enabled: true,
      a2a_capabilities: ['research', 'code-review'],
      ...overrides,
    },
    deployment_config: {
      target: { type: 'docker' },
      replicas: 1,
      restart_policy: 'on_failure',
    },
  };
}

const PASSPORT_ID = 'passport_test_12345';

// ---------------------------------------------------------------------------
// Helper to validate a RuntimeArtifact shape
// ---------------------------------------------------------------------------

function expectValidArtifact(artifact: RuntimeArtifact, adapterName: string) {
  expect(artifact.adapter).toBe(adapterName);
  expect(artifact.files).toBeInstanceOf(Map);
  expect(artifact.files.size).toBeGreaterThan(0);
  expect(typeof artifact.entrypoint).toBe('string');
  expect(artifact.entrypoint.length).toBeGreaterThan(0);
  expect(typeof artifact.dependencies).toBe('object');
  expect(typeof artifact.env_vars).toBe('object');
}

// ===========================================================================
// VercelAIAdapter
// ===========================================================================

describe('VercelAIAdapter', () => {
  let adapter: VercelAIAdapter;

  beforeEach(() => {
    adapter = new VercelAIAdapter();
  });

  it('should have correct identity properties', () => {
    expect(adapter.name).toBe('vercel-ai');
    expect(adapter.version).toBe('1.0.0');
    expect(adapter.language).toBe('typescript');
  });

  describe('canHandle', () => {
    it('should handle single workflow descriptors', () => {
      expect(adapter.canHandle(makeDescriptor())).toBe(true);
    });

    it('should handle sequential workflow descriptors', () => {
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'sequential' }))).toBe(true);
    });

    it('should handle parallel workflow descriptors', () => {
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'parallel' }))).toBe(true);
    });

    it('should not handle DAG workflow descriptors', () => {
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'dag' }))).toBe(false);
    });

    it('should handle descriptors with no workflow_type set', () => {
      const desc = makeDescriptor();
      delete desc.agent_config.workflow_type;
      expect(adapter.canHandle(desc)).toBe(true);
    });

    it('should handle null/undefined descriptors gracefully', () => {
      expect(adapter.canHandle(null)).toBe(true);
      expect(adapter.canHandle(undefined)).toBe(true);
      expect(adapter.canHandle({})).toBe(true);
    });
  });

  describe('generate', () => {
    it('should produce a valid RuntimeArtifact', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expectValidArtifact(artifact, 'vercel-ai');
    });

    it('should generate agent.ts as the entrypoint', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.entrypoint).toBe('agent.ts');
      expect(artifact.files.has('agent.ts')).toBe(true);
    });

    it('should generate a Dockerfile', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.files.has('Dockerfile')).toBe(true);
      expect(artifact.dockerfile).toBeTruthy();
      expect(artifact.dockerfile).toContain('node:20-slim');
    });

    it('should generate package.json with ai and express dependencies', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.files.has('package.json')).toBe(true);
      expect(artifact.dependencies).toHaveProperty('ai');
      expect(artifact.dependencies).toHaveProperty('@ai-sdk/openai');
      expect(artifact.dependencies).toHaveProperty('express');
    });

    it('should generate tsconfig.json', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.files.has('tsconfig.json')).toBe(true);
    });

    it('should include required env vars', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.env_vars).toHaveProperty('TRUSTGATE_URL');
      expect(artifact.env_vars).toHaveProperty('TRUSTGATE_API_KEY');
      expect(artifact.env_vars).toHaveProperty('PORT');
    });

    it('should embed the passport ID in generated code', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      const agentCode = artifact.files.get('agent.ts')!;
      expect(agentCode).toContain(PASSPORT_ID);
    });

    it('should embed the system prompt in generated code', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      const agentCode = artifact.files.get('agent.ts')!;
      expect(agentCode).toContain('helpful research agent');
    });

    it('should include A2A endpoints when a2a_enabled is true', async () => {
      const desc = makeDescriptor({ a2a_enabled: true });
      const artifact = await adapter.generate(desc, PASSPORT_ID);
      const agentCode = artifact.files.get('agent.ts')!;
      expect(agentCode).toContain('.well-known/agent.json');
      expect(agentCode).toContain('/tasks/send');
    });

    it('should omit A2A endpoints when a2a_enabled is false', async () => {
      const desc = makeDescriptor({ a2a_enabled: false });
      const artifact = await adapter.generate(desc, PASSPORT_ID);
      const agentCode = artifact.files.get('agent.ts')!;
      expect(agentCode).not.toContain('.well-known/agent.json');
    });

    it('should include MCP tool bridge for configured mcp_servers', async () => {
      const desc = makeDescriptor({ mcp_servers: ['builtin:github', 'custom:search'] });
      const artifact = await adapter.generate(desc, PASSPORT_ID);
      const agentCode = artifact.files.get('agent.ts')!;
      expect(agentCode).toContain('callMCPTool');
      expect(agentCode).toContain('builtin_github');
      expect(agentCode).toContain('custom_search');
    });

    it('should respect max_steps from stop_conditions', async () => {
      const desc = makeDescriptor({
        stop_conditions: [{ type: 'max_steps', value: 200 }],
      });
      const artifact = await adapter.generate(desc, PASSPORT_ID);
      const agentCode = artifact.files.get('agent.ts')!;
      expect(agentCode).toContain('maxSteps: 200');
    });
  });
});

// ===========================================================================
// OpenClawAdapter
// ===========================================================================

describe('OpenClawAdapter', () => {
  let adapter: OpenClawAdapter;

  beforeEach(() => {
    adapter = new OpenClawAdapter();
  });

  it('should have correct identity properties', () => {
    expect(adapter.name).toBe('openclaw');
    expect(adapter.version).toBe('1.0.0');
    expect(adapter.language).toBe('typescript');
  });

  describe('canHandle', () => {
    it('should handle single workflow descriptors', () => {
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'single' }))).toBe(true);
    });

    it('should not handle sequential workflow descriptors', () => {
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'sequential' }))).toBe(false);
    });

    it('should not handle parallel workflow descriptors', () => {
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'parallel' }))).toBe(false);
    });

    it('should not handle DAG workflow descriptors', () => {
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'dag' }))).toBe(false);
    });

    it('should handle descriptors with no workflow_type set', () => {
      const desc = makeDescriptor();
      delete desc.agent_config.workflow_type;
      expect(adapter.canHandle(desc)).toBe(true);
    });
  });

  describe('generate', () => {
    it('should produce a valid RuntimeArtifact', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expectValidArtifact(artifact, 'openclaw');
    });

    it('should generate SKILL.md as the entrypoint', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.entrypoint).toBe('SKILL.md');
      expect(artifact.files.has('SKILL.md')).toBe(true);
    });

    it('should have empty dependencies (pure markdown)', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(Object.keys(artifact.dependencies)).toHaveLength(0);
    });

    it('should not generate a Dockerfile (markdown-only output)', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.dockerfile).toBeUndefined();
    });

    it('should embed passport ID and model in SKILL.md frontmatter', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      const skill = artifact.files.get('SKILL.md')!;
      expect(skill).toContain(`passport_id: ${PASSPORT_ID}`);
      expect(skill).toContain('passport_model_abc');
    });

    it('should generate config.json with gateway configuration', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.files.has('config.json')).toBe(true);
    });

    it('should include required env vars', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.env_vars).toHaveProperty('TRUSTGATE_URL');
      expect(artifact.env_vars).toHaveProperty('MCPGATE_URL');
    });

    it('should include A2A section when a2a_enabled is true', async () => {
      const desc = makeDescriptor({ a2a_enabled: true, a2a_capabilities: ['research'] });
      const artifact = await adapter.generate(desc, PASSPORT_ID);
      const skill = artifact.files.get('SKILL.md')!;
      expect(skill).toContain('Agent-to-Agent Communication');
      expect(skill).toContain('research');
    });
  });
});

// ===========================================================================
// OpenAIAgentsAdapter
// ===========================================================================

describe('OpenAIAgentsAdapter', () => {
  let adapter: OpenAIAgentsAdapter;

  beforeEach(() => {
    adapter = new OpenAIAgentsAdapter();
  });

  it('should have correct identity properties', () => {
    expect(adapter.name).toBe('openai-agents');
    expect(adapter.version).toBe('1.0.0');
    expect(adapter.language).toBe('python');
  });

  describe('canHandle', () => {
    it('should handle all workflow types', () => {
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'single' }))).toBe(true);
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'sequential' }))).toBe(true);
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'parallel' }))).toBe(true);
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'dag' }))).toBe(true);
    });
  });

  describe('generate', () => {
    it('should produce a valid RuntimeArtifact', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expectValidArtifact(artifact, 'openai-agents');
    });

    it('should generate agent.py as the entrypoint', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.entrypoint).toBe('agent.py');
      expect(artifact.files.has('agent.py')).toBe(true);
    });

    it('should generate requirements.txt with openai-agents', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.files.has('requirements.txt')).toBe(true);
      const reqs = artifact.files.get('requirements.txt')!;
      expect(reqs).toContain('openai-agents');
    });

    it('should generate a Python-appropriate Dockerfile', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.files.has('Dockerfile')).toBe(true);
      expect(artifact.dockerfile).toContain('python:3.12-slim');
    });

    it('should include OPENAI_API_KEY in env vars', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.env_vars).toHaveProperty('OPENAI_API_KEY');
    });

    it('should include A2A endpoints when a2a_enabled is true', async () => {
      const desc = makeDescriptor({ a2a_enabled: true });
      const artifact = await adapter.generate(desc, PASSPORT_ID);
      const code = artifact.files.get('agent.py')!;
      expect(code).toContain('.well-known/agent.json');
      expect(code).toContain('/tasks/send');
    });

    it('should generate MCP tool functions for configured servers', async () => {
      const desc = makeDescriptor({ mcp_servers: ['builtin:github'] });
      const artifact = await adapter.generate(desc, PASSPORT_ID);
      const code = artifact.files.get('agent.py')!;
      expect(code).toContain('builtin_github_tool');
    });

    it('should include python dependencies', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.dependencies).toHaveProperty('openai-agents');
      expect(artifact.dependencies).toHaveProperty('fastapi');
    });
  });
});

// ===========================================================================
// LangGraphAdapter
// ===========================================================================

describe('LangGraphAdapter', () => {
  let adapter: LangGraphAdapter;

  beforeEach(() => {
    adapter = new LangGraphAdapter();
  });

  it('should have correct identity properties', () => {
    expect(adapter.name).toBe('langgraph');
    expect(adapter.version).toBe('1.0.0');
    expect(adapter.language).toBe('python');
  });

  describe('canHandle', () => {
    it('should handle all workflow types including DAG', () => {
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'dag' }))).toBe(true);
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'single' }))).toBe(true);
    });
  });

  describe('generate', () => {
    it('should produce a valid RuntimeArtifact', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expectValidArtifact(artifact, 'langgraph');
    });

    it('should generate agent.py with LangGraph imports', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.entrypoint).toBe('agent.py');
      const code = artifact.files.get('agent.py')!;
      expect(code).toContain('langgraph');
      expect(code).toContain('create_react_agent');
    });

    it('should include MemorySaver when memory_enabled is true', async () => {
      const desc = makeDescriptor({ memory_enabled: true });
      const artifact = await adapter.generate(desc, PASSPORT_ID);
      const code = artifact.files.get('agent.py')!;
      expect(code).toContain('MemorySaver');
      expect(code).toContain('checkpointer = MemorySaver()');
    });

    it('should set checkpointer to None when memory_enabled is false', async () => {
      const desc = makeDescriptor({ memory_enabled: false });
      const artifact = await adapter.generate(desc, PASSPORT_ID);
      const code = artifact.files.get('agent.py')!;
      expect(code).toContain('checkpointer = None');
    });

    it('should include langgraph in dependencies', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.dependencies).toHaveProperty('langgraph');
      expect(artifact.dependencies).toHaveProperty('langchain-openai');
    });

    it('should generate a Dockerfile', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.dockerfile).toContain('python:3.12-slim');
    });
  });
});

// ===========================================================================
// CrewAIAdapter
// ===========================================================================

describe('CrewAIAdapter', () => {
  let adapter: CrewAIAdapter;

  beforeEach(() => {
    adapter = new CrewAIAdapter();
  });

  it('should have correct identity properties', () => {
    expect(adapter.name).toBe('crewai');
    expect(adapter.version).toBe('1.0.0');
    expect(adapter.language).toBe('python');
  });

  describe('canHandle', () => {
    it('should handle all workflow types', () => {
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'dag' }))).toBe(true);
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'single' }))).toBe(true);
    });
  });

  describe('generate', () => {
    it('should produce a valid RuntimeArtifact', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expectValidArtifact(artifact, 'crewai');
    });

    it('should generate crew.py as the entrypoint', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.entrypoint).toBe('crew.py');
      expect(artifact.files.has('crew.py')).toBe(true);
    });

    it('should generate YAML config files for agents and tasks', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.files.has('config/agents.yaml')).toBe(true);
      expect(artifact.files.has('config/tasks.yaml')).toBe(true);
    });

    it('should include crewai in dependencies', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.dependencies).toHaveProperty('crewai');
    });

    it('should embed max_steps from stop_conditions into agents.yaml', async () => {
      const desc = makeDescriptor({
        stop_conditions: [{ type: 'max_steps', value: 75 }],
      });
      const artifact = await adapter.generate(desc, PASSPORT_ID);
      const agentsYaml = artifact.files.get('config/agents.yaml')!;
      expect(agentsYaml).toContain('max_iter: 75');
    });

    it('should generate a Dockerfile', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.dockerfile).toContain('python:3.12-slim');
    });
  });
});

// ===========================================================================
// GoogleADKAdapter
// ===========================================================================

describe('GoogleADKAdapter', () => {
  let adapter: GoogleADKAdapter;

  beforeEach(() => {
    adapter = new GoogleADKAdapter();
  });

  it('should have correct identity properties', () => {
    expect(adapter.name).toBe('google-adk');
    expect(adapter.version).toBe('1.0.0');
    expect(adapter.language).toBe('python');
  });

  describe('canHandle', () => {
    it('should handle all workflow types', () => {
      expect(adapter.canHandle(makeDescriptor())).toBe(true);
      expect(adapter.canHandle(makeDescriptor({ workflow_type: 'dag' }))).toBe(true);
    });
  });

  describe('generate', () => {
    it('should produce a valid RuntimeArtifact', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expectValidArtifact(artifact, 'google-adk');
    });

    it('should generate agent.py with google.adk imports', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.entrypoint).toBe('agent.py');
      const code = artifact.files.get('agent.py')!;
      expect(code).toContain('google.adk');
      expect(code).toContain('FunctionTool');
    });

    it('should include google-adk in dependencies', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.dependencies).toHaveProperty('google-adk');
    });

    it('should include GOOGLE_API_KEY in env vars', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.env_vars).toHaveProperty('GOOGLE_API_KEY');
    });

    it('should generate requirements.txt', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.files.has('requirements.txt')).toBe(true);
      const reqs = artifact.files.get('requirements.txt')!;
      expect(reqs).toContain('google-adk');
    });

    it('should generate a Dockerfile', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.dockerfile).toContain('python:3.12-slim');
    });
  });
});

// ===========================================================================
// DockerAdapter (Universal Fallback)
// ===========================================================================

describe('DockerAdapter', () => {
  let adapter: DockerAdapter;

  beforeEach(() => {
    adapter = new DockerAdapter();
  });

  it('should have correct identity properties', () => {
    expect(adapter.name).toBe('docker');
    expect(adapter.version).toBe('1.0.0');
    expect(adapter.language).toBe('typescript');
  });

  describe('canHandle', () => {
    it('should handle ALL workflow types (universal fallback)', () => {
      // DockerAdapter.canHandle() takes no args — always returns true
      expect(adapter.canHandle()).toBe(true);
    });
  });

  describe('generate', () => {
    it('should produce a valid RuntimeArtifact', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expectValidArtifact(artifact, 'docker');
    });

    it('should generate agent.ts as the entrypoint', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.entrypoint).toBe('agent.ts');
      expect(artifact.files.has('agent.ts')).toBe(true);
    });

    it('should use minimal dependencies (tsx only)', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.dependencies).toHaveProperty('tsx');
      expect(Object.keys(artifact.dependencies)).toHaveLength(1);
    });

    it('should use Node.js built-in http module (no express)', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      const code = artifact.files.get('agent.ts')!;
      expect(code).toContain('import http from "node:http"');
      expect(code).not.toContain('express');
    });

    it('should generate a Dockerfile with node:20-slim', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      expect(artifact.dockerfile).toContain('node:20-slim');
    });

    it('should embed system prompt and model in generated code', async () => {
      const artifact = await adapter.generate(makeDescriptor(), PASSPORT_ID);
      const code = artifact.files.get('agent.ts')!;
      expect(code).toContain('passport_model_abc');
      expect(code).toContain('helpful research agent');
    });
  });
});

// ===========================================================================
// Factory Functions
// ===========================================================================

describe('Runtime Adapter Factory', () => {
  beforeEach(() => {
    resetRuntimeAdapters();
  });

  afterAll(() => {
    resetRuntimeAdapters();
  });

  describe('getRuntimeAdapter', () => {
    it('should return the correct adapter by name', () => {
      expect(getRuntimeAdapter('vercel-ai').name).toBe('vercel-ai');
      expect(getRuntimeAdapter('openclaw').name).toBe('openclaw');
      expect(getRuntimeAdapter('openai-agents').name).toBe('openai-agents');
      expect(getRuntimeAdapter('langgraph').name).toBe('langgraph');
      expect(getRuntimeAdapter('crewai').name).toBe('crewai');
      expect(getRuntimeAdapter('google-adk').name).toBe('google-adk');
      expect(getRuntimeAdapter('docker').name).toBe('docker');
    });

    it('should throw for unknown adapter names', () => {
      expect(() => getRuntimeAdapter('nonexistent')).toThrow('Unknown runtime adapter');
    });

    it('should throw with a helpful message listing available adapters', () => {
      expect(() => getRuntimeAdapter('bogus')).toThrow('Available:');
    });
  });

  describe('selectBestAdapter', () => {
    it('should select vercel-ai for single workflow (highest priority)', () => {
      const desc = makeDescriptor({ workflow_type: 'single' });
      const adapter = selectBestAdapter(desc);
      expect(adapter.name).toBe('vercel-ai');
    });

    it('should skip vercel-ai for DAG workflow and pick next compatible', () => {
      const desc = makeDescriptor({ workflow_type: 'dag' });
      const adapter = selectBestAdapter(desc);
      // vercel-ai does not handle DAG, openclaw does not handle DAG either
      // openai-agents, langgraph, crewai, google-adk, docker all handle DAG
      expect(adapter.name).toBe('openai-agents');
    });

    it('should use preferred adapter when specified and compatible', () => {
      const desc = makeDescriptor({ workflow_type: 'single' });
      const adapter = selectBestAdapter(desc, 'crewai');
      expect(adapter.name).toBe('crewai');
    });

    it('should ignore preferred adapter when it cannot handle the descriptor', () => {
      const desc = makeDescriptor({ workflow_type: 'dag' });
      const adapter = selectBestAdapter(desc, 'vercel-ai');
      // vercel-ai cannot handle DAG, should fall through
      expect(adapter.name).not.toBe('vercel-ai');
    });

    it('should always fall back to docker as last resort', () => {
      // Docker handles everything, so it is guaranteed as a fallback
      const desc = makeDescriptor({ workflow_type: 'dag' });
      const adapter = selectBestAdapter(desc);
      // Could be openai-agents (higher priority), but docker is guaranteed to work
      expect(adapter).toBeTruthy();
    });
  });

  describe('listAdapterNames', () => {
    it('should return all 7 adapter names', () => {
      const names = listAdapterNames();
      expect(names).toHaveLength(7);
      expect(names).toContain('vercel-ai');
      expect(names).toContain('openclaw');
      expect(names).toContain('openai-agents');
      expect(names).toContain('langgraph');
      expect(names).toContain('crewai');
      expect(names).toContain('google-adk');
      expect(names).toContain('docker');
    });
  });
});
