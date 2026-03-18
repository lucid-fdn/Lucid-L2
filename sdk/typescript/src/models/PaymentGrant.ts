/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PaymentGrantAttestation } from './PaymentGrantAttestation';
import type { PaymentGrantLimits } from './PaymentGrantLimits';
import type { PaymentGrantScope } from './PaymentGrantScope';
export type PaymentGrant = {
    grant_id: string;
    tenant_id: string;
    agent_passport_id: string;
    run_id: string;
    scope: PaymentGrantScope;
    limits: PaymentGrantLimits;
    attestation: PaymentGrantAttestation;
    /**
     * Ed25519 signature (hex)
     */
    signature: string;
    /**
     * Ed25519 public key (hex)
     */
    signer_pubkey: string;
};

