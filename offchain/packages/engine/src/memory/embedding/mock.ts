import { createHash } from 'crypto';
import type { IEmbeddingProvider, EmbeddingResult } from './interface';

export class MockEmbeddingProvider implements IEmbeddingProvider {
  readonly dimensions = 1536;
  readonly modelName = 'mock-embedding-v1';

  async embed(text: string): Promise<EmbeddingResult> {
    return {
      embedding: this.deterministicVector(text),
      model: this.modelName,
      tokens_used: text.split(/\s+/).length,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  private deterministicVector(text: string): number[] {
    const hash = createHash('sha256').update(text).digest();
    const vec = new Float32Array(this.dimensions);
    for (let i = 0; i < this.dimensions; i++) {
      vec[i] = (hash[i % 32] / 255) * 2 - 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    for (let i = 0; i < this.dimensions; i++) vec[i] /= norm;
    return Array.from(vec);
  }
}
