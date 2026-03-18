import type { LaunchImageInput, LaunchBaseRuntimeInput } from './types';

export function validateLaunchImageInput(input: LaunchImageInput): string | null {
  if (!input.image || typeof input.image !== 'string') return 'image is required';
  if (!input.target) return 'target is required';
  if (!input.owner || typeof input.owner !== 'string') return 'owner is required';
  if (!input.name || typeof input.name !== 'string') return 'name is required';
  if (input.verification && !['full', 'minimal'].includes(input.verification)) {
    return 'verification must be "full" or "minimal"';
  }
  return null;
}

export function validateBaseRuntimeInput(input: LaunchBaseRuntimeInput): string | null {
  if (!input.model || typeof input.model !== 'string') return 'model is required';
  if (!input.prompt || typeof input.prompt !== 'string') return 'prompt is required';
  if (!input.target) return 'target is required';
  if (!input.owner || typeof input.owner !== 'string') return 'owner is required';
  return null;
}
