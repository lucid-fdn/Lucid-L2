export type {
  ISolanaIdentityRegistry,
  RegistryCapabilities,
  RegistrationOptions,
  RegistrationResult,
  ExternalIdentity,
} from './ISolanaIdentityRegistry';
export { RegistryCapabilityError } from './ISolanaIdentityRegistry';
export { getIdentityRegistries, resetIdentityRegistryFactory } from './factory';
export { buildRegistrationDocFromPassport } from './registration-doc/buildRegistrationDoc';
export type { ERC8004RegistrationDoc } from './registration-doc/types';
