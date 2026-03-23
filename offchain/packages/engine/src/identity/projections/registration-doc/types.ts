import type { ERC8004AgentMetadata } from '../../registries/types';

export interface ERC8004RegistrationDoc extends ERC8004AgentMetadata {
  type: string;
  services?: Array<{ name: string; endpoint: string; version?: string; skills?: string[]; domains?: string[] }>;
  registrations?: Array<{ agentId: string; agentRegistry: string }>;
  supportedTrust?: string[];
  active?: boolean;
}
