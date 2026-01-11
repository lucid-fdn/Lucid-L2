// @lucidlayer/sdk - Main Entry Point
// TypeScript SDK for LucidLayer - Decentralized AI Compute Orchestration

// Export main client
export { LucidClient, createClient } from './client';

// Export types
export * from './types';

// Export modules (for advanced usage)
export { PassportModule } from './modules/passports';
export { SearchModule } from './modules/search';
export { MatchModule } from './modules/match';
export { RunModule } from './modules/run';
export { ReceiptModule } from './modules/receipts';

// Default export
export { LucidClient as default } from './client';
