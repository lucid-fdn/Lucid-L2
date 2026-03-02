export { getIdentityBridgeService, IdentityBridgeService } from './identityBridgeService';
export { validateCaip10, fromCaip10, isSolanaCaip10, isEvmCaip10 } from './caip10';
export { getCrossChainBridgeService } from './crossChainBridgeService';
export { getTBAService } from './tbaService';
export { getERC7579Service, ERC7579Service } from './erc7579Service';
export { getPaymasterService, PaymasterService } from './paymasterService';

// Token Bound Accounts (ERC-6551)
export { ERC6551RegistryClient, ERC6551_REGISTRY_ADDRESS } from './tba/evm-registry-client';

// On-chain registries (ERC-8004)
export { IdentityRegistryClient } from './registries/evm-identity';
export { ValidationRegistryClient } from './registries/evm-validation';
export { ReputationRegistryClient } from './registries/evm-reputation';
export * from './registries/types';
