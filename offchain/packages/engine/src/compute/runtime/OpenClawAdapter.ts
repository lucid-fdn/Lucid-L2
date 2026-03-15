// offchain/packages/engine/src/runtime/OpenClawAdapter.ts
// OpenClaw adapter — generates SKILL.md directory structure

import { IRuntimeAdapter, RuntimeArtifact } from './IRuntimeAdapter';

/**
 * OpenClaw Adapter
 *
 * Generates SKILL.md directory structure compatible with OpenClaw
 * and Claude Agent SDK's AgentSkills format.
 * Output: Pure markdown skills (no runtime code).
 */
export class OpenClawAdapter implements IRuntimeAdapter {
  readonly name = 'openclaw';
  readonly version = '1.0.0';
  readonly language = 'typescript' as const;

  canHandle(descriptor: any): boolean {
    // OpenClaw supports single agents with skills
    // Does not natively support multi-agent DAGs
    const workflow = descriptor?.agent_config?.workflow_type;
    return !workflow || workflow === 'single';
  }

  async generate(descriptor: any, passportId: string): Promise<RuntimeArtifact> {
    const config = descriptor.agent_config;
    const files = new Map<string, string>();

    // Generate main SKILL.md
    const envVars = this.collectEnvVars(config);
    const tools = this.collectTools(config);
    const guardrails = this.formatGuardrails(config.guardrails || []);

    files.set('SKILL.md', `---
name: ${passportId}
description: ${config.system_prompt.substring(0, 200).replace(/\n/g, ' ')}
metadata:
  lucid:
    passport_id: ${passportId}
    model: ${config.model_passport_id}
    autonomy_level: ${config.autonomy_level || 'supervised'}
    version: "1.0.0"
  openclaw:
    env:
${envVars.map((v: string) => `      - ${v}`).join('\n')}
    tools:
${tools.map((t: string) => `      - ${t}`).join('\n')}
    user-invocable: true
---

# ${passportId}

${config.system_prompt}

## Configuration

- **Model:** ${config.model_passport_id}
- **Temperature:** ${config.temperature || 0.7}
- **Max Tokens:** ${config.max_tokens || 4096}
- **Memory:** ${config.memory_enabled ? `Enabled (window: ${config.memory_window_size || 20})` : 'Disabled'}
- **Autonomy:** ${config.autonomy_level || 'supervised'}

## Available Tools

${(config.mcp_servers || []).map((s: string) => `- **${s}**: MCP server available via MCPGate`).join('\n')}
${(config.tool_passport_ids || []).map((t: string) => `- **${t}**: Registered tool passport`).join('\n')}
${(config.skill_slugs || []).map((s: string) => `- **${s}**: AgentSkill`).join('\n')}

## Tool Usage

When you need to use a tool, call it through the MCP gateway:
- All tools are accessible via MCPGate at \`$MCPGATE_URL\`
- Authenticate with \`$MCPGATE_API_KEY\`
- Use the tool name and provide required arguments

${guardrails ? `## Guardrails\n\n${guardrails}` : ''}

## Stop Conditions

${(config.stop_conditions || []).map((s: any) => `- **${s.type}:** ${s.value}`).join('\n') || '- max_steps: 50'}

${config.a2a_enabled ? `## Agent-to-Agent Communication

This agent supports the A2A protocol for inter-agent collaboration.
- Capabilities: ${(config.a2a_capabilities || []).join(', ')}
- Discovery: Available via \`/.well-known/agent.json\`
` : ''}
`);

    // Generate gateway config for OpenClaw
    files.set('config.json', JSON.stringify({
      agent: {
        name: passportId,
        model: config.model_passport_id,
        temperature: config.temperature || 0.7,
        maxTokens: config.max_tokens || 4096,
      },
      gateway: {
        trustgate_url: process.env.TRUSTGATE_URL || '',
        mcpgate_url: process.env.MCPGATE_URL || '',
      },
      memory: {
        enabled: config.memory_enabled,
        provider: config.memory_provider || 'supabase',
        windowSize: config.memory_window_size || 20,
      },
    }, null, 2));

    return {
      adapter: this.name,
      files,
      entrypoint: 'SKILL.md',
      dependencies: {},
      env_vars: {
        TRUSTGATE_URL: '',
        TRUSTGATE_API_KEY: '',
        MCPGATE_URL: '',
        MCPGATE_API_KEY: '',
      },
    };
  }

  private collectEnvVars(config: any): string[] {
    const vars = ['TRUSTGATE_API_KEY', 'MCPGATE_API_KEY'];
    if (config.memory_provider === 'redis') vars.push('REDIS_URL');
    return vars;
  }

  private collectTools(config: any): string[] {
    const tools: string[] = [];
    if (config.mcp_servers?.length > 0) tools.push('mcp');
    if (config.memory_enabled) tools.push('memory');
    if (config.channels?.some((c: any) => c.type === 'web')) tools.push('web');
    return tools;
  }

  private formatGuardrails(guardrails: any[]): string {
    if (guardrails.length === 0) return '';
    return guardrails.map((g: any) => {
      switch (g.type) {
        case 'input_filter': return `- **Input Filter:** Filter incoming messages before processing`;
        case 'output_filter': return `- **Output Filter:** Validate responses before sending`;
        case 'tool_approval': return `- **Tool Approval:** Require confirmation for tool calls`;
        case 'budget_limit': return `- **Budget Limit:** ${JSON.stringify(g.config)}`;
        case 'scope_restriction': return `- **Scope Restriction:** ${JSON.stringify(g.config)}`;
        default: return `- **${g.type}:** ${JSON.stringify(g.config)}`;
      }
    }).join('\n');
  }
}
