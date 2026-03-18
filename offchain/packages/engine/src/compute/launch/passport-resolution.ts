import { getPassportManager } from '../../identity/passport/passportManager';
import { logger } from '../../shared/lib/logger';

export async function resolvePassport(opts: {
  passport_id?: string;
  owner: string;
  name: string;
  target: string;
}): Promise<{ ok: true; passport_id: string } | { ok: false; error: string }> {
  if (opts.passport_id) {
    return { ok: true, passport_id: opts.passport_id };
  }

  const pm = getPassportManager();
  const result = await pm.createPassport({
    type: 'agent',
    owner: opts.owner,
    name: opts.name,
    metadata: {
      agent_config: {
        system_prompt: `Agent: ${opts.name}`,
        model_passport_id: 'user-provided',
      },
      deployment_config: {
        target: { type: opts.target },
      },
    },
  });

  if (!result.ok || !result.data) {
    return { ok: false, error: `Passport creation failed: ${result.error}` };
  }

  logger.info(`[Launch] Passport created: ${result.data.passport_id}`);
  return { ok: true, passport_id: result.data.passport_id };
}
