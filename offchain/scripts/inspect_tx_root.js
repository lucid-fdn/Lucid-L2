// offchain/scripts/inspect_tx_root.js
// Usage: node offchain/scripts/inspect_tx_root.js <SIGNATURE> <PROGRAM_ID>
// Example:
//   node offchain/scripts/inspect_tx_root.js sUvY... J1JNYJ...
//
// Fetches the transaction from devnet, finds the Thought-Epoch instruction,
// decodes its data, and prints the 32-byte root (hex) that was committed.

const { Connection, PublicKey } = require("@solana/web3.js");

async function main() {
  const [,, sig, programIdStr] = process.argv;
  if (!sig || !programIdStr) {
    console.error("Usage: node offchain/scripts/inspect_tx_root.js <SIGNATURE> <PROGRAM_ID>");
    process.exit(1);
  }
  const programId = new PublicKey(programIdStr);
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");

  const tx = await conn.getTransaction(sig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0
  });

  if (!tx) {
    console.error("Transaction not found on devnet");
    process.exit(1);
  }

  // Prefer compiled instructions as they carry programIdIndex mapping
  const msg = tx.transaction.message;
  const ixList = msg.compiledInstructions || msg.instructions || [];
  let targetIx = null;

  for (const ix of ixList) {
    // For legacy compiled instructions, ix.programIdIndex is used
    // For v0, get program id via staticAccounts + writable/signers arrays mapping
    let ixProgramId;
    if (typeof ix.programIdIndex === "number") {
      const accIndex = ix.programIdIndex;
      const accKey = msg.staticAccountKeys
        ? msg.staticAccountKeys[accIndex]
        : msg.accountKeys[accIndex];
      ixProgramId = accKey;
    } else if (ix.programId) {
      ixProgramId = ix.programId;
    }

    if (!ixProgramId) continue;
    const ixPid = new PublicKey(ixProgramId);
    if (ixPid.equals(programId)) {
      targetIx = ix;
      break;
    }
  }

  if (!targetIx) {
    console.error("No instruction for program", programId.toBase58(), "found in this transaction");
    process.exit(1);
  }

  // Data is base64 for legacy; for compiledInstructions it's a base-58 string on older SDKs.
  // Try both possibilities robustly.
  function decodeIxData(ix) {
    if (ix.data instanceof Buffer) return ix.data;
    if (typeof ix.data === "string") {
      // Try base64 then base58
      try {
        return Buffer.from(ix.data, "base64");
      } catch (_) {}
      try {
        const bs58 = require("bs58");
        return Buffer.from(bs58.decode(ix.data));
      } catch (_) {}
    }
    return null;
  }

  const dataBuf = decodeIxData(targetIx);
  if (!dataBuf) {
    console.error("Unable to decode instruction data buffer");
    process.exit(1);
  }

  if (dataBuf.length < 8 + 32) {
    console.error("Instruction data too short. Length:", dataBuf.length);
    process.exit(1);
  }

  const disc = dataBuf.slice(0, 8);       // 8-byte anchor discriminator
  const root = dataBuf.slice(8, 8 + 32);  // 32-byte root
  console.log("Anchor discriminator (hex):", Buffer.from(disc).toString("hex"));
  console.log("Committed root (hex):      ", Buffer.from(root).toString("hex"));

  // Done. Root extracted from the transaction successfully.
  return;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
