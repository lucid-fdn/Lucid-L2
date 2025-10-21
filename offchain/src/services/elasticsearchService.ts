// offchain/src/services/elasticsearchService.ts
import { Client } from '@elastic/elasticsearch';

export interface ElasticsearchConfig {
  enabled: boolean;
  host: string;
  port: number;
  indexPrefix: string;
}

export interface N8nNode {
  name: string;
  displayName: string;
  description?: string;
  version: number;
  group: string[];
  icon?: string;
  iconUrl?: string;
  codex?: {
    categories?: string[];
    subcategories?: string[];
    resources?: {
      primaryDocumentation?: Array<{ url: string }>;
    };
  };
  credentials?: Array<{ name: string; required?: boolean }>;
  usableAsTool?: boolean;
  inputs?: string[];
  outputs?: string[];
  properties?: any[];
  defaults?: any;
}

export interface SearchResult {
  node: N8nNode;
  score: number;
  highlight?: {
    displayName?: string[];
    description?: string[];
  };
}

export interface SearchResponse {
  total: number;
  results: SearchResult[];
  facets: {
    categories: Record<string, number>;
    credentials: Record<string, number>;
    codexCategories?: Record<string, number>;
  };
  executionTimeMs: number;
}

export class ElasticsearchService {
  private client: Client | null = null;
  private config: ElasticsearchConfig;
  private enabled: boolean;

  constructor(config: Partial<ElasticsearchConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? process.env.ELASTICSEARCH_ENABLED === 'true',
      host: config.host ?? process.env.ELASTICSEARCH_HOST ?? 'elasticsearch',
      port: config.port ?? parseInt(process.env.ELASTICSEARCH_PORT ?? '9200'),
      indexPrefix: config.indexPrefix ?? 'lucid-n8n',
    };

    this.enabled = this.config.enabled;

