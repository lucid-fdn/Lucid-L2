// services/passportService.ts
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, Keypair } from '@solana/web3.js';
import { LucidPassports } from '../types/lucid_passports';
import { initSolana } from '../solana/client';

// Asset type enum matching the Solana program
export enum AssetType {
    Model = 0,
    Dataset = 1,
    Tool = 2,
    Agent = 3,
    Voice = 4,
    Other = 5,
}

// Passport status enum
export enum PassportStatus {
    Active = 0,
    Deprecated = 1,
    Superseded = 2,
    Revoked = 3,
}

// Attestation type enum
export enum AttestationType {
    TrainingLog = 0,
    EvalReport = 1,
    SafetyAudit = 2,
    LicenseVerification = 3,
    TEEQuote = 4,
    VendorAttestation = 5,
    Other = 6,
}

// Version structure
export interface Version {
    major: number;
    minor: number;
    patch: number;
}

// Policy flags (bitfield)
export const POLICY_ALLOW_COMMERCIAL = 1 << 0;
export const POLICY_ALLOW_DERIVATIVES = 1 << 1;
export const POLICY_ALLOW_FINETUNE = 1 << 2;
export const POLICY_REQUIRE_ATTRIBUTION = 1 << 3;
export const POLICY_SHARE_ALIKE = 1 << 4;

// Passport registration parameters
export interface PassportRegistrationParams {
    assetType: AssetType;
    slug: string;
    version: Version;
    contentCid: string;
    contentHash: Buffer;
    metadataCid: string;
    licenseCode: string;
    policyFlags: number;
}

// Passport data structure
export interface PassportData {
    owner: PublicKey;
    assetType: AssetType;
    slug: string;
    version: Version;
    contentCid: string;
    contentHash: Buffer;
    metadataCid: string;
    licenseCode: string;
    policyFlags: number;
    status: PassportStatus;
    createdAt: BN;
    updatedAt: BN;
    bump: number;
}

export class PassportService {
    private program: Program<LucidPassports>;
    private provider: AnchorProvider;

    constructor() {
        this.program = initSolana() as any; // Will be properly typed after program deployment
        this.provider = this.program.provider as AnchorProvider;
    }

    /**
     * Derive passport PDA address
     */
    async derivePassportPDA(
        owner: PublicKey,
        assetType: AssetType,
        slug: string,
        version: Version
    ): Promise<[PublicKey, number]> {
        const versionBytes = this.versionToBytes(version);
        
        return PublicKey.findProgramAddressSync(
            [
                Buffer.from('passport'),
                owner.toBuffer(),
                Buffer.from([assetType]),
                Buffer.from(slug),
                versionBytes,
            ],
            this.program.programId
        );
    }

