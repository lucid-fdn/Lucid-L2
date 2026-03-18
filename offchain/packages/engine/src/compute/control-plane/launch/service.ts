// offchain/packages/engine/src/launch/service.ts
// Orchestration service for image-based agent launching (Path A + Path B).

import crypto from 'crypto';
import { logger } from '../../../shared/lib/logger';
import { getDeployer } from '../../providers';
import { getDeploymentStore } from '../store';
import { resolvePassport } from './passport-resolution';
import { buildLucidEnvVars, buildBaseRuntimeEnvVars } from './env-builder';
import { validateLaunchImageInput, validateBaseRuntimeInput } from './validators';
import type { ImageDeployInput } from '../../providers/types';
import type { LaunchImageInput, LaunchBaseRuntimeInput, LaunchResult } from './types';
import { BASE_RUNTIME_IMAGE, DEFAULT_RUNTIME_VERSION, DEFAULT_PORT } from './types';

/* ------------------------------------------------------------------ */
/*  Path A: Bring Your Own Image                                      */
/* ------------------------------------------------------------------ */

export async function launchImage(input: LaunchImageInput): Promise<LaunchResult> {
  // 1. Validate input
  const validationError = validateLaunchImageInput(input);
  if (validationError) {
    return { success: false, reputation_eligible: false, error: validationError };
  }

  const verification = input.verification ?? 'full';
  const reputationEligible = verification === 'full';

  // 2. Resolve passport (use existing or create new)
  const passportResult = await resolvePassport({
    passport_id: input.passport_id,
    owner: input.owner,
    name: input.name,
    target: input.target,
  });

  if (passportResult.ok !== true) {
    return { success: false, reputation_eligible: reputationEligible, error: passportResult.error };
  }

  const passportId = passportResult.passport_id;
  const store = getDeploymentStore();

  // 3. Create deployment record
  let deployment;
  try {
    deployment = await store.create({
      agent_passport_id: passportId,
      provider: input.target,
      runtime_adapter: 'user-image',
      descriptor_snapshot: {
        image: input.image,
        port: input.port ?? DEFAULT_PORT,
        verification,
      },
      created_by: input.owner,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Launch] Failed to create deployment record: ${msg}`);
    return { success: false, passport_id: passportId, reputation_eligible: reputationEligible, error: msg };
  }

  const deploymentId = deployment.deployment_id;
  let currentVersion = deployment.version;

  // 4. Transition to 'deploying'
  try {
    const updated = await store.transition(deploymentId, 'deploying', currentVersion, { actor: input.owner });
    currentVersion = updated.version;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Launch] Failed to transition to deploying: ${msg}`);
    return { success: false, passport_id: passportId, deployment_id: deploymentId, reputation_eligible: reputationEligible, error: msg };
  }

  // 5. Build env vars
  const lucidEnv = buildLucidEnvVars({
    passportId,
    verification,
    extra: input.env_vars,
  });

  // 6. Create ImageDeployInput and call deployer
  const imageInput: ImageDeployInput = {
    image: input.image,
    env_vars: lucidEnv,
    port: input.port ?? DEFAULT_PORT,
    verification,
    ...(input.registry_auth ? { registry_auth: input.registry_auth } : {}),
  };

  const deployer = getDeployer(input.target);

  try {
    const result = await deployer.deploy(imageInput, { target: { type: input.target } }, passportId);

    if (!result.success) {
      // Deploy failed — transition to failed
      try {
        await store.transition(deploymentId, 'failed', currentVersion, {
          actor: 'system',
          error: result.error,
        });
      } catch (transErr) {
        logger.error(`[Launch] Failed to transition to failed: ${transErr instanceof Error ? transErr.message : String(transErr)}`);
      }
      return {
        success: false,
        passport_id: passportId,
        deployment_id: deploymentId,
        verification_mode: verification,
        reputation_eligible: reputationEligible,
        error: result.error ?? 'Deployment failed',
      };
    }

    // 7a. Update provider resources
    await store.updateProviderResources(deploymentId, {
      provider_deployment_id: result.deployment_id,
      deployment_url: result.url,
      provider_status: result.metadata?.status as string | undefined,
    });

    // 7b. Determine final state: Docker returns 'prepared' (not actually running)
    const isPrepared = result.metadata?.requires_manual_start === true;
    if (!isPrepared) {
      const updated = await store.transition(deploymentId, 'running', currentVersion, { actor: 'system' });
      currentVersion = updated.version;
    }
    // If Docker/prepared, stay in 'deploying' — user must start manually

    // 7c. Append success event
    await store.appendEvent({
      deployment_id: deploymentId,
      event_type: 'succeeded',
      actor: 'system',
      metadata: {
        target: input.target,
        image: input.image,
        provider_deployment_id: result.deployment_id,
        url: result.url,
        prepared: isPrepared,
      },
    });

    logger.info(`[Launch] Deployment ${deploymentId} succeeded for passport ${passportId} (${isPrepared ? 'prepared' : 'running'})`);

    return {
      success: true,
      passport_id: passportId,
      deployment_id: deploymentId,
      deployment_url: result.url,
      verification_mode: verification,
      reputation_eligible: reputationEligible,
    };
  } catch (err) {
    // 8. Deploy threw — transition to failed
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Launch] Deployer threw: ${msg}`);

    try {
      await store.transition(deploymentId, 'failed', currentVersion, {
        actor: 'system',
        error: msg,
      });
    } catch (transErr) {
      logger.error(`[Launch] Failed to transition to failed after error: ${transErr instanceof Error ? transErr.message : String(transErr)}`);
    }

    return {
      success: false,
      passport_id: passportId,
      deployment_id: deploymentId,
      verification_mode: verification,
      reputation_eligible: reputationEligible,
      error: msg,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Path B: Base Runtime (no-code)                                    */
/* ------------------------------------------------------------------ */

export async function launchBaseRuntime(input: LaunchBaseRuntimeInput): Promise<LaunchResult> {
  // 1. Validate input
  const validationError = validateBaseRuntimeInput(input);
  if (validationError) {
    return { success: false, reputation_eligible: false, error: validationError };
  }

  const tools = input.tools ?? [];
  const runtimeVersion = input.runtime_version ?? DEFAULT_RUNTIME_VERSION;

  // 2. Compute config_hash = SHA-256(model + prompt + tools + version).slice(0,16)
  const hashInput = JSON.stringify({
    model: input.model,
    prompt: input.prompt,
    tools,
    version: runtimeVersion,
  });
  const configHash = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 16);

  // 3. Build base runtime env vars
  const baseEnv = buildBaseRuntimeEnvVars({
    model: input.model,
    prompt: input.prompt,
    tools,
    configHash,
  });

  // 4. Call launchImage with the base runtime image and full verification
  const image = `${BASE_RUNTIME_IMAGE}:${runtimeVersion}`;
  const result = await launchImage({
    image,
    target: input.target,
    owner: input.owner,
    name: input.name,
    env_vars: baseEnv,
    verification: 'full',
  });

  // 5. Return result with config_hash appended
  return {
    ...result,
    config_hash: configHash,
  };
}
