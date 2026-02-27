/**
 * Dispute Types
 *
 * TypeScript types mirroring the on-chain LucidArbitration contract.
 */

export enum DisputeStatus {
  Open = 0,
  EvidencePhase = 1,
  Resolved = 2,
  Appealed = 3,
}

export interface DisputeInfo {
  disputeId: string;
  escrowId: string;
  initiator: string;
  reason: string;
  status: DisputeStatus;
  createdAt: number;
  evidenceDeadline: number;
  resolvedInFavorOf: string;
  appealed: boolean;
  appealDeadline: number;
  appealedBy: string;
}

export interface EvidenceInfo {
  submitter: string;
  receiptHash: string;
  mmrRoot: string;
  mmrProof: string;
  description: string;
  submittedAt: number;
}

export interface EvidenceSubmission {
  receiptHash: string;
  mmrRoot: string;
  mmrProof: string;
  description: string;
}
