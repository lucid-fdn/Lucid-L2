/**
 * Build a default AgentDescriptor from minimal inputs.
 * Reusable by CLI, API routes, SDK, and tests.
 */
export function buildAgentDescriptor(options: {
  prompt: string;
  model: string;
  target?: string;
  gpu?: string;
  tools?: string[];
  shareToken?: string;
  shareSupply?: string;
}) {
  return {
    agent_config: {
      system_prompt: options.prompt,
      model_passport_id: options.model,
      tool_passport_ids: options.tools || [],
      skill_slugs: [],
      mcp_servers: [],
      autonomy_level: 'supervised' as const,
      stop_conditions: [{ type: 'max_steps' as const, value: 50 }],
      guardrails: [],
      memory_enabled: true,
      memory_provider: 'supabase' as const,
      memory_window_size: 20,
      workflow_type: 'single' as const,
      channels: [],
      a2a_enabled: false,
    },
    deployment_config: {
      target: { type: options.target || 'docker', ...(options.gpu ? { gpu: options.gpu } : {}) },
      restart_policy: 'on_failure' as const,
    },
    monetization: options.shareToken ? {
      enabled: true,
      pricing_model: 'per_call' as const,
      share_token: {
        symbol: options.shareToken,
        total_supply: parseInt(options.shareSupply || '1000000'),
        auto_launch: true,
      },
    } : undefined,
  };
}
