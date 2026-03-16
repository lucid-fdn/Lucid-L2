// offchain/packages/engine/src/deployment/webhooks/normalizers/ionet.ts
// io.net webhook normalizer

import type { IProviderNormalizer, NormalizedProviderEvent } from '../types';

export class IoNetNormalizer implements IProviderNormalizer {
  normalize(body: unknown, _headers: Record<string, string>): NormalizedProviderEvent {
    const payload = body as Record<string, unknown>;

    return {
      provider: 'ionet',
      provider_deployment_id: String(payload.cluster_id || payload.deployment_id || payload.id || ''),
      provider_status: String(payload.status || payload.state || 'unknown'),
      provider_status_detail: typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)
        : {},
      timestamp: typeof payload.timestamp === 'number'
        ? payload.timestamp
        : Date.now(),
      deployment_url: typeof payload.endpoint === 'string'
        ? payload.endpoint
        : typeof payload.url === 'string'
          ? payload.url
          : undefined,
    };
  }
}
