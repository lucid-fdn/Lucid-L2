/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ConfigurePayoutRequest } from '../models/ConfigurePayoutRequest';
import type { ConfigurePolicyRequest } from '../models/ConfigurePolicyRequest';
import type { InstallModuleRequest } from '../models/InstallModuleRequest';
import type { ListModulesResponse } from '../models/ListModulesResponse';
import type { SuccessResponse } from '../models/SuccessResponse';
import type { UninstallModuleRequest } from '../models/UninstallModuleRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ModulesService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Install module on smart account
     * Install an ERC-7579 module (policy, payout, or receipt) on a smart account. The module type and initialization data must be provided in the request body.
     *
     * @param requestBody
     * @returns SuccessResponse Module installed
     * @throws ApiError
     */
    public lucidInstallModule(
        requestBody: InstallModuleRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/modules/install',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Uninstall module from smart account
     * Uninstall an ERC-7579 module from a smart account. Requires the module address and type to identify which module to remove.
     *
     * @param requestBody
     * @returns SuccessResponse Module uninstalled
     * @throws ApiError
     */
    public lucidUninstallModule(
        requestBody: UninstallModuleRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/modules/uninstall',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Configure policy module
     * Configure allowed policy hashes on the LucidPolicyModule. Only transactions matching an allowed policy hash will be permitted by the module.
     *
     * @param requestBody
     * @returns SuccessResponse Policy configured
     * @throws ApiError
     */
    public lucidConfigurePolicyModule(
        requestBody: ConfigurePolicyRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/modules/policy/configure',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Configure payout module
     * Configure the revenue split percentages on the LucidPayoutModule. Sets the basis-point allocations for compute, model, and protocol recipients.
     *
     * @param requestBody
     * @returns SuccessResponse Payout configured
     * @throws ApiError
     */
    public lucidConfigurePayoutModule(
        requestBody: ConfigurePayoutRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/modules/payout/configure',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * List installed modules
     * List all ERC-7579 modules installed on a smart account, including module type, address, and configuration status for each.
     *
     * @param chainId EVM chain identifier for the smart account
     * @param account Smart account address (EVM 0x format)
     * @returns ListModulesResponse Installed modules
     * @throws ApiError
     */
    public lucidListModules(
        chainId: string,
        account: string,
    ): CancelablePromise<ListModulesResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/modules/{chainId}/{account}',
            path: {
                'chainId': chainId,
                'account': account,
            },
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
}
