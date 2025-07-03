use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction,
    program::invoke_signed,
    rent::Rent,
    sysvar::Sysvar,
};

// Declare and export the program's entrypoint
entrypoint!(process_instruction);

// Program entrypoint's implementation
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("Simple program entrypoint");
    
    if instruction_data.len() != 32 {
        return Err(ProgramError::InvalidInstructionData);
    }
    
    let accounts_iter = &mut accounts.iter();
    let epoch_account = next_account_info(accounts_iter)?;
    let authority = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;
    
    // Create PDA seeds
    let seeds = &[b"epoch", authority.key.as_ref()];
    let (expected_pda, bump) = Pubkey::find_program_address(seeds, program_id);
    
    if epoch_account.key != &expected_pda {
        return Err(ProgramError::InvalidAccountData);
    }
    
    // Initialize account if needed
    if epoch_account.data_len() == 0 {
        let rent = Rent::get()?;
        let space = 8 + 32 + 32; // discriminator + merkle_root + authority
        let lamports = rent.minimum_balance(space);
        
        let create_account_ix = system_instruction::create_account(
            authority.key,
            epoch_account.key,
            lamports,
            space as u64,
            program_id,
        );
        
        let signer_seeds = &[b"epoch", authority.key.as_ref(), &[bump]];
        invoke_signed(
            &create_account_ix,
            &[authority.clone(), epoch_account.clone(), system_program.clone()],
            &[signer_seeds],
        )?;
    }
    
    // Write the merkle root to the account
    let mut data = epoch_account.try_borrow_mut_data()?;
    if data.len() < 72 {
        return Err(ProgramError::AccountDataTooSmall);
    }
    
    // Write discriminator (8 bytes)
    data[0..8].copy_from_slice(&[0u8; 8]);
    // Write merkle root (32 bytes)
    data[8..40].copy_from_slice(instruction_data);
    // Write authority (32 bytes)
    data[40..72].copy_from_slice(authority.key.as_ref());
    
    msg!("Merkle root committed successfully");
    Ok(())
}
