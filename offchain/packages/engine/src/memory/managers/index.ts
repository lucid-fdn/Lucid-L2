import { validateEpisodic } from './episodic';
import { validateSemantic } from './semantic';
import { validateProcedural } from './procedural';
import { validateEntity } from './entity';
import { validateTrustWeighted } from './trustWeighted';
import { validateTemporal } from './temporal';
import type { MemoryType } from '../types';

type ValidateFn = (entry: Record<string, unknown>) => void;

const VALIDATORS: Partial<Record<MemoryType, ValidateFn>> = {
  episodic: validateEpisodic,
  semantic: validateSemantic,
  procedural: validateProcedural,
  entity: validateEntity,
  trust_weighted: validateTrustWeighted,
  temporal: validateTemporal,
};

export function getManager(type: MemoryType): ValidateFn {
  const validator = VALIDATORS[type];
  if (!validator) throw new Error(`Manager for type '${type}' is not yet implemented (staged)`);
  return validator;
}

export { validateEpisodic } from './episodic';
export { validateSemantic } from './semantic';
export { validateProcedural } from './procedural';
export { validateEntity } from './entity';
export { validateTrustWeighted } from './trustWeighted';
export { validateTemporal } from './temporal';
