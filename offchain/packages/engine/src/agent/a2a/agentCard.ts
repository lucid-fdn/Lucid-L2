/**
 * A2A Agent Card Generator
 *
 * Generates Agent Cards (JSON manifests) from Passport metadata.
 * Agent Cards enable discovery and capability negotiation per the A2A protocol.
 * Spec: https://github.com/a2aproject/A2A
 */

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: string[];
  authentication: {
    type: 'bearer' | 'oauth2' | 'none';
    config?: Record<string, unknown>;
  };
  skills: AgentCardSkill[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
  provider?: {
    organization: string;
    url?: string;
  };
}

export interface AgentCardSkill {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/**
 * Generate an A2A Agent Card from a passport and agent descriptor.
 */
export function generateAgentCard(
  passportId: string,
  descriptor: any,
  agentUrl: string
): AgentCard {
  const config = descriptor.agent_config || {};

  const skills: AgentCardSkill[] = [];

  // Map MCP servers to skills
  for (const server of config.mcp_servers || []) {
    skills.push({
      name: server,
      description: `MCP tools from ${server}`,
    });
  }

  // Map skill slugs to skills
  for (const slug of config.skill_slugs || []) {
    skills.push({
      name: slug,
      description: `AgentSkill: ${slug}`,
    });
  }

  // Add a default "chat" skill if no specific skills
  if (skills.length === 0) {
    skills.push({
      name: 'chat',
      description: 'General conversation and task execution',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'User message' },
        },
        required: ['text'],
      },
    });
  }

  return {
    name: passportId,
    description: (config.system_prompt || '').substring(0, 500),
    url: agentUrl,
    version: '1.0.0',
    capabilities: config.a2a_capabilities || [],
    authentication: {
      type: 'bearer',
    },
    skills,
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    provider: {
      organization: 'Lucid',
      url: 'https://lucidlayer.ai',
    },
  };
}

/**
 * Validate an incoming Agent Card from an external agent.
 */
export function validateAgentCard(card: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!card.name) errors.push('Missing name');
  if (!card.url) errors.push('Missing url');
  if (!card.version) errors.push('Missing version');
  if (!Array.isArray(card.skills)) errors.push('Missing or invalid skills array');
  if (!Array.isArray(card.defaultInputModes)) errors.push('Missing defaultInputModes');
  if (!Array.isArray(card.defaultOutputModes)) errors.push('Missing defaultOutputModes');

  return { valid: errors.length === 0, errors };
}
