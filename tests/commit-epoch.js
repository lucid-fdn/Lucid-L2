const anchor = require('@project-serum/anchor');
const assert = require('assert');

describe('thought-epoch', () => {
  // 1) set up localnet provider
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);
  const program = anchor.workspace.ThoughtEpoch;

  it('stores a 32-byte root on-chain', async () => {
    // a) prepare a dummy 32-byte root
    const root = Uint8Array.from(Array(32).fill(7));

    // b) derive the PDA
    const [pda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from('epoch'), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    // c) call our commit_epoch instruction
    await program.methods
      .commitEpoch([...root])
      .accounts({
        epochRecord:   pda,
        authority:     provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // d) fetch the account and verify
    const rec = await program.account.epochRecord.fetch(pda);
    assert.ok(rec.merkleRoot.every(b => b === 7), 'root mismatch');
    console.log('✅ Stored root:', rec.merkleRoot);
  });
});
