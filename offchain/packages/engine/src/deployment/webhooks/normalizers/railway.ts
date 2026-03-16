// offchain/packages/engine/src/deployment/webhooks/normalizers/railway.ts
// Railway webhook normalizer

import type { IProviderNormalizer, NormalizedProviderEvent } from '../types';

export class RailwayNormalizer implements IProviderNormalizer {
  normalize(body: unknown, _headers: Record<string, string>): NormalizedProviderEvent {
    const payload = body as Record<string, unknown>;
    const service = payload.service as Record<string, unknown> | undefined;

    return {
      provider: 'railway',
      provider_deployment_id: String(service?.id || payload.serviceId || payload.deployment_id || ''),
      provider_status: String(payload.status || payload.deploymentStatus || 'unknown'),
      provider_status_detail: typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)
        : {},
      timestamp: typeof payload.timestamp === 'number'
        ? payload.timestamp
        : Date.now(),
      deployment_url: typeof payload.url === 'string' ? payload.url : undefined,
    };
  }
}
