// offchain/scripts/derive_epoch_pda.js
// Usage: node offchain/scripts/derive_epoch_pda.js <PROGRAM_ID> <AUTHORITY_PUBKEY>
// Example: node offchain/scripts/derive_epoch_pda.js 8QXiFjguJT4PLVzH6BYNMHXZ3eLRaoF8cwx23EBc44Q6 D12Q1MiGbnB6hWDsHrgc3kMNvKCi5rAUkFEukyHcxWxn
const { PublicKey, Connection } = require("@solana/web3.js");

async function main() {
  const [,, programIdStr, authorityStr] = process.argv;
  if (!programIdStr || !authorityStr) {
    console.error("Usage: node offchain/scripts/derive_epoch_pda.js <PROGRAM_ID> <AUTHORITY_PUBKEY>");
    process.exit(1);
  }

  const program = new PublicKey(programIdStr);
  const authority = new PublicKey(authorityStr);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("epoch"), authority.toBuffer()],
    program
  );

  console.log("Derived epoch_record PDA:", pda.toBase58());

  // Optionally fetch and print some account info from devnet
  try {
    const conn = new Connection("https://api.devnet.solana.com", "confirmed");
    const acc = await conn.getAccountInfo(pda);
    if (!acc) {
      console.log("Account not found on devnet (might be lazily initialized or only stores minimal data).");
      return;
    }
    console.log("Owner:", acc.owner.toBase58());
    console.log("Data length:", acc.data.length);
    if (acc.data && acc.data.length >= 8 + 32) {
      // Anchor account layout: [8-byte discriminator][merkle_root:32][authority:32]
      const merkleRoot = Buffer.from(acc.data.slice(8, 8 + 32)).toString("hex");
      console.log("Merkle root (hex):", merkleRoot);
    }
  } catch (e) {
    console.log("Info fetch skipped:", e?.message || e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
