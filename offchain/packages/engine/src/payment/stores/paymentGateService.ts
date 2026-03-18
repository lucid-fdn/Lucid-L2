// services/paymentGateService.ts
// Off-chain wrapper for on-chain payment gate operations

import { Connection, PublicKey, Keypair, Commitment, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, setProvider, Idl } from '@coral-xyz/anchor';
import * as fs from 'fs';
import path from 'path';
import { PATHS } from '../../shared/config/paths';
import { getSolanaKeypair } from '../../shared/chains/solana/keypair';
import { logger } from '../../shared/lib/logger';

const PASSPORT_PROGRAM_ID = process.env.PASSPORT_PROGRAM_ID || 'FhoemNdqwPMt8nmX4HT3WpSqUuqeAUXRb7WchAehmSaL';

/**
 * PaymentGateService — wraps on-chain payment gate instructions
 */
export class PaymentGateService {
    private connection: Connection;
    private provider: AnchorProvider;
    private program: Program | null = null;
    private programId: PublicKey;
    private wallet: Wallet;
    private initialized: boolean = false;

    constructor(options?: {
        rpcUrl?: string;
        commitment?: Commitment;
        programId?: string;
    }) {
        const rpcUrl = options?.rpcUrl ||
                       process.env.QUICKNODE_RPC_URL ||
                       process.env.RPC_URL ||
                       'https://api.devnet.solana.com';
        const commitment = options?.commitment || 'confirmed';
        const programIdStr = options?.programId || PASSPORT_PROGRAM_ID;

        this.connection = new Connection(rpcUrl, commitment);
        this.programId = new PublicKey(programIdStr);
        this.wallet = new Wallet(this.getKeypair());
        this.provider = new AnchorProvider(this.connection, this.wallet, { commitment });
        setProvider(this.provider);
    }

    private getKeypair(): Keypair {
        try {
            return getSolanaKeypair();
        } catch {
            // Last resort: generate new keypair (for testing only)
            return Keypair.generate();
        }
    }

    async init(): Promise<void> {
        if (this.initialized) return;

        const idlPath = path.join(PATHS.IDL_DIR, 'lucid_passports.json');
        if (!fs.existsSync(idlPath)) {
            throw new Error(`IDL not found at ${idlPath}. Run 'anchor build -p lucid_passports' first.`);
        }

        const idlJson = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
        if (!idlJson.metadata) idlJson.metadata = {};
        idlJson.metadata.address = this.programId.toString();

        this.program = new Program(idlJson as Idl, this.provider);
        this.initialized = true;
    }

