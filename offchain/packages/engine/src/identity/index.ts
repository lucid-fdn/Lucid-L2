// Identity — passport, NFT, wallet, shares, bridge, TBA, registries

// ─── Passport ───────────────────────────────────────────────────────────────
export { getPassportManager, resetPassportManager, PassportManager } from './passport/passportManager';
export type { CreatePassportInput, OperationResult, OnChainSyncHandler, ComputeAvailabilityChecker, ModelCatalogLookup } from './passport/passportManager';
export { getPassportSyncService, PassportSyncService } from './passport/passportSyncService';
export { getPassportService } from './passport/passportService';

// ─── NFT ────────────────────────────────────────────────────────────────────
export { getNFTProvider, getAllNFTProviders } from './nft';
export type { INFTProvider, MintResult, NFTMetadata } from './nft/INFTProvider';

// ─── Shares ─────────────────────────────────────────────────────────────────
export { getTokenLauncher } from './shares';
export type { ITokenLauncher, TokenLaunchResult, TokenLaunchParams, TokenInfo } from './shares/ITokenLauncher';

// ─── Wallet ─────────────────────────────────────────────────────────────────
export { getAgentWalletProvider } from './wallet';
export type { IAgentWalletProvider, AgentWallet, WalletBalance, TransactionRequest, TransactionResult, SpendingLimits } from './wallet/IAgentWalletProvider';

// ─── Bridge ─────────────────────────────────────────────────────────────────
export { getIdentityBridgeService, IdentityBridgeService } from './bridge/identityBridgeService';
export { validateCaip10, fromCaip10, isSolanaCaip10, isEvmCaip10 } from './bridge/caip10';

// ─── EVM Services ───────────────────────────────────────────────────────────
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

// ─── Projections (Solana Identity Registries) ─────────────────────────────
export { getIdentityRegistries, resetIdentityRegistryFactory, RegistryCapabilityError, buildRegistrationDocFromPassport } from './projections';
export type { ISolanaIdentityRegistry, RegistryCapabilities, RegistrationResult, ExternalIdentity, ERC8004RegistrationDoc } from './projections';
