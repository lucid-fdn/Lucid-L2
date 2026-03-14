export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokens_used: number;
}

export interface IEmbeddingProvider {
  embed(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
  readonly dimensions: number;
  readonly modelName: string;
}
