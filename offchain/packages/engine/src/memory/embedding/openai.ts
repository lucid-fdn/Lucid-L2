import type { IEmbeddingProvider, EmbeddingResult } from './interface';

export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  readonly dimensions = 1536;
  readonly modelName = 'text-embedding-3-small';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) throw new Error('OPENAI_API_KEY required for embedding provider');
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.modelName, input: texts }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Embedding API error ${response.status}: ${err}`);
    }
    const data = await response.json();
    return data.data.map((d: any) => ({
      embedding: d.embedding,
      model: this.modelName,
      tokens_used: data.usage?.total_tokens || 0,
    }));
  }
}
