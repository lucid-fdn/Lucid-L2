+ use anchor_lang::prelude::*;
+ use solana_program_test::*;
+ use solana_sdk::{
+     signature::{Keypair, Signer},
+     transaction::Transaction,
+ };
+
+ #[tokio::test]
+ async fn program_test_commit_epoch() {
+     // Launch an in-process local validator
+     let mut pt = ProgramTest::new(
+         "thought_epoch", // crate name
+         id(),            // program ID import from declare_id!
+         processor!(thought_epoch::entry),
+     );
+
+     // Start test environment
+     let (mut banks_client, payer, recent_blockhash) = pt.start().await;
+
+     // Derive PDA
+     let authority = payer.pubkey();
+     let (pda, bump) = Pubkey::find_program_address(&[b"epoch", authority.as_ref()], &id());
+
+     // Build commit_epoch instruction
+     let root = [7u8; 32];
+     let ix = Instruction {
+         program_id: id(),
+         accounts: [
+             AccountMeta::new(pda, false),
+             AccountMeta::new_readonly(authority, true),
+             AccountMeta::new_readonly(solana_program::system_program::ID, false),
+         ]
+         .to_vec(),
+         data: thought_epoch::instruction::CommitEpoch { root }.data(),
+     };
+
+     // Create and send transaction
+     let tx = Transaction::new_signed_with_payer(
+         &[ix],
+         Some(&payer.pubkey()),
+         &[&payer],
+         recent_blockhash,
+     );
+     banks_client.process_transaction(tx).await.unwrap();
+
+     // Fetch and assert on-chain state
+     let account = banks_client
+         .get_account(pda)
+         .await
+         .expect("get_account")
+         .expect("account not found");
+     let record: thought_epoch::EpochRecord = try_from_slice_unchecked(&account.data).unwrap();
+     assert_eq!(record.merkle_root, root);
+ }