    if (this.enabled) {
      this.initializeClient();
    }
  }

  private initializeClient(): void {
    try {
      this.client = new Client({
        node: `http://${this.config.host}:${this.config.port}`,
        requestTimeout: 30000,
      });

      // Test connection
      this.client.ping().then(
        () => {
          console.log('✅ Connected to Elasticsearch');
          this.ensureIndices().catch(err => {
            console.error('Failed to ensure indices:', err);
          });
        },
        (error) => {
          console.warn('⚠️  Elasticsearch ping failed, disabling:', error.message);
          this.enabled = false;
          this.client = null;
        }
      );
    } catch (error) {
      console.warn('⚠️  Failed to initialize Elasticsearch:', error);
      this.enabled = false;
      this.client = null;
    }
  }

  public isAvailable(): boolean {
    return this.enabled && this.client !== null;
  }

  private getIndexName(type: string = 'nodes'): string {
    return `${this.config.indexPrefix}-${type}`;
  }

  private async ensureIndices(): Promise<void> {
    if (!this.client) return;

    const indexName = this.getIndexName('nodes');

    try {
      const exists = await this.client.indices.exists({ index: indexName });

      if (!exists) {
        await this.client.indices.create({
          index: indexName,
          mappings: {
            dynamic: false,
            properties: {
              name: { type: 'keyword' },
              displayName: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword' },
                },
              },
              description: { type: 'text' },
              version: { type: 'integer' },
              group: { type: 'keyword' },
              icon: { type: 'keyword' },
              subtitle: { type: 'text' },
              'codex.categories': { type: 'keyword' },
              'credentials.name': { type: 'keyword' },
            },
          },
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            analysis: {
              analyzer: {
                n8n_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'asciifolding'],
                },
              },
            },
          },
        });

        console.log(`✅ Created Elasticsearch index: ${indexName}`);
      }
    } catch (error) {
      console.error(`Failed to ensure index ${indexName}:`, error);
    }
  }

  async indexNode(node: N8nNode): Promise<void> {
    if (!this.isAvailable()) return;

    const indexName = this.getIndexName('nodes');

    try {
      await this.client!.index({
        index: indexName,
        id: node.name,
        document: node,
      });
    } catch (error) {
      console.error(`Error indexing node ${node.name}:`, error);
    }
  }

  async bulkIndexNodes(nodes: N8nNode[]): Promise<{ success: number; failed: number }> {
    if (!this.isAvailable() || nodes.length === 0) {
      return { success: 0, failed: 0 };
    }

    const indexName = this.getIndexName('nodes');
    const operations = nodes.flatMap(node => [
      { index: { _index: indexName, _id: node.name } },
      node,
    ]);

    try {
      const response = await this.client!.bulk({
        operations,
        refresh: true,
      });

      // Check for errors in bulk response
      let success = 0;
      let failed = 0;

      if (response.items) {
        response.items.forEach((item: any) => {
          if (item.index) {
            if (item.index.error) {
              failed++;
              console.error(`Failed to index ${item.index._id}:`, item.index.error);
            } else {
              success++;
            }
          }
        });
      }

      console.log(`📊 Bulk indexed ${success} nodes, ${failed} failed`);

      if (failed > 0 && success === 0) {
        console.error('All bulk indexing operations failed. Response:', JSON.stringify(response.items?.slice(0, 2), null, 2));
      }

      return { success, failed };
    } catch (error) {
      console.error('Error bulk indexing nodes:', error);
      return { success: 0, failed: nodes.length };
    }
  }

  async searchNodes(options: {
    query?: string;
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
    usableAsTool?: boolean;
    codexCategory?: string;
    credentialName?: string;
  }): Promise<SearchResponse> {
    if (!this.isAvailable()) {
      return {
        total: 0,
        results: [],
        facets: { categories: {}, credentials: {} },
        executionTimeMs: 0,
      };
    }

    const startTime = Date.now();
    const indexName = this.getIndexName('nodes');

    const {
      query = '',
      category,
      search,
      limit = 100,
      offset = 0,
      usableAsTool,
      codexCategory,
      credentialName,
    } = options;

    const searchQuery = search || query;

    // Build Elasticsearch query
    const mustClauses: any[] = [];
    const filterClauses: any[] = [];

    // Search query across multiple fields (including codex categories and credentials)
    if (searchQuery) {
      mustClauses.push({
        multi_match: {
          query: searchQuery,
          fields: [
            'displayName^3',
            'name^2',
            'description',
            'codex.categories^1.5',
            'credentials.name'
          ],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      });
    }

    // Category filter (node group)
    if (category) {
      filterClauses.push({
        term: { group: category },
      });
    }

    // Codex category filter
    if (codexCategory) {
      filterClauses.push({
        term: { 'codex.categories': codexCategory },
      });
    }

    // Credential name filter
    if (credentialName) {
      filterClauses.push({
        term: { 'credentials.name': credentialName },
      });
    }

    // Usable as tool filter (removed - field is complex)

    const searchBody: any = {
      query: {
        bool: {
          must: mustClauses.length > 0 ? mustClauses : [{ match_all: {} }],
          filter: filterClauses,
        },
      },
      from: offset,
      size: limit,
      highlight: {
        fields: {
          displayName: {},
          description: {},
        },
      },
      aggs: {
        categories: {
          terms: {
            field: 'group',
            size: 100,
          },
        },
        codexCategories: {
          terms: {
            field: 'codex.categories',
            size: 50,
          },
        },
        credentials: {
          terms: {
            field: 'credentials.name',
            size: 50,
          },
        },
      },
    };

    try {
      const response = await this.client!.search({
        index: indexName,
        body: searchBody,
      });

      const results: SearchResult[] = response.hits.hits.map((hit: any) => ({
        node: hit._source as N8nNode,
        score: hit._score || 0,
        highlight: hit.highlight,
      }));

      // Extract facets
      const categoriesAgg = response.aggregations?.categories as any;
      const codexCategoriesAgg = response.aggregations?.codexCategories as any;
      const credentialsAgg = response.aggregations?.credentials as any;

      const categories: Record<string, number> = {};
      if (categoriesAgg?.buckets) {
        categoriesAgg.buckets.forEach((bucket: any) => {
          categories[bucket.key] = bucket.doc_count;
        });
      }

      const codexCategories: Record<string, number> = {};
      if (codexCategoriesAgg?.buckets) {
        codexCategoriesAgg.buckets.forEach((bucket: any) => {
          codexCategories[bucket.key] = bucket.doc_count;
        });
      }

      const credentials: Record<string, number> = {};
      if (credentialsAgg?.buckets) {
        credentialsAgg.buckets.forEach((bucket: any) => {
          credentials[bucket.key] = bucket.doc_count;
        });
      }

      const executionTimeMs = Date.now() - startTime;

      return {
        total: (response.hits.total as any).value || 0,
        results,
        facets: { categories, credentials, codexCategories },
        executionTimeMs,
      };
    } catch (error) {
      console.error('Elasticsearch search error:', error);
      return {
        total: 0,
        results: [],
        facets: { categories: {}, credentials: {} },
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  async deleteIndex(): Promise<void> {
    if (!this.isAvailable()) return;

    const indexName = this.getIndexName('nodes');

    try {
      const exists = await this.client!.indices.exists({ index: indexName });
      if (exists) {
        await this.client!.indices.delete({ index: indexName });
        console.log(`🗑️  Deleted index: ${indexName}`);
      }
    } catch (error) {
      console.error(`Error deleting index ${indexName}:`, error);
    }
  }

  async refreshIndex(): Promise<void> {
    if (!this.isAvailable()) return;

    const indexName = this.getIndexName('nodes');

    try {
      await this.client!.indices.refresh({ index: indexName });
    } catch (error) {
      console.error('Error refreshing index:', error);
    }
  }

  async getStats(): Promise<{
    enabled: boolean;
    nodeCount?: number;
    indexSize?: string;
  }> {
    if (!this.isAvailable()) {
      return { enabled: false };
    }

    const indexName = this.getIndexName('nodes');

    try {
      const count = await this.client!.count({ index: indexName });
      const stats = await this.client!.indices.stats({ index: indexName });

      const size = stats.indices?.[indexName]?.total?.store?.size;
      return {
        enabled: true,
        nodeCount: count.count,
        indexSize: typeof size === 'string' ? size : String(size || '0b'),
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return { enabled: true };
    }
  }
}

// Singleton instance
let elasticsearchService: ElasticsearchService | null = null;

export function getElasticsearchService(): ElasticsearchService {
  if (!elasticsearchService) {
    elasticsearchService = new ElasticsearchService();
  }
  return elasticsearchService;
}
