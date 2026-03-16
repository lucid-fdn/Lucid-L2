// offchain/packages/engine/src/deployment/control-plane/state-machine.ts
// Strict status machine for deployment lifecycle transitions

import {
  type ActualState,
  type DesiredState,
  type HealthStatus,
  type DeploymentEventType,
  ACTUAL_STATES,
  DESIRED_STATES,
  HEALTH_STATES,
  InvalidTransitionError,
} from './types';

/* ------------------------------------------------------------------ */
/*  Transition Map                                                    */
/* ------------------------------------------------------------------ */

const VALID_TRANSITIONS: Record<ActualState, ActualState[]> = {
  pending:     ['deploying', 'failed', 'terminated'],
  deploying:   ['running', 'failed', 'terminated'],
  running:     ['stopped', 'failed', 'terminated'],
  stopped:     ['deploying', 'terminated'],           // restart goes through deploying
  failed:      ['deploying', 'terminated'],           // retry goes through deploying
  terminated:  [],                                     // terminal state, no transitions out
};

/**
 * Check whether a transition from `from` to `to` is valid.
 */
export function canTransition(from: ActualState, to: ActualState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Assert a transition is valid. Throws InvalidTransitionError if not.
 */
export function assertValidTransition(from: ActualState, to: ActualState): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/* ------------------------------------------------------------------ */
/*  Event Type Taxonomy                                               */
/* ------------------------------------------------------------------ */

export const LIFECYCLE_EVENTS = ['created', 'started', 'succeeded', 'failed', 'stopped', 'terminated', 'restarted'] as const;
export const HEALTH_EVENTS = ['health_changed'] as const;
export const LEASE_EVENTS = ['lease_extended', 'lease_expiring'] as const;
export const CONFIG_EVENTS = ['config_updated', 'scaled'] as const;
export const ROLLOUT_EVENTS = ['promoted', 'rolled_back'] as const;

/* ------------------------------------------------------------------ */
/*  Re-exports for convenience                                        */
/* ------------------------------------------------------------------ */

export {
  ACTUAL_STATES,
  DESIRED_STATES,
  HEALTH_STATES,
  VALID_TRANSITIONS,
};

export type { ActualState, DesiredState, HealthStatus, DeploymentEventType };
