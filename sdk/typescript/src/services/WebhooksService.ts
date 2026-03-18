/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class WebhooksService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Receive deployment webhook
     * Receive and normalize provider-specific deployment webhooks (Railway, Akash,
     * Phala, io.net, Nosana). The provider path parameter selects the appropriate
     * normalizer. Webhook payloads are converted into deployment events.
     *
     * @param provider Deployment provider name
     * @param requestBody
     * @returns any Webhook processed
     * @throws ApiError
     */
    public lucidReceiveDeploymentWebhook(
        provider: 'railway' | 'akash' | 'phala' | 'ionet' | 'nosana',
        requestBody: Record<string, any>,
    ): CancelablePromise<{
        success: boolean;
        event_id?: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/webhooks/{provider}',
            path: {
                'provider': provider,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
}
