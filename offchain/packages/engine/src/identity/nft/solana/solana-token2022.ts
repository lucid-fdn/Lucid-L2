/**
 * Solana Passport Client
 *
 * Mints Lucid passport NFTs as Token-2022 tokens with metadata extension.
 * Each passport is a non-fungible token (supply = 1) with on-chain metadata.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type Commitment,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeMetadataPointerInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getAccount,
  createSetAuthorityInstruction,
  AuthorityType,
  ExtensionType,
  getMintLen,
  TYPE_SIZE,
  LENGTH_SIZE,
} from '@solana/spl-token';
import {
  createInitializeInstruction as createInitializeMetadataInstruction,
  createUpdateFieldInstruction,
} from '@solana/spl-token-metadata';
import type { AgentIdentity } from '../../../shared/chains/types';
import type { PassportNFTMetadata, PassportNFT } from '../../../shared/chains/solana/types';

// Token-2022 metadata extension discriminator (8 bytes)
const TOKEN_METADATA_DISCRIMINATOR = Buffer.from([112, 132, 90, 90, 11, 88, 157, 87]);

export class SolanaPassportClient {
  private connection: Connection;
  private payer: Keypair | null;
  private commitment: Commitment;

  constructor(
    connection: Connection,
    payer: Keypair | null = null,
    commitment: Commitment = 'confirmed',
  ) {
    this.connection = connection;
    this.payer = payer;
    this.commitment = commitment;
  }

  /**
   * Register a new passport NFT using Token-2022 with metadata extension.
   */
  async registerPassportNFT(metadata: PassportNFTMetadata): Promise<{ mintAddress: string; txSignature: string }> {
    if (!this.payer) {
      throw new Error('Payer keypair required for minting');
    }

    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;
    const decimals = 0; // NFT = 0 decimals

    // Serialize metadata for on-chain storage
    const metadataJSON = JSON.stringify({
      name: metadata.name,
      description: metadata.description,
      endpoints: metadata.endpoints,
      capabilities: metadata.capabilities,
      linkedAddresses: metadata.linkedAddresses || [],
    });

    // Calculate space needed for mint + metadata pointer extension
    // Token-2022 mint with metadata pointer extension
    const mintLen = getMintLen([ExtensionType.MetadataPointer]);

    // Additional space for metadata (name + uri + additional data)
    const metadataName = metadata.name.slice(0, 32);
    const metadataUri = metadata.uri || '';
    const metadataSymbol = 'LUCID-P';

    // Pack layout: discriminator (8) + update_authority (32) + mint (32)
    // + name_len (4) + name + symbol_len (4) + symbol + uri_len (4) + uri
    // + additional_metadata count (4) + key/value pairs
    const additionalMetadataSize =
      4 + // key length prefix
      'metadata'.length +
      4 + // value length prefix
      metadataJSON.length;

    const metadataLen =
      TOKEN_METADATA_DISCRIMINATOR.length +
      32 + // update authority
      32 + // mint
      4 + metadataName.length +
      4 + metadataSymbol.length +
      4 + metadataUri.length +
      4 + // additional metadata count
      additionalMetadataSize;

    const totalLen = mintLen + TYPE_SIZE + LENGTH_SIZE + metadataLen;

    const lamports = await this.connection.getMinimumBalanceForRentExemption(totalLen);

    // Associated token account for the payer (owner)
    const ata = getAssociatedTokenAddressSync(
      mint,
      this.payer.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    const tx = new Transaction();

    // 1. Create account for mint
    tx.add(
      SystemProgram.createAccount({
        fromPubkey: this.payer.publicKey,
        newAccountPubkey: mint,
        space: totalLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    );

    // 2. Initialize metadata pointer (points to itself)
    tx.add(
      createInitializeMetadataPointerInstruction(
        mint,
        this.payer.publicKey,
        mint, // metadata address = mint itself
        TOKEN_2022_PROGRAM_ID,
      ),
    );

    // 3. Initialize mint
    tx.add(
      createInitializeMintInstruction(
        mint,
        decimals,
        this.payer.publicKey, // mint authority
        null, // freeze authority (none for NFTs)
        TOKEN_2022_PROGRAM_ID,
      ),
    );

    // 3b. Initialize Token-2022 metadata (writes name, symbol, URI into the extension)
    tx.add(
      createInitializeMetadataInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint, // metadata lives on the mint itself
        updateAuthority: this.payer.publicKey,
        mint,
        mintAuthority: this.payer.publicKey,
        name: metadataName,
        symbol: metadataSymbol,
        uri: metadataUri,
      }),
    );

    // 3c. Write additional metadata as a key-value field
    tx.add(
      createUpdateFieldInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint,
        updateAuthority: this.payer.publicKey,
        field: 'metadata',
        value: metadataJSON,
      }),
    );

    // 4. Create associated token account
    tx.add(
      createAssociatedTokenAccountInstruction(
        this.payer.publicKey,
        ata,
        this.payer.publicKey,
        mint,
        TOKEN_2022_PROGRAM_ID,
      ),
    );

    // 5. Mint 1 token (NFT)
    tx.add(
      createMintToInstruction(
        mint,
        ata,
        this.payer.publicKey,
        1, // amount = 1 for NFT
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
    );

    // 6. Remove mint authority (makes it truly non-fungible)
    tx.add(
      createSetAuthorityInstruction(
        mint,
        this.payer.publicKey,
        AuthorityType.MintTokens,
        null,
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
    );

    const txSignature = await this.connection.sendTransaction(tx, [this.payer, mintKeypair], {
      skipPreflight: false,
    });

    await this.connection.confirmTransaction(txSignature, this.commitment);

    return {
      mintAddress: mint.toBase58(),
      txSignature,
    };
  }

  /**
   * Get a passport NFT by mint address.
   */
  async getPassportNFT(mintAddress: string): Promise<AgentIdentity | null> {
    try {
      const mintPubkey = new PublicKey(mintAddress);
      const mintInfo = await getMint(
        this.connection,
        mintPubkey,
        this.commitment,
        TOKEN_2022_PROGRAM_ID,
      );

      if (!mintInfo) return null;

      // For Token-2022 NFTs, supply should be 1 and decimals should be 0
      if (mintInfo.decimals !== 0 || mintInfo.supply !== 1n) {
        return null; // Not a valid passport NFT
      }

      // Find the token account owner
      const largestAccounts = await this.connection.getTokenLargestAccounts(mintPubkey, this.commitment);
      const ownerAccount = largestAccounts.value.find(a => a.uiAmount === 1);

      let owner = '';
      if (ownerAccount) {
        const accountInfo = await getAccount(
          this.connection,
          ownerAccount.address,
          this.commitment,
          TOKEN_2022_PROGRAM_ID,
        );
        owner = accountInfo.owner.toBase58();
      }

      return {
        tokenId: mintAddress,
        owner,
        tokenURI: '', // Metadata is on-chain in Token-2022 extension
        isActive: true,
      };
    } catch {
      return null;
    }
  }

  /**
   * List passport NFTs owned by an address.
   */
  async listPassportNFTs(ownerAddress: string): Promise<AgentIdentity[]> {
    try {
      const ownerPubkey = new PublicKey(ownerAddress);
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        ownerPubkey,
        { programId: TOKEN_2022_PROGRAM_ID },
        this.commitment,
      );

      const passports: AgentIdentity[] = [];

      for (const account of tokenAccounts.value) {
        const parsed = account.account.data.parsed;
        if (
          parsed.info.tokenAmount.decimals === 0 &&
          parsed.info.tokenAmount.uiAmount === 1
        ) {
          passports.push({
            tokenId: parsed.info.mint,
            owner: ownerAddress,
            tokenURI: '',
            isActive: true,
          });
        }
      }

      return passports;
    } catch {
      return [];
    }
  }
}