    /**
     * Register a new passport
     */
    async registerPassport(
        params: PassportRegistrationParams,
        owner?: Keypair
    ): Promise<{ signature: string; passportPDA: PublicKey }> {
        const authority = owner || (this.provider.wallet as any).payer;
        
        const [passportPDA] = await this.derivePassportPDA(
            authority.publicKey,
            params.assetType,
            params.slug,
            params.version
        );

        console.log(`📝 Registering passport: ${params.slug} v${params.version.major}.${params.version.minor}.${params.version.patch}`);
        console.log(`   PDA: ${passportPDA.toBase58()}`);

        const signature = await this.program.methods
            .registerPassport(
                { [AssetType[params.assetType].toLowerCase()]: {} },
                params.slug,
                params.version,
                params.contentCid,
                Array.from(params.contentHash),
                params.metadataCid,
                params.licenseCode,
                params.policyFlags
            )
            .accounts({
                passport: passportPDA,
                owner: authority.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers(owner ? [owner] : [])
            .rpc();

        console.log(`✅ Passport registered: ${signature}`);

        return { signature, passportPDA };
    }

    /**
     * Update passport metadata or status
     */
    async updatePassport(
        passportPDA: PublicKey,
        metadataCid?: string,
        status?: PassportStatus,
        owner?: Keypair
    ): Promise<string> {
        const authority = owner || (this.provider.wallet as any).payer;

        console.log(`🔄 Updating passport: ${passportPDA.toBase58()}`);

        const signature = await this.program.methods
            .updatePassport(
                metadataCid || null,
                status !== undefined ? { [PassportStatus[status].toLowerCase()]: {} } : null
            )
            .accounts({
                passport: passportPDA,
                owner: authority.publicKey,
            })
            .signers(owner ? [owner] : [])
            .rpc();

        console.log(`✅ Passport updated: ${signature}`);

        return signature;
    }

    /**
     * Link version to previous passport
     */
    async linkVersion(
        currentPassportPDA: PublicKey,
        previousPassportPDA: PublicKey,
        previousVersion: Version,
        owner?: Keypair
    ): Promise<string> {
        const authority = owner || (this.provider.wallet as any).payer;

        const [versionLinkPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('version_link'),
                currentPassportPDA.toBuffer(),
            ],
            this.program.programId
        );

        console.log(`🔗 Linking versions: ${currentPassportPDA.toBase58()} → ${previousPassportPDA.toBase58()}`);

        const signature = await this.program.methods
            .linkVersion(previousVersion)
            .accounts({
                versionLink: versionLinkPDA,
                currentPassport: currentPassportPDA,
                previousPassport: previousPassportPDA,
                owner: authority.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers(owner ? [owner] : [])
            .rpc();

        console.log(`✅ Versions linked: ${signature}`);

        return signature;
    }

    /**
     * Add attestation to passport
     */
    async addAttestation(
        passportPDA: PublicKey,
        attestationType: AttestationType,
        contentCid: string,
        description: string,
        attester?: Keypair
    ): Promise<string> {
        const authority = attester || (this.provider.wallet as any).payer;
        const timestamp = Math.floor(Date.now() / 1000);

        const [attestationPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('attestation'),
                passportPDA.toBuffer(),
                authority.publicKey.toBuffer(),
                Buffer.from(new BN(timestamp).toArray('le', 8)),
            ],
            this.program.programId
        );

        console.log(`📋 Adding attestation to passport: ${passportPDA.toBase58()}`);

        const signature = await this.program.methods
            .addAttestation(
                { [AttestationType[attestationType].toLowerCase()]: {} },
                contentCid,
                description
            )
            .accounts({
                attestation: attestationPDA,
                passport: passportPDA,
                attester: authority.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers(attester ? [attester] : [])
            .rpc();

        console.log(`✅ Attestation added: ${signature}`);

        return signature;
    }

    /**
     * Fetch passport data
     */
    async fetchPassport(passportPDA: PublicKey): Promise<PassportData | null> {
        try {
            const passport = await this.program.account.passport.fetch(passportPDA);
            return passport as any;
        } catch (error) {
            console.error(`Error fetching passport ${passportPDA.toBase58()}:`, error);
            return null;
        }
    }

    /**
     * Fetch all passports for an owner
     */
    async fetchPassportsByOwner(owner: PublicKey): Promise<Array<{ pubkey: PublicKey; data: PassportData }>> {
        try {
            const passports = await this.program.account.passport.all([
                {
                    memcmp: {
                        offset: 8, // After discriminator
                        bytes: owner.toBase58(),
                    },
                },
            ]);

            return passports.map(p => ({
                pubkey: p.publicKey,
                data: p.account as any,
            }));
        } catch (error) {
            console.error(`Error fetching passports for owner ${owner.toBase58()}:`, error);
            return [];
        }
    }

    /**
     * Search passports by asset type
     */
    async searchPassportsByType(assetType: AssetType): Promise<Array<{ pubkey: PublicKey; data: PassportData }>> {
        try {
            const passports = await this.program.account.passport.all([
                {
                    memcmp: {
                        offset: 8 + 32, // After discriminator + owner
                        bytes: Buffer.from([assetType]).toString('base64'),
                    },
                },
            ]);

            return passports.map(p => ({
                pubkey: p.publicKey,
                data: p.account as any,
            }));
        } catch (error) {
            console.error(`Error searching passports by type:`, error);
            return [];
        }
    }

    /**
     * Convert version to bytes for PDA derivation
     */
    private versionToBytes(version: Version): Buffer {
        const buffer = Buffer.alloc(12);
        buffer.writeUInt32LE(version.major, 0);
        buffer.writeUInt32LE(version.minor, 4);
        buffer.writeUInt32LE(version.patch, 8);
        return buffer;
    }

    /**
     * Parse version string (e.g., "1.2.3") to Version object
     */
    static parseVersion(versionString: string): Version {
        const parts = versionString.split('.').map(Number);
        return {
            major: parts[0] || 0,
            minor: parts[1] || 0,
            patch: parts[2] || 0,
        };
    }

    /**
     * Format version object to string
     */
    static formatVersion(version: Version): string {
        return `${version.major}.${version.minor}.${version.patch}`;
    }
}

// Export singleton instance
let passportServiceInstance: PassportService | null = null;

export function getPassportService(): PassportService {
    if (!passportServiceInstance) {
        passportServiceInstance = new PassportService();
    }
    return passportServiceInstance;
}
