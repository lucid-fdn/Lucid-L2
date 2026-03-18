import { validateWithSchema } from '../shared/crypto/schemaValidator';
import {
  AgentDescriptor,
  DEFAULT_AGENT_CONFIG,
  DEFAULT_DEPLOYMENT_CONFIG,
  DEFAULT_COMPLIANCE,
} from '../compute/control-plane/agent/agentDescriptor';

describe('AgentDescriptor Schema Validation', () => {
  const validDescriptor: AgentDescriptor = {
    agent_config: {
      system_prompt: 'You are a helpful research agent.',
      model_passport_id: 'passport_abc123',
      tool_passport_ids: ['passport_tool1'],
      skill_slugs: ['web-search', 'code-review'],
      mcp_servers: ['builtin:github'],
      autonomy_level: 'semi_autonomous',
      stop_conditions: [
        { type: 'max_steps', value: 100 },
        { type: 'max_cost_usd', value: 5.0 },
      ],
      guardrails: [
        { type: 'budget_limit', config: { max_usd: 10 } },
      ],
      memory_enabled: true,
      memory_provider: 'supabase',
      memory_window_size: 20,
      workflow_type: 'single',
      channels: [{ type: 'web', config: {} }],
      a2a_enabled: true,
      a2a_capabilities: ['research', 'code-review'],
    },
    wallet_config: {
      enabled: true,
      provider: 'crossmint',
      chains: ['solana-devnet'],
      spending_limits: {
        per_tx_usd: 1.0,
        daily_usd: 10.0,
      },
      auto_fund: false,
    },
    deployment_config: {
      target: { type: 'docker' },
      replicas: 1,
      restart_policy: 'on_failure',
      health_check_interval_ms: 30000,
    },
    monetization: {
      enabled: true,
      pricing_model: 'per_call',
      price_per_call_usd: 0.01,
      revenue_split: {
        creator: 80,
        compute: 10,
        protocol: 10,
      },
    },
    compliance: {
      audit_all_actions: true,
      require_human_approval: ['solana:transfer'],
      data_retention_days: 90,
      eu_ai_act_category: 'limited',
    },
  };

  it('should validate a complete agent descriptor', () => {
    const result = validateWithSchema('AgentDescriptor', validDescriptor);
    expect(result.ok).toBe(true);
  });

  it('should validate minimal agent descriptor', () => {
    const minimal: AgentDescriptor = {
      agent_config: {
        system_prompt: 'Hello',
        model_passport_id: 'passport_123',
        tool_passport_ids: [],
        skill_slugs: [],
        mcp_servers: [],
        autonomy_level: 'supervised',
        stop_conditions: [],
        guardrails: [],
        memory_enabled: false,
        memory_provider: 'supabase',
        memory_window_size: 10,
        workflow_type: 'single',
        channels: [],
        a2a_enabled: false,
      },
      deployment_config: {
        target: { type: 'docker' },
        restart_policy: 'never',
      },
    };
    const result = validateWithSchema('AgentDescriptor', minimal);
    expect(result.ok).toBe(true);
  });

  it('should reject missing system_prompt', () => {
    const invalid = {
      agent_config: {
        model_passport_id: 'passport_123',
      },
      deployment_config: {
        target: { type: 'docker' },
      },
    };
    const result = validateWithSchema('AgentDescriptor', invalid);
    expect(result.ok).toBe(false);
  });

  it('should reject missing deployment_config', () => {
    const invalid = {
      agent_config: {
        system_prompt: 'Hello',
        model_passport_id: 'passport_123',
      },
    };
    const result = validateWithSchema('AgentDescriptor', invalid);
    expect(result.ok).toBe(false);
  });

  it('should reject invalid autonomy_level', () => {
    const invalid = {
      agent_config: {
        system_prompt: 'Hello',
        model_passport_id: 'passport_123',
        autonomy_level: 'invalid_level',
      },
      deployment_config: {
        target: { type: 'docker' },
      },
    };
    const result = validateWithSchema('AgentDescriptor', invalid);
    expect(result.ok).toBe(false);
  });

  it('should reject invalid deployment target', () => {
    const invalid = {
      agent_config: {
        system_prompt: 'Hello',
        model_passport_id: 'passport_123',
      },
      deployment_config: {
        target: { type: 'invalid_target' },
      },
    };
    const result = validateWithSchema('AgentDescriptor', invalid);
    expect(result.ok).toBe(false);
  });

  it('should reject temperature out of range', () => {
    const invalid = {
      agent_config: {
        system_prompt: 'Hello',
        model_passport_id: 'passport_123',
        temperature: 3.0,
      },
      deployment_config: {
        target: { type: 'docker' },
      },
    };
    const result = validateWithSchema('AgentDescriptor', invalid);
    expect(result.ok).toBe(false);
  });

  it('should validate all deployment target types', () => {
    const targets = ['railway', 'akash', 'phala', 'ionet', 'vercel_edge', 'docker', 'aws_bedrock', 'self_hosted'];
    for (const target of targets) {
      const desc = {
        agent_config: {
          system_prompt: 'Hello',
          model_passport_id: 'passport_123',
        },
        deployment_config: {
          target: { type: target },
        },
      };
      const result = validateWithSchema('AgentDescriptor', desc);
      expect(result.ok).toBe(true);
    }
  });

  it('should validate all channel types', () => {
    const channelTypes = ['telegram', 'discord', 'whatsapp', 'slack', 'web', 'a2a', 'webhook'];
    const desc = {
      agent_config: {
        system_prompt: 'Hello',
        model_passport_id: 'passport_123',
        channels: channelTypes.map(type => ({ type, config: {} })),
      },
      deployment_config: {
        target: { type: 'docker' },
      },
    };
    const result = validateWithSchema('AgentDescriptor', desc);
    expect(result.ok).toBe(true);
  });

  it('should validate wallet config with all providers', () => {
    const providers = ['crossmint', 'erc6551', 'squads', 'custom'];
    for (const provider of providers) {
      const desc = {
        agent_config: {
          system_prompt: 'Hello',
          model_passport_id: 'passport_123',
        },
        wallet_config: {
          enabled: true,
          provider,
          chains: ['solana-devnet'],
        },
        deployment_config: {
          target: { type: 'docker' },
        },
      };
      const result = validateWithSchema('AgentDescriptor', desc);
      expect(result.ok).toBe(true);
    }
  });

  it('should validate monetization pricing models', () => {
    const models = ['free', 'per_call', 'subscription', 'token_gated'];
    for (const model of models) {
      const desc = {
        agent_config: {
          system_prompt: 'Hello',
          model_passport_id: 'passport_123',
        },
        deployment_config: {
          target: { type: 'docker' },
        },
        monetization: {
          enabled: true,
          pricing_model: model,
        },
      };
      const result = validateWithSchema('AgentDescriptor', desc);
      expect(result.ok).toBe(true);
    }
  });
});
