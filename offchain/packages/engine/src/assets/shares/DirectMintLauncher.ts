// offchain/src/shares/DirectMintLauncher.ts
// Direct SPL token creation — mints total supply to owner

import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
} from '@solana/spl-token';
import { ITokenLauncher, TokenLaunchResult, TokenLaunchParams, TokenInfo } from './ITokenLauncher';
import { getSolanaKeypair } from '../../chain/solana/keypair';

// In-memory registry of launched tokens (passport_id -> mint)
const tokenRegistry = new Map<string, TokenInfo>();

export class DirectMintLauncher implements ITokenLauncher {
  readonly providerName = 'direct-mint';
  private connection: Connection;

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  private getPayer(): Keypair {
    if (!process.env.LUCID_ORCHESTRATOR_SECRET_KEY) {
      throw new Error('LUCID_ORCHESTRATOR_SECRET_KEY required for token launch');
    }
    return getSolanaKeypair('LUCID_ORCHESTRATOR_SECRET_KEY');
  }

  async launchToken(params: TokenLaunchParams): Promise<TokenLaunchResult> {
    const payer = this.getPayer();
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;
    const decimals = params.decimals ?? 6;
    const ownerPubkey = new PublicKey(params.owner);

    // Calculate supply in base units
    const supplyBaseUnits = BigInt(params.totalSupply) * BigInt(10 ** decimals);

    // Get mint space
    const mintLen = getMintLen([]);
    const lamports = await this.connection.getMinimumBalanceForRentExemption(mintLen);

    // ATA for the owner
    const ata = getAssociatedTokenAddressSync(mint, ownerPubkey, false, TOKEN_2022_PROGRAM_ID);

    const tx = new Transaction();

    // 1. Create mint account
    tx.add(SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }));

    // 2. Initialize mint
    tx.add(createInitializeMintInstruction(
      mint, decimals, payer.publicKey, null, TOKEN_2022_PROGRAM_ID,
    ));

    // 3. Create ATA for owner
    tx.add(createAssociatedTokenAccountInstruction(
      payer.publicKey, ata, ownerPubkey, mint, TOKEN_2022_PROGRAM_ID,
    ));

    // 4. Mint total supply to owner
    tx.add(createMintToInstruction(
      mint, ata, payer.publicKey, supplyBaseUnits, [], TOKEN_2022_PROGRAM_ID,
    ));

    const txSignature = await this.connection.sendTransaction(tx, [payer, mintKeypair]);
    await this.connection.confirmTransaction(txSignature, 'confirmed');

    const info: TokenInfo = {
      mint: mint.toBase58(),
      passportId: params.passportId,
      name: params.name,
      symbol: params.symbol,
      totalSupply: params.totalSupply,
      decimals,
    };
    tokenRegistry.set(params.passportId, info);

    return {
      mint: mint.toBase58(),
      txSignature,
      totalSupply: params.totalSupply,
      provider: this.providerName,
    };
  }

  async getTokenInfo(passportId: string): Promise<TokenInfo | null> {
    return tokenRegistry.get(passportId) || null;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.connection.getLatestBlockhash();
      return true;
    } catch {
      return false;
    }
  }
}
