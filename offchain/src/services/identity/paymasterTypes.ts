/**
 * Paymaster Types
 *
 * TypeScript types for ERC-4337 Paymaster ($LUCID as gas).
 */

export interface UserOperation {
  sender: string;
  nonce: string;
  initCode: string;
  callData: string;
  accountGasLimits: string;
  preVerificationGas: string;
  gasFees: string;
  paymasterAndData: string;
  signature: string;
}

export interface PaymasterConfig {
  entryPoint: string;
  paymasterAddress: string;
  lucidPerEth: string; // Exchange rate (18 decimals)
  maxCostLucid: string;
}

export interface GasEstimate {
  ethCost: string; // wei
  lucidCost: string; // $LUCID (9 decimals)
  exchangeRate: string; // LUCID per ETH
}

export interface SponsoredUserOp {
  userOp: UserOperation;
  paymasterAndData: string;
  estimatedLucidCost: string;
}
