/**
 * Gas Utils — Integration Tests
 * Tests token collection, burning, splitting, and the mint_and_distribute stub.
 * Requires: solana-test-validator running on port 8899
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { expect } from "chai";
import {
  createFundedWallet,
  createTestToken,
  mintTokensTo,
  confirmTransaction,
} from "./helpers/fixtures";

let program: Program;

describe("Gas Utils", () => {
  const provider = anchor.AnchorProvider.local("http://127.0.0.1:8899");
  anchor.setProvider(provider);

  program = anchor.workspace.GasUtils as Program;

  let payer: Keypair;
  let lucidMint: PublicKey;
  let payerAta: PublicKey;
  let recipient1: Keypair;
  let recipient2: Keypair;
  let recipient1Ata: PublicKey;
  let recipient2Ata: PublicKey;

  before(async () => {
    payer = await createFundedWallet(provider.connection, 10);

    // Create a "LUCID" test token
    const token = await createTestToken(provider.connection, payer);
    lucidMint = token.mint;
    payerAta = token.tokenAccount;

    // Mint tokens to payer
    await mintTokensTo(provider.connection, payer, lucidMint, payerAta, 10_000_000_000);

    // Create recipient wallets and ATAs
    recipient1 = await createFundedWallet(provider.connection, 2);
    recipient2 = await createFundedWallet(provider.connection, 2);

    const r1Ata = await getOrCreateAssociatedTokenAccount(
      provider.connection, payer, lucidMint, recipient1.publicKey,
    );
    recipient1Ata = r1Ata.address;

    const r2Ata = await getOrCreateAssociatedTokenAccount(
      provider.connection, payer, lucidMint, recipient2.publicKey,
    );
    recipient2Ata = r2Ata.address;
  });

  // =========================================================================
  // 1. collect_and_split — happy path
  // =========================================================================

  it("collects and splits gas with burn", async () => {
    const tx = await program.methods
      .collectAndSplit(
        new anchor.BN(500), // m_gas
        new anchor.BN(500), // i_gas (total = 1000)
        [
          { recipient: recipient1.publicKey, percentage: 60 },
          { recipient: recipient2.publicKey, percentage: 40 },
        ],
        1000, // burn 10%
      )
      .accounts({
        userAta: payerAta,
        lucidMint: lucidMint,
        user: payer.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: recipient1Ata, isSigner: false, isWritable: true },
        { pubkey: recipient2Ata, isSigner: false, isWritable: true },
      ])
      .signers([payer])
      .rpc();

    await confirmTransaction(provider.connection, tx);
  });

  it("collects and splits gas with 100% burn", async () => {
    const tx = await program.methods
      .collectAndSplit(
        new anchor.BN(100),
        new anchor.BN(0),
        [{ recipient: recipient1.publicKey, percentage: 100 }],
        10000, // 100% burn
      )
      .accounts({
        userAta: payerAta,
        lucidMint: lucidMint,
        user: payer.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: recipient1Ata, isSigner: false, isWritable: true },
      ])
      .signers([payer])
      .rpc();

    await confirmTransaction(provider.connection, tx);
  });

  // =========================================================================
  // 2. Validation errors
  // =========================================================================

  it("rejects zero gas amount", async () => {
    try {
      await program.methods
        .collectAndSplit(
          new anchor.BN(0),
          new anchor.BN(0),
          [{ recipient: recipient1.publicKey, percentage: 100 }],
          0,
        )
        .accounts({
          userAta: payerAta,
          lucidMint: lucidMint,
          user: payer.publicKey,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: recipient1Ata, isSigner: false, isWritable: true },
        ])
        .signers([payer])
        .rpc();

      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.toString()).to.include("ZeroGasAmount");
    }
  });

  it("rejects no recipients", async () => {
    try {
      await program.methods
        .collectAndSplit(new anchor.BN(100), new anchor.BN(0), [], 0)
        .accounts({
          userAta: payerAta,
          lucidMint: lucidMint,
          user: payer.publicKey,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([payer])
        .rpc();

      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.toString()).to.include("NoRecipients");
    }
  });

  it("rejects percentages that don't sum to 100", async () => {
    try {
      await program.methods
        .collectAndSplit(
          new anchor.BN(100),
          new anchor.BN(0),
          [
            { recipient: recipient1.publicKey, percentage: 50 },
            { recipient: recipient2.publicKey, percentage: 30 },
          ],
          0,
        )
        .accounts({
          userAta: payerAta,
          lucidMint: lucidMint,
          user: payer.publicKey,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: recipient1Ata, isSigner: false, isWritable: true },
          { pubkey: recipient2Ata, isSigner: false, isWritable: true },
        ])
        .signers([payer])
        .rpc();

      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.toString()).to.include("InvalidPercentageSum");
    }
  });

  it("rejects burn_bps > 10000", async () => {
    try {
      await program.methods
        .collectAndSplit(
          new anchor.BN(100),
          new anchor.BN(0),
          [{ recipient: recipient1.publicKey, percentage: 100 }],
          10001,
        )
        .accounts({
          userAta: payerAta,
          lucidMint: lucidMint,
          user: payer.publicKey,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: recipient1Ata, isSigner: false, isWritable: true },
        ])
        .signers([payer])
        .rpc();

      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.toString()).to.include("InvalidBurnBps");
    }
  });

  // =========================================================================
  // 3. mint_and_distribute — NotImplemented stub
  // =========================================================================

  it("mint_and_distribute returns NotImplemented error", async () => {
    try {
      await program.methods
        .mintAndDistribute(
          new anchor.BN(1000),
          [{ recipient: recipient1.publicKey, percentage: 100 }],
        )
        .accounts({
          lucidMint: lucidMint,
          mintAuthority: payer.publicKey,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([payer])
        .rpc();

      expect.fail("Should have thrown NotImplemented");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.toString()).to.include("NotImplemented");
    }
  });
});
