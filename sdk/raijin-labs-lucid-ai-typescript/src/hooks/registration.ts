import { Hooks, SDKInitHook, BeforeRequestHook, BeforeRequestContext } from "./types.js";
import { SDKOptions } from "../lib/config.js";

/**
 * Injects a default `chainId` into JSON request bodies for v2 endpoints.
 * The chain value is read from the SDK options at init time.
 */
class DefaultChainHook implements SDKInitHook, BeforeRequestHook {
  private chain: string | undefined;

  sdkInit(opts: SDKOptions): SDKOptions {
    // Read chain from extra options (passed via createLucidSDK)
    this.chain = (opts as Record<string, unknown>)["chain"] as string | undefined;
    return opts;
  }

  async beforeRequest(
    _hookCtx: BeforeRequestContext,
    request: Request,
  ): Promise<Request> {
    if (!this.chain) return request;

    // Only inject for POST/PATCH with JSON body on v2 endpoints
    const method = request.method.toUpperCase();
    if ((method !== "POST" && method !== "PATCH") || !request.url.includes("/v2/")) {
      return request;
    }

    try {
      const body = await request.clone().text();
      if (!body) return request;
      const json = JSON.parse(body);

      // Don't override if chainId already set
      if (!json.chainId) {
        json.chainId = this.chain;
        return new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(json),
          signal: request.signal,
        });
      }
    } catch {
      // Not JSON or parse error — pass through
    }

    return request;
  }
}

export function initHooks(hooks: Hooks) {
  const chainHook = new DefaultChainHook();
  hooks.registerSDKInitHook(chainHook);
  hooks.registerBeforeRequestHook(chainHook);
}
