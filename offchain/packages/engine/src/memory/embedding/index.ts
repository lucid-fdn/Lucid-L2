import type { IEmbeddingProvider } from './interface';

export function getEmbeddingProvider(): IEmbeddingProvider | null {
  const provider = process.env.MEMORY_EMBEDDING_PROVIDER || 'none';
  switch (provider) {
    case 'openai': {
      const { OpenAIEmbeddingProvider } = require('./openai');
      return new OpenAIEmbeddingProvider();
    }
    case 'mock': {
      const { MockEmbeddingProvider } = require('./mock');
      return new MockEmbeddingProvider();
    }
    case 'none':
      return null;
    default:
      throw new Error(`Unknown MEMORY_EMBEDDING_PROVIDER: ${provider}`);
  }
}

export type { IEmbeddingProvider, EmbeddingResult } from './interface';
export { MockEmbeddingProvider } from './mock';
export { OpenAIEmbeddingProvider } from './openai';
export { EmbeddingWorker } from './worker';
export type { EmbeddingWorkerConfig } from './worker';
