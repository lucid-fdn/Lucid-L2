// offchain/src/jobs/revenueAirdrop.ts
// Off-chain revenue distribution — snapshot token holders, airdrop proportionally

import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { getSolanaKeypair } from '../../chain/solana/keypair';
import { getChainConfig } from '../../chains/configs';
import { logger } from '../../lib/logger';

export interface AirdropResult {
  passportId: string;
  tokenMint: string;
  totalDistributed: number;
  holders: number;
  distributions: Array<{
    holder: string;
    balance: number;
    share: number;
    amountLamports: number;
  }>;
  txSignatures: string[];
}

/**
 * Run revenue airdrop for a passport's share token holders.
 *
 * Flow:
 * 1. Get the passport's share token mint
 * 2. Get all token holders + balances via getTokenLargestAccounts
 * 3. Calculate proportional share: (holderBalance / totalSupply) * undistributed
 * 4. Batch SOL transfers to each holder
 *
 * @param passportId - Optional: specific passport to airdrop for
 * @param amountLamports - Amount of SOL (in lamports) to distribute
 */
export async function runRevenueAirdrop(
  passportId: string,
  tokenMint: string,
  amountLamports: number,
): Promise<AirdropResult> {
  // Get connection config from centralized chain config
  const chainId = process.env.SOLANA_CHAIN_ID || 'solana-devnet';
  const config = getChainConfig(chainId);
  const rpcUrl = config?.rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  if (!process.env.LUCID_ORCHESTRATOR_SECRET_KEY) {
    throw new Error('LUCID_ORCHESTRATOR_SECRET_KEY required for airdrop');
  }
  const payer = getSolanaKeypair('LUCID_ORCHESTRATOR_SECRET_KEY');

  const mintPubkey = new PublicKey(tokenMint);

  // Get all token holders
  const largestAccounts = await connection.getTokenLargestAccounts(mintPubkey, 'confirmed');

  // Filter out zero-balance accounts
  const holders = largestAccounts.value.filter(a => a.uiAmount && a.uiAmount > 0);
  if (holders.length === 0) {
    return {
      passportId,
      tokenMint,
      totalDistributed: 0,
      holders: 0,
      distributions: [],
      txSignatures: [],
    };
  }

  // Calculate total supply from holder balances
  const totalBalance = holders.reduce((sum, h) => sum + (h.uiAmount || 0), 0);

  // Calculate proportional distributions
  const distributions = holders.map(h => {
    const balance = h.uiAmount || 0;
    const share = balance / totalBalance;
    const amount = Math.floor(amountLamports * share);
    return {
      holder: h.address.toBase58(),
      balance,
      share,
      amountLamports: amount,
    };
  }).filter(d => d.amountLamports > 0);

  // Resolve token account owners (we need wallet addresses for SOL transfers)
  const txSignatures: string[] = [];
  const { getAccount } = require('@solana/spl-token');

  // Batch into transactions (max ~20 transfers per tx)
  const BATCH_SIZE = 20;
  for (let i = 0; i < distributions.length; i += BATCH_SIZE) {
    const batch = distributions.slice(i, i + BATCH_SIZE);
    const tx = new Transaction();

    for (const dist of batch) {
      // Resolve the token account to find the wallet owner
      try {
        const tokenAccountPubkey = new PublicKey(dist.holder);
        const accountInfo = await getAccount(
          connection, tokenAccountPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID,
        );
        const ownerWallet = accountInfo.owner;

        tx.add(SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: ownerWallet,
          lamports: dist.amountLamports,
        }));
      } catch (err) {
        logger.warn(`[Airdrop] Failed to resolve holder ${dist.holder}:`, err instanceof Error ? err.message : err);
      }
    }

    if (tx.instructions.length > 0) {
      const sig = await connection.sendTransaction(tx, [payer]);
      await connection.confirmTransaction(sig, 'confirmed');
      txSignatures.push(sig);
    }
  }

  const totalDistributed = distributions.reduce((sum, d) => sum + d.amountLamports, 0);

  logger.info(`[Airdrop] Distributed ${totalDistributed} lamports to ${distributions.length} holders for ${passportId}`);

  return {
    passportId,
    tokenMint,
    totalDistributed,
    holders: distributions.length,
    distributions,
    txSignatures,
  };
}
