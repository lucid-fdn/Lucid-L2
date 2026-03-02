/**
 * Vercel AI SDK provider for Lucid.
 *
 * Re-exports from @lucid/sdk/ai for convenience.
 *
 * @example
 * ```typescript
 * import { createLucidProvider } from '@lucid/ai';
 * import { streamText } from 'ai';
 *
 * const lucid = createLucidProvider({ apiKey: 'lk_live_...' });
 *
 * const result = streamText({
 *   model: lucid('deepseek-v3'),
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
 * ```
 */

export { createLucidProvider, lucid } from '@lucid/sdk/ai';
export type { LucidProviderSettings } from '@lucid/sdk/ai';
