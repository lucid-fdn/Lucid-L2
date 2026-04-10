/**
 * Standalone test: Create an Agent identity on Solana devnet
 * No Anchor CLI required — uses raw @coral-xyz/anchor with inline IDL
 */

// @ts-nocheck
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from "@solana/web3.js";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// ── Program ID (deployed on devnet) ──────────────────────────────────────────
const PROGRAM_ID = new PublicKey("FhoemNdqwPMt8nmX4HT3WpSqUuqeAUXRb7WchAehmSaL");

// ── IDL constructed from lib.rs ──────────────────────────────────────────────
const IDL = {
  version: "0.1.0",
  name: "lucid_passports",
  address: PROGRAM_ID.toBase58(),
  metadata: { name: "lucid_passports", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "registerPassport",
      discriminator: [], // Anchor computes this from the name
      accounts: [
        { name: "passport", isMut: true, isSigner: false },
        { name: "owner", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "assetType", type: { defined: "AssetType" } },
        { name: "slug", type: "string" },
        { name: "version", type: { defined: "Version" } },
        { name: "contentCid", type: "string" },
        { name: "contentHash", type: { array: ["u8", 32] } },
        { name: "metadataCid", type: "string" },
        { name: "licenseCode", type: "string" },
        { name: "policyFlags", type: "u16" },
      ],
    },
  ],
  accounts: [
    {
      name: "Passport",
      type: {
        kind: "struct",
        fields: [
          { name: "owner", type: "publicKey" },
          { name: "assetType", type: { defined: "AssetType" } },
          { name: "slug", type: "string" },
          { name: "version", type: { defined: "Version" } },
          { name: "contentCid", type: "string" },
          { name: "contentHash", type: { array: ["u8", 32] } },
          { name: "metadataCid", type: "string" },
          { name: "licenseCode", type: "string" },
          { name: "policyFlags", type: "u16" },
          { name: "status", type: { defined: "PassportStatus" } },
          { name: "createdAt", type: "i64" },
          { name: "updatedAt", type: "i64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
  types: [
    {
      name: "AssetType",
      type: {
        kind: "enum",
        variants: [
          { name: "Model" },
          { name: "Dataset" },
          { name: "Tool" },
          { name: "Agent" },
          { name: "Voice" },
          { name: "Other" },
        ],
      },
    },
    {
      name: "PassportStatus",
      type: {
        kind: "enum",
        variants: [
          { name: "Active" },
          { name: "Deprecated" },
          { name: "Superseded" },
          { name: "Revoked" },
        ],
      },
    },
    {
      name: "Version",
      type: {
        kind: "struct",
        fields: [
          { name: "major", type: "u32" },
          { name: "minor", type: "u32" },
          { name: "patch", type: "u32" },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: "SlugTooLong", msg: "Slug exceeds maximum length" },
    { code: 6001, name: "CidTooLong", msg: "CID exceeds maximum length" },
    { code: 6002, name: "LicenseTooLong", msg: "License code exceeds maximum length" },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugSeed(slug: string): Buffer {
  return crypto.createHash("sha256").update(slug).digest();
}

function versionBytes(major: number, minor: number, patch: number): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeUInt32LE(major, 0);
  buf.writeUInt32LE(minor, 4);
  buf.writeUInt32LE(patch, 8);
  return buf;
}

function generateMockCID(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let cid = "Qm";
  for (let i = 0; i < 44; i++) {
    cid += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return cid;
}

function generateContentHash(seed: string): number[] {
  const hash = crypto.createHash("sha256").update(seed).digest();
  return Array.from(hash);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   Lucid Layer — Create Agent Identity on Solana Devnet   ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  // 1. Load wallet
  const keypairPath = path.resolve(
    process.env.ANCHOR_WALLET || "/Users/kevin/.config/solana/id.json"
  );
  console.log("1. Loading wallet from:", keypairPath);
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  console.log("   Address:", keypair.publicKey.toBase58());

  // 2. Connect to devnet
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  // 3. Check balance, airdrop if needed
  let balance = await connection.getBalance(keypair.publicKey);
  console.log("   Balance:", balance / LAMPORTS_PER_SOL, "SOL");

  if (balance < 0.05 * LAMPORTS_PER_SOL) {
    console.log("\n2. Airdropping 2 SOL...");
    try {
      const sig = await connection.requestAirdrop(
        keypair.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(sig, "confirmed");
      balance = await connection.getBalance(keypair.publicKey);
      console.log("   New balance:", balance / LAMPORTS_PER_SOL, "SOL");
    } catch (err: any) {
      console.error("   Airdrop failed:", err.message);
      console.log("   Try: https://faucet.solana.com/ to fund", keypair.publicKey.toBase58());
      if (balance === 0) {
        process.exit(1);
      }
      console.log("   Continuing with existing balance...");
    }
  } else {
    console.log("\n2. Balance sufficient, skipping airdrop");
  }

  // 4. Initialize program
  console.log("\n3. Initializing program...");
  console.log("   Program ID:", PROGRAM_ID.toBase58());
  const program = new Program(IDL as any, provider);

  // 5. Define agent identity
  const agentSlug = `test-agent-${Date.now()}`;
  const agentVersion = { major: 1, minor: 0, patch: 0 };
  const contentCid = generateMockCID();
  const metadataCid = generateMockCID();
  const contentHash = generateContentHash(`agent-${agentSlug}`);
  const licenseCode = "Apache-2.0";
  const policyFlags = 0b00001111; // commercial + derivatives + finetune + attribution

  console.log("\n4. Agent identity parameters:");
  console.log("   Slug:        ", agentSlug);
  console.log("   Version:     ", `${agentVersion.major}.${agentVersion.minor}.${agentVersion.patch}`);
  console.log("   Asset Type:   Agent (3)");
  console.log("   License:     ", licenseCode);
  console.log("   Policy Flags:", `0b${policyFlags.toString(2).padStart(16, '0')}`);
  console.log("   Content CID: ", contentCid.substring(0, 20) + "...");
  console.log("   Metadata CID:", metadataCid.substring(0, 20) + "...");

  // 6. Derive PDA
  const [passportPDA, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("passport"),
      keypair.publicKey.toBuffer(),
      Buffer.from([3]), // Agent = 3
      slugSeed(agentSlug),
      versionBytes(agentVersion.major, agentVersion.minor, agentVersion.patch),
    ],
    PROGRAM_ID
  );

  console.log("\n5. Derived Passport PDA:");
  console.log("   PDA:  ", passportPDA.toBase58());
  console.log("   Bump: ", bump);

  // 7. Send transaction
  console.log("\n6. Registering Agent passport on-chain...");
  try {
    const tx = await program.methods
      .registerPassport(
        { agent: {} },        // AssetType::Agent
        agentSlug,
        agentVersion,
        contentCid,
        contentHash,
        metadataCid,
        licenseCode,
        policyFlags
      )
      .accounts({
        passport: passportPDA,
        owner: keypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("   ✓ Transaction submitted:", tx);

    // Wait for confirmation
    await connection.confirmTransaction(tx, "confirmed");
    console.log("   ✓ Transaction confirmed!");

    // 8. Read back the on-chain data
    console.log("\n7. Reading on-chain passport data...");
    const passport = await (program.account as any).passport.fetch(passportPDA);

    console.log("   ┌──────────────────────────────────────────────────────────");
    console.log("   │ ON-CHAIN AGENT PASSPORT");
    console.log("   ├──────────────────────────────────────────────────────────");
    console.log("   │ Owner:       ", passport.owner.toBase58());
    console.log("   │ Asset Type:  ", JSON.stringify(passport.assetType));
    console.log("   │ Slug:        ", passport.slug);
    console.log("   │ Version:     ", `${passport.version.major}.${passport.version.minor}.${passport.version.patch}`);
    console.log("   │ Content CID: ", passport.contentCid.substring(0, 30) + "...");
    console.log("   │ Metadata CID:", passport.metadataCid.substring(0, 30) + "...");
    console.log("   │ License:     ", passport.licenseCode);
    console.log("   │ Policy Flags:", passport.policyFlags);
    console.log("   │ Status:      ", JSON.stringify(passport.status));
    console.log("   │ Created At:  ", new Date(passport.createdAt.toNumber() * 1000).toISOString());
    console.log("   │ Updated At:  ", new Date(passport.updatedAt.toNumber() * 1000).toISOString());
    console.log("   │ PDA Address: ", passportPDA.toBase58());
    console.log("   │ Bump:        ", passport.bump);
    console.log("   └──────────────────────────────────────────────────────────");

    // Verify
    const isAgent = JSON.stringify(passport.assetType) === JSON.stringify({ agent: {} });
    const isActive = JSON.stringify(passport.status) === JSON.stringify({ active: {} });
    const ownerMatch = passport.owner.toBase58() === keypair.publicKey.toBase58();

    console.log("\n8. Verification:");
    console.log("   Asset type is Agent:", isAgent ? "✓ PASS" : "✗ FAIL");
    console.log("   Status is Active:   ", isActive ? "✓ PASS" : "✗ FAIL");
    console.log("   Owner matches:      ", ownerMatch ? "✓ PASS" : "✗ FAIL");
    console.log("   Slug matches:       ", passport.slug === agentSlug ? "✓ PASS" : "✗ FAIL");
    console.log("   License matches:    ", passport.licenseCode === licenseCode ? "✓ PASS" : "✗ FAIL");

    const allPassed = isAgent && isActive && ownerMatch && passport.slug === agentSlug;

    console.log("\n" + (allPassed
      ? "═══ ALL CHECKS PASSED — Agent identity created on Solana devnet ═══"
      : "═══ SOME CHECKS FAILED ═══"));

    // Final balance
    const finalBalance = await connection.getBalance(keypair.publicKey);
    console.log("\n   Final balance:", finalBalance / LAMPORTS_PER_SOL, "SOL");
    console.log("   Rent paid:   ", (balance - finalBalance) / LAMPORTS_PER_SOL, "SOL");

    console.log("\n   Explorer: https://explorer.solana.com/tx/" + tx + "?cluster=devnet");

  } catch (err: any) {
    console.error("\n   ✗ Transaction failed:", err.message);
    if (err.logs) {
      console.error("   Program logs:");
      err.logs.forEach((log: string) => console.error("     ", log));
    }
    process.exit(1);
  }
}

main().catch(console.error);
