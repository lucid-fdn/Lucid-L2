// offchain/src/solana/gas.ts
import { ComputeBudgetProgram, TransactionInstruction, PublicKey } from '@solana/web3.js';
import { createBurnInstruction } from '@solana/spl-token';
import { 
  COMPUTE_UNITS, 
  LUCID_DECIMALS, 
  IGAS_PER_CALL, 
  MGAS_PER_ROOT, 
  IGAS_PER_BATCH 
} from '../../config/config';

export function makeComputeIx(): TransactionInstruction {
  return ComputeBudgetProgram.setComputeUnitLimit({
    units: COMPUTE_UNITS,
  });
}

export function makeBurnIx(
  type: 'iGas' | 'mGas',
  userAta: PublicKey,
  mint: PublicKey,
  authority: PublicKey,
  amount: number | bigint
): TransactionInstruction {
  // Amount should already be in token units (e.g., 1 = 1 LUCID token)
  // Convert to base units (multiply by 10^decimals)
  const amountInBaseUnits = BigInt(amount) * BigInt(Math.pow(10, LUCID_DECIMALS));
  
  return createBurnInstruction(
    userAta,
    mint,
    authority,
    amountInBaseUnits
  );
}

export function calculateGasCost(type: 'single' | 'batch', rootCount: number = 1): {
  iGas: number;
  mGas: number;
  total: number;
} {
  const iGas = type === 'single' ? IGAS_PER_CALL : IGAS_PER_BATCH;
  const mGas = rootCount * MGAS_PER_ROOT;
  const total = iGas + mGas;
  
  return { iGas, mGas, total };
}
