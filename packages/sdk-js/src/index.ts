/**
 * @lucidlayer/sdk - Main Entry Point
 * TypeScript SDK for LucidLayer - Decentralized AI Compute Orchestration
 *
 * @deprecated This package is deprecated. Use `@lucid-l2/sdk` instead for the
 * embeddable SDK, or the hosted API via platform-core.
 * See https://github.com/raijinlabs/Lucid-L2 for migration details.
 */

/** @deprecated Use `@lucid-l2/sdk` instead. */
export { LucidClient, createClient } from './client';

// Export types
export * from './types';

// Export modules (for advanced usage)
/** @deprecated Use `@lucid-l2/sdk` instead. */
export { PassportModule } from './modules/passports';
/** @deprecated Use `@lucid-l2/sdk` instead. */
export { SearchModule } from './modules/search';
/** @deprecated Use `@lucid-l2/sdk` instead. */
export { MatchModule } from './modules/match';
/** @deprecated Use `@lucid-l2/sdk` instead. */
export { RunModule } from './modules/run';
/** @deprecated Use `@lucid-l2/sdk` instead. */
export { ReceiptModule } from './modules/receipts';

/** @deprecated Use `@lucid-l2/sdk` instead. */
export { LucidClient as default } from './client';
