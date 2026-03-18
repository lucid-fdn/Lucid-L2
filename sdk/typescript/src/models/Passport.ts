/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PassportStatus } from './PassportStatus';
import type { PassportType } from './PassportType';
export type Passport = {
    passport_id: string;
    type: PassportType;
    owner: string;
    name?: string | null;
    description?: string | null;
    version?: string | null;
    tags?: Array<string> | null;
    status: PassportStatus;
    metadata?: Record<string, any> | null;
    metadata_hash?: string | null;
    /**
     * DePIN storage CID for metadata
     */
    depin_metadata_cid?: string | null;
    /**
     * DePIN provider used (arweave, lighthouse, mock)
     */
    depin_provider?: string | null;
    /**
     * NFT mint address (Solana base58 or EVM 0x)
     */
    nft_mint?: string | null;
    /**
     * Chain where NFT was minted
     */
    nft_chain?: string | null;
    /**
     * Share token SPL mint address
     */
    share_token_mint?: string | null;
    created_at: number;
    updated_at: number;
    on_chain?: {
        pda?: string | null;
        tx?: string | null;
        synced_at?: number | null;
    } | null;
};

