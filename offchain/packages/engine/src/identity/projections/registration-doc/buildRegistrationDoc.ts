import type { Passport } from '../../stores/passportStore';
import type { ERC8004RegistrationDoc } from './types';

const CAPABILITY_MAP: Record<string, string[]> = {
  agent: ['autonomous'],
  model: ['inference'],
  tool: ['integration'],
  compute: ['execution'],
  dataset: ['data'],
};

export interface BuildRegistrationDocOptions {
  agentRegistry?: string;
}

export function buildRegistrationDocFromPassport(
  passport: Passport,
  options?: BuildRegistrationDocOptions,
): ERC8004RegistrationDoc {
  const endpoints = passport.metadata?.endpoints as Record<string, any> | undefined;
  const services = endpoints
    ? Object.entries(endpoints).map(([name, val]) => ({
        name,
        endpoint: typeof val === 'string' ? val : val?.url ?? '',
      }))
    : [];

  const registrations = passport.nft_mint
    ? [{ agentId: passport.nft_mint, agentRegistry: options?.agentRegistry ?? 'solana:101:metaplex' }]
    : [];

  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: passport.name ?? passport.metadata?.name ?? passport.passport_id,
    description: passport.description ?? passport.metadata?.description ?? '',
    capabilities: CAPABILITY_MAP[passport.type] ?? [],
    services,
    registrations,
    supportedTrust: ['reputation'],
    active: passport.status === 'active',
  };
}
