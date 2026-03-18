// offchain/packages/engine/src/deployment/webhooks/handler.ts
// WebhookHandler — normalize provider callbacks, update store, enqueue reconcile

import type { IDeploymentStore } from '../store/store';
import { getNormalizer } from './normalizers';

export interface WebhookResult {
  success: boolean;
  warning?: string;
}

/**
 * WebhookHandler processes provider callback payloads.
 * Business logic only -- not a route handler.
 *
 * Flow: normalize -> lookup -> update store -> enqueue reconcile
 * Never throws after validation -- always returns success for provider.
 */
export class WebhookHandler {
  constructor(private store: IDeploymentStore) {}

  async handle(
    provider: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<WebhookResult> {
    // 1. Get normalizer
    const normalizer = getNormalizer(provider);
    if (!normalizer) {
      return { success: false, warning: `Unknown provider: ${provider}` };
    }

    // 2. Normalize payload
    const event = normalizer.normalize(body, headers);

    if (!event.provider_deployment_id) {
      return { success: false, warning: 'Missing provider_deployment_id' };
    }

    // 3. Look up deployment
    const deployment = await this.store.getByProviderDeploymentId(provider, event.provider_deployment_id);
    if (!deployment) {
      return { success: true, warning: 'Deployment not found' };
    }

    // 4. Update provider status
    await this.store.updateProviderResources(deployment.deployment_id, {
      provider_status: event.provider_status,
      provider_status_detail: event.provider_status_detail,
    });

    // 5. Append event (with idempotency key to prevent duplicates)
    const idempotencyKey = `webhook:${provider}:${event.provider_deployment_id}:${event.timestamp}`;
    await this.store.appendEvent({
      deployment_id: deployment.deployment_id,
      event_type: 'health_changed',
      actor: `webhook:${provider}`,
      previous_state: deployment.actual_state,
      new_state: deployment.actual_state,
      metadata: {
        provider_status: event.provider_status,
        raw: event.provider_status_detail,
      },
      idempotency_key: idempotencyKey,
    });

    // 6. Mark for reconciliation (enqueue, don't execute inline)
    await this.store.appendEvent({
      deployment_id: deployment.deployment_id,
      event_type: 'health_changed',
      actor: `webhook:${provider}`,
      metadata: { reconcile_requested: true },
    });

    return { success: true };
  }
}