    /**
     * Derive PaymentGate PDA
     */
    derivePaymentGatePDA(passportPDA: PublicKey): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [Buffer.from('payment_gate'), passportPDA.toBuffer()],
            this.programId
        );
    }

    /**
     * Derive vault PDA
     */
    deriveVaultPDA(passportPDA: PublicKey): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [Buffer.from('vault'), passportPDA.toBuffer()],
            this.programId
        );
    }

    /**
     * Derive AccessReceipt PDA
     */
    deriveAccessReceiptPDA(passportPDA: PublicKey, payer: PublicKey): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [Buffer.from('access_receipt'), passportPDA.toBuffer(), payer.toBuffer()],
            this.programId
        );
    }

    /**
     * Set payment gate on a passport
     */
    async setPaymentGate(
        passportPDA: string,
        priceLamports: number,
        priceLucid: number,
        paymentTokenMint?: string
    ): Promise<string> {
        await this.init();
        if (!this.program) throw new Error('Program not initialized');

        const passportPubkey = new PublicKey(passportPDA);
        const mint = paymentTokenMint
            ? new PublicKey(paymentTokenMint)
            : SystemProgram.programId; // SystemProgram = SOL-only

        const [paymentGatePDA] = this.derivePaymentGatePDA(passportPubkey);
        const [vaultPDA] = this.deriveVaultPDA(passportPubkey);

        const tx = await this.program.methods
            .setPaymentGate(
                BigInt(priceLamports) as any,
                BigInt(priceLucid) as any,
                mint
            )
            .accounts({
                paymentGate: paymentGatePDA,
                passport: passportPubkey,
                vault: vaultPDA,
                owner: this.wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        logger.info(`Payment gate set on ${passportPDA}: ${tx}`);
        return tx;
    }

    /**
     * Pay for access to a gated passport
     */
    async payForAccess(
        passportPDA: string,
        payerKeypair?: Keypair,
        expiresAt: number = 0
    ): Promise<string> {
        await this.init();
        if (!this.program) throw new Error('Program not initialized');

        const passportPubkey = new PublicKey(passportPDA);
        const payer = payerKeypair || this.getKeypair();

        const [paymentGatePDA] = this.derivePaymentGatePDA(passportPubkey);
        const [vaultPDA] = this.deriveVaultPDA(passportPubkey);
        const [accessReceiptPDA] = this.deriveAccessReceiptPDA(passportPubkey, payer.publicKey);

        const tx = await this.program.methods
            .payForAccess(BigInt(expiresAt) as any)
            .accounts({
                accessReceipt: accessReceiptPDA,
                paymentGate: paymentGatePDA,
                passport: passportPubkey,
                vault: vaultPDA,
                payer: payer.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([payer])
            .rpc();

        logger.info(`Access purchased for ${passportPDA}: ${tx}`);
        return tx;
    }

    /**
     * Check if a user has access to a passport
     */
    async checkAccess(passportPDA: string, payerPubkey: string): Promise<boolean> {
        await this.init();

        const passportPubkeyObj = new PublicKey(passportPDA);
        const payerPubkeyObj = new PublicKey(payerPubkey);

        const [accessReceiptPDA] = this.deriveAccessReceiptPDA(passportPubkeyObj, payerPubkeyObj);

        try {
            const account = await this.connection.getAccountInfo(accessReceiptPDA);
            if (!account) return false;

            // Fetch and check expiry
            const receipt = await (this.program!.account as any).accessReceipt.fetch(accessReceiptPDA);
            if (receipt.expiresAt.toNumber() === 0) return true; // Permanent access
            return receipt.expiresAt.toNumber() > Math.floor(Date.now() / 1000);
        } catch {
            return false;
        }
    }

    /**
     * Withdraw revenue from vault (owner only)
     */
    async withdrawRevenue(passportPDA: string, amount?: number): Promise<string> {
        await this.init();
        if (!this.program) throw new Error('Program not initialized');

        const passportPubkey = new PublicKey(passportPDA);
        const [paymentGatePDA] = this.derivePaymentGatePDA(passportPubkey);
        const [vaultPDA] = this.deriveVaultPDA(passportPubkey);

        // If no amount specified, withdraw all
        let withdrawAmount = amount;
        if (!withdrawAmount) {
            const vaultBalance = await this.connection.getBalance(vaultPDA);
            // Leave rent-exempt minimum
            const rentExempt = await this.connection.getMinimumBalanceForRentExemption(0);
            withdrawAmount = Math.max(0, vaultBalance - rentExempt);
        }

        const tx = await this.program.methods
            .withdrawRevenue(BigInt(withdrawAmount) as any)
            .accounts({
                paymentGate: paymentGatePDA,
                passport: passportPubkey,
                vault: vaultPDA,
                owner: this.wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        logger.info(`Revenue withdrawn from ${passportPDA}: ${withdrawAmount} lamports, tx: ${tx}`);
        return tx;
    }

    /**
     * Get payment gate info for a passport
     */
    async getPaymentGateInfo(passportPDA: string): Promise<any | null> {
        await this.init();
        if (!this.program) return null;

        const passportPubkey = new PublicKey(passportPDA);
        const [paymentGatePDA] = this.derivePaymentGatePDA(passportPubkey);

        try {
            return await (this.program.account as any).paymentGate.fetch(paymentGatePDA);
        } catch {
            return null;
        }
    }
}

// Singleton
let paymentGateServiceInstance: PaymentGateService | null = null;

export function getPaymentGateService(options?: {
    rpcUrl?: string;
    commitment?: Commitment;
    programId?: string;
}): PaymentGateService {
    if (!paymentGateServiceInstance) {
        paymentGateServiceInstance = new PaymentGateService(options);
    }
    return paymentGateServiceInstance;
}
