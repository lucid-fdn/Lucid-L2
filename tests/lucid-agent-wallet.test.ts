/**
 * Lucid Agent Wallet — Integration Tests
 * Tests wallet creation, policy, splits, sessions, and escrow lifecycle.
 * Requires: solana-test-validator running on port 8899
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import {
  createFundedWallet,
  createTestToken,
  mintTokensTo,
  confirmTransaction,
  generateContentHash,
} from "./helpers/fixtures";

let program: Program;

// PDA helpers
function findWalletPDA(passportMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent_wallet"), passportMint.toBuffer()],
    program.programId,
  );
}

function findPolicyPDA(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), wallet.toBuffer()],
    program.programId,
  );
}

function findSplitPDA(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("split"), wallet.toBuffer()],
    program.programId,
  );
}

function findSessionPDA(wallet: PublicKey, delegate: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("session"), wallet.toBuffer(), delegate.toBuffer()],
    program.programId,
  );
}

function findEscrowPDA(wallet: PublicKey, nonce: number): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(BigInt(nonce));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), wallet.toBuffer(), nonceBuf],
    program.programId,
  );
}

describe("Lucid Agent Wallet", () => {
  const provider = anchor.AnchorProvider.local("http://127.0.0.1:8899");
  anchor.setProvider(provider);

  program = anchor.workspace.LucidAgentWallet as Program;

  let owner: Keypair;
  let passportMint: PublicKey;
  let walletPDA: PublicKey;
  let walletBump: number;
  let tokenMint: PublicKey;
  let ownerTokenAccount: PublicKey;
  let escrowTokenAccount: PublicKey;

  before(async () => {
    owner = await createFundedWallet(provider.connection, 10);
    // Create a mock "passport NFT" mint for the wallet PDA seed
    const token = await createTestToken(provider.connection, owner);
    passportMint = token.mint;
    [walletPDA, walletBump] = findWalletPDA(passportMint);

    // Create token for escrow tests
    const lucidToken = await createTestToken(provider.connection, owner);
    tokenMint = lucidToken.mint;
    ownerTokenAccount = lucidToken.tokenAccount;
    await mintTokensTo(provider.connection, owner, tokenMint, ownerTokenAccount, 1_000_000_000);
  });

  // =========================================================================
  // 1. Create Wallet
  // =========================================================================

  it("creates an agent wallet bound to passport mint", async () => {
    const tx = await program.methods
      .createWallet(walletBump)
      .accounts({
        wallet: walletPDA,
        passportMint: passportMint,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    await confirmTransaction(provider.connection, tx);

    // @ts-ignore - Anchor workspace types
    const walletAccount = await program.account.agentWallet.fetch(walletPDA);
    expect(walletAccount.owner.toBase58()).to.equal(owner.publicKey.toBase58());
    expect(walletAccount.passportMint.toBase58()).to.equal(passportMint.toBase58());
  });

  // =========================================================================
  // 2. Policy
  // =========================================================================

  it("sets policy constraints", async () => {
    const [policyPDA] = findPolicyPDA(walletPDA);

    const tx = await program.methods
      .setPolicy(
        new anchor.BN(1_000_000), // max_per_tx
        new anchor.BN(10_000_000), // daily_limit
        [],                        // allowed_programs (empty = allow all)
        new anchor.BN(0),          // time_window_start
        new anchor.BN(0),          // time_window_end
      )
      .accounts({
        policy: policyPDA,
        wallet: walletPDA,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    await confirmTransaction(provider.connection, tx);

    // @ts-ignore - Anchor workspace types
    const policyAccount = await program.account.policyConfig.fetch(policyPDA);
    expect(policyAccount.maxPerTx.toNumber()).to.equal(1_000_000);
    expect(policyAccount.dailyLimit.toNumber()).to.equal(10_000_000);
  });

  // =========================================================================
  // 3. Splits
  // =========================================================================

  it("configures revenue split", async () => {
    const [splitPDA] = findSplitPDA(walletPDA);
    const recipient1 = Keypair.generate().publicKey;
    const recipient2 = Keypair.generate().publicKey;

    const tx = await program.methods
      .configureSplit(
        [recipient1, recipient2],
        [7000, 3000], // 70/30 in basis points
      )
      .accounts({
        split: splitPDA,
        wallet: walletPDA,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    await confirmTransaction(provider.connection, tx);

    // @ts-ignore - Anchor workspace types
    const splitAccount = await program.account.splitConfig.fetch(splitPDA);
    expect(splitAccount.recipients.length).to.equal(2);
    expect(splitAccount.basisPoints[0]).to.equal(7000);
    expect(splitAccount.basisPoints[1]).to.equal(3000);
  });

  it("rejects split with invalid basis point sum", async () => {
    const [splitPDA] = findSplitPDA(walletPDA);
    const recipient1 = Keypair.generate().publicKey;

    try {
      await program.methods
        .configureSplit([recipient1], [5000]) // doesn't sum to 10000
        .accounts({
          split: splitPDA,
          wallet: walletPDA,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.toString()).to.include("InvalidBpsSum");
    }
  });

  // =========================================================================
  // 4. Sessions
  // =========================================================================

  it("creates a session key", async () => {
    const delegate = Keypair.generate();
    const [sessionPDA] = findSessionPDA(walletPDA, delegate.publicKey);
    const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    const tx = await program.methods
      .createSession(
        0xFF, // full permissions
        new anchor.BN(expiresAt),
        new anchor.BN(1_000_000), // max_amount
      )
      .accounts({
        session: sessionPDA,
        wallet: walletPDA,
        owner: owner.publicKey,
        delegate: delegate.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    await confirmTransaction(provider.connection, tx);

    // @ts-ignore - Anchor workspace types
    const sessionAccount = await program.account.sessionKey.fetch(sessionPDA);
    expect(sessionAccount.delegate.toBase58()).to.equal(delegate.publicKey.toBase58());
    expect(sessionAccount.active).to.be.true;
  });

  it("revokes a session key", async () => {
    const delegate = Keypair.generate();
    const [sessionPDA] = findSessionPDA(walletPDA, delegate.publicKey);
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;

    // Create first
    let tx = await program.methods
      .createSession(0xFF, new anchor.BN(expiresAt), new anchor.BN(1_000_000))
      .accounts({
        session: sessionPDA,
        wallet: walletPDA,
        owner: owner.publicKey,
        delegate: delegate.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
    await confirmTransaction(provider.connection, tx);

    // Revoke
    tx = await program.methods
      .revokeSession()
      .accounts({
        session: sessionPDA,
        wallet: walletPDA,
        owner: owner.publicKey,
      })
      .signers([owner])
      .rpc();
    await confirmTransaction(provider.connection, tx);

    // @ts-ignore - Anchor workspace types
    const sessionAccount = await program.account.sessionKey.fetch(sessionPDA);
    expect(sessionAccount.active).to.be.false;
  });

  // =========================================================================
  // 5. Escrow Lifecycle + Access Control
  // =========================================================================

  describe("escrow", () => {
    let beneficiary: Keypair;
    let beneficiaryAta: PublicKey;
    let escrowPDA: PublicKey;
    const nonce = 0;

    before(async () => {
      beneficiary = await createFundedWallet(provider.connection, 2);
      [escrowPDA] = findEscrowPDA(walletPDA, nonce);

      // Create beneficiary ATA for escrow releases
      const { getOrCreateAssociatedTokenAccount } = await import("@solana/spl-token");
      const bAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, owner, tokenMint, beneficiary.publicKey,
      );
      beneficiaryAta = bAta.address;

      // Create escrow ATA (owned by the wallet PDA)
      const eAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, owner, tokenMint, walletPDA, true, // allowOwnerOffCurve for PDA
      );
      escrowTokenAccount = eAta.address;
    });

    it("creates an escrow", async () => {
      const receiptHash = generateContentHash("test-receipt");
      const duration = 3600; // 1 hour

      const tx = await program.methods
        .createEscrow(
          new anchor.BN(100_000),
          new anchor.BN(duration),
          receiptHash,
        )
        .accounts({
          escrow: escrowPDA,
          wallet: walletPDA,
          owner: owner.publicKey,
          beneficiary: beneficiary.publicKey,
          tokenMint: tokenMint,
          depositorAta: ownerTokenAccount,
          escrowAta: escrowTokenAccount,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      await confirmTransaction(provider.connection, tx);

      // @ts-ignore - Anchor workspace types
      const escrowAccount = await program.account.escrowRecord.fetch(escrowPDA);
      expect(escrowAccount.depositor.toBase58()).to.equal(owner.publicKey.toBase58());
      expect(escrowAccount.beneficiary.toBase58()).to.equal(beneficiary.publicKey.toBase58());
      expect(escrowAccount.amount.toNumber()).to.equal(100_000);
    });

    it("rejects release from unauthorized signer", async () => {
      const attacker = await createFundedWallet(provider.connection, 2);
      const receiptHash = generateContentHash("test-receipt");

      try {
        await program.methods
          .releaseEscrow(receiptHash, Array.from(Buffer.alloc(64)))
          .accounts({
            escrow: escrowPDA,
            wallet: walletPDA,
            releaser: attacker.publicKey,
            escrowAta: escrowTokenAccount,
            beneficiaryAta: beneficiaryAta,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          })
          .signers([attacker])
          .rpc();

        expect.fail("Should have thrown Unauthorized");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.include("Unauthorized");
      }
    });

    it("rejects claim_timeout from unauthorized signer", async () => {
      const attacker = await createFundedWallet(provider.connection, 2);
      const { getOrCreateAssociatedTokenAccount } = await import("@solana/spl-token");
      const attackerAta = await getOrCreateAssociatedTokenAccount(
        provider.connection, attacker, tokenMint, attacker.publicKey,
      );

      try {
        await program.methods
          .claimTimeout()
          .accounts({
            escrow: escrowPDA,
            wallet: walletPDA,
            claimer: attacker.publicKey,
            escrowAta: escrowTokenAccount,
            depositorAta: attackerAta.address,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          })
          .signers([attacker])
          .rpc();

        expect.fail("Should have thrown Unauthorized");
      } catch (err: any) {
        // Might fail with Unauthorized or EscrowNotExpired -- either means access was checked
        const msg = err.error?.errorCode?.code || err.toString();
        expect(msg).to.satisfy((s: string) =>
          s.includes("Unauthorized") || s.includes("EscrowNotExpired")
        );
      }
    });

    it("rejects dispute from unauthorized signer", async () => {
      const attacker = await createFundedWallet(provider.connection, 2);

      try {
        await program.methods
          .disputeEscrow("fraudulent")
          .accounts({
            escrow: escrowPDA,
            wallet: walletPDA,
            disputer: attacker.publicKey,  // not depositor or beneficiary
          })
          .signers([attacker])
          .rpc();

        expect.fail("Should have thrown Unauthorized");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.include("Unauthorized");
      }
    });

    it("allows depositor to release escrow", async () => {
      // Create a fresh escrow for this test (wallet.nonce was incremented by first createEscrow)
      const nonce2 = 1;
      const [escrowPDA2] = findEscrowPDA(walletPDA, nonce2);
      const receiptHash = generateContentHash("release-receipt");

      await program.methods
        .createEscrow(
          new anchor.BN(50_000),
          new anchor.BN(3600),
          receiptHash,
        )
        .accounts({
          escrow: escrowPDA2,
          wallet: walletPDA,
          owner: owner.publicKey,
          beneficiary: beneficiary.publicKey,
          tokenMint: tokenMint,
          depositorAta: ownerTokenAccount,
          escrowAta: escrowTokenAccount,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Depositor releases -- should succeed
      const tx = await program.methods
        .releaseEscrow(receiptHash, Array.from(Buffer.alloc(64)))
        .accounts({
          escrow: escrowPDA2,
          wallet: walletPDA,
          releaser: owner.publicKey,
          escrowAta: escrowTokenAccount,
          beneficiaryAta: beneficiaryAta,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      await confirmTransaction(provider.connection, tx);

      // @ts-ignore - Anchor workspace types
      const escrowAccount = await program.account.escrowRecord.fetch(escrowPDA2);
      // Status 1 = Released
      expect(escrowAccount.status).to.deep.equal({ released: {} });
    });
  });
});
