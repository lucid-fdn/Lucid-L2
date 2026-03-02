// offchain/src/services/n8nNodeIndexer.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { setMaxListeners } from 'events';
import { getElasticsearchService, N8nNode } from './elasticsearchService';

const execAsync = promisify(exec);

// Increase EventEmitter max listeners to prevent warnings during concurrent operations
setMaxListeners(50);

interface EnrichmentData {
  name: string;
  description: string;
  usableAsTool: boolean;
  popularityScore: number;
  tags: string[];
}

interface EnrichmentFile {
  categories: Record<string, EnrichmentData[]>;
  Other?: EnrichmentData[];
}

export interface IndexingResult {
  success: boolean;
  totalNodes: number;
  indexed: number;
  failed: number;
  executionTimeMs: number;
  error?: string;
}

export class N8nNodeIndexer {
  private isIndexing = false;
  private lastIndexTime: Date | null = null;
  private lastIndexAttempt: Date | null = null;
  private cachedNodes: N8nNode[] = [];
  private enrichmentMap: Map<string, EnrichmentData> | null = null;
  private readonly COOLDOWN_MS = 5000; // 5 second cooldown between reindex attempts

  /**
   * Load and parse the enrichment JSON file
   */
  private async loadEnrichmentData(): Promise<Map<string, EnrichmentData>> {
    if (this.enrichmentMap) {
      return this.enrichmentMap;
    }

    try {
      const enrichmentPath = join(__dirname, '../data/n8n-nodes-enrichment.json');
      console.log('📚 Loading node enrichment data from:', enrichmentPath);
      
      const fileContent = await readFile(enrichmentPath, 'utf-8');
      const enrichmentFile: EnrichmentFile = JSON.parse(fileContent);

      // Build a map for fast lookup by node name
      const map = new Map<string, EnrichmentData>();

      // Process all categories
      for (const [category, nodes] of Object.entries(enrichmentFile.categories)) {
        for (const node of nodes) {
          map.set(node.name, node);
        }
      }

      // Process "Other" category if it exists
      if (enrichmentFile.Other) {
        for (const node of enrichmentFile.Other) {
          map.set(node.name, node);
        }
      }

      this.enrichmentMap = map;
      console.log(`✅ Loaded enrichment data for ${map.size} nodes`);
      
      return map;
    } catch (error) {
      console.warn('⚠️  Failed to load enrichment data, continuing without it:', error);
      this.enrichmentMap = new Map();
      return this.enrichmentMap;
    }
  }

  /**
   * Mask n8n references in icon URLs
   */
  private maskIconUrl(iconUrl?: string | { light: string; dark: string }): string | { light: string; dark: string } | undefined {
    if (!iconUrl) {
      return iconUrl;
    }

    const maskPath = (path: string): string => {
      // Handle multiple n8n icon path patterns:
      // 1. "icons/@n8n/n8n-nodes-langchain/..." -> "nodes-langchain/..."
      // 2. "icons/n8n-nodes-base/..." -> "nodes-base/..."
      return path
        .replace(/^icons\/@n8n\/n8n-/, '')  // Pattern 1: @n8n scoped packages
        .replace(/^icons\/n8n-/, '');        // Pattern 2: plain n8n- prefixed packages
    };

    if (typeof iconUrl === 'string') {
      return maskPath(iconUrl);
    }

    return {
      light: maskPath(iconUrl.light),
      dark: maskPath(iconUrl.dark),
    };
  }

  /**
   * Merge enrichment data into a node
   */
  private enrichNode(node: N8nNode, enrichmentData?: EnrichmentData): N8nNode {
    if (!enrichmentData) {
      // Still mask icon URLs even without enrichment
      return {
        ...node,
        iconUrl: this.maskIconUrl(node.iconUrl) as any,
      };
    }

    return {
      ...node,
      description: enrichmentData.description || node.description,
      usableAsTool: enrichmentData.usableAsTool,
      popularityScore: enrichmentData.popularityScore,
      tags: enrichmentData.tags,
      iconUrl: this.maskIconUrl(node.iconUrl) as any,
    };
  }

  /**
   * Fetch all n8n nodes using the Docker CLI command
   */
  async fetchNodesFromCLI(): Promise<N8nNode[]> {
    console.log('🔍 Fetching n8n nodes from CLI...');

    try {
      // Use n8n's export:nodes command to get ALL node types
      const { stdout } = await execAsync(
        'docker exec lucid-n8n n8n export:nodes --output=/tmp/nodes.json && docker exec lucid-n8n cat /tmp/nodes.json',
        { maxBuffer: 50 * 1024 * 1024 } // 50MB buffer for large JSON
      );

      // Parse the JSON output (skip CLI output lines, find JSON array)
      const jsonMatch = stdout.match(/(\[[\s\S]*\])/);
      if (!jsonMatch) {
        throw new Error('Failed to parse nodes JSON from CLI output');
      }

      const allNodes = JSON.parse(jsonMatch[1]) as any[];
      console.log(`✅ Fetched ${allNodes.length} n8n node entries from CLI`);

      // Filter to only get the default version of each node
      // n8n exports multiple versions of the same node - we only want the latest/default
      const nodeMap = new Map<string, any>();
      
      for (const node of allNodes) {
        const nodeName = node.name;
        
        // If node has defaultVersion, only keep that version
        if (node.defaultVersion !== undefined) {
          const existingNode = nodeMap.get(nodeName);
          
          // Keep this node if:
          // 1. We haven't seen this node name before, OR
          // 2. This node's version matches defaultVersion
          if (!existingNode || node.version === node.defaultVersion) {
            nodeMap.set(nodeName, node);
          }
        } else {
          // No defaultVersion specified, keep first occurrence
          if (!nodeMap.has(nodeName)) {
            nodeMap.set(nodeName, node);
          }
        }
      }

      const filteredNodes = Array.from(nodeMap.values()) as N8nNode[];
      console.log(`📦 Filtered to ${filteredNodes.length} unique nodes (removed duplicate versions)`);

      // Load enrichment data and merge with nodes
      const enrichmentMap = await this.loadEnrichmentData();
      
      let enrichedCount = 0;
      const enrichedNodes = filteredNodes.map(node => {
        const enrichmentData = enrichmentMap.get(node.displayName);
        if (enrichmentData) {
          enrichedCount++;
          return this.enrichNode(node, enrichmentData);
        }
        return node;
      });

      console.log(`🎨 Enriched ${enrichedCount} nodes with enhanced descriptions, popularity scores, and tags`);

      return enrichedNodes;
    } catch (error) {
      console.error('Error fetching nodes from CLI:', error);
      throw new Error(`Failed to fetch nodes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Index all n8n nodes into Elasticsearch
   */
  async indexNodes(forceRefresh: boolean = false): Promise<IndexingResult> {
    // Check if indexing is already in progress
    if (this.isIndexing) {
      return {
        success: false,
        totalNodes: 0,
        indexed: 0,
        failed: 0,
        executionTimeMs: 0,
        error: 'Indexing already in progress',
      };
    }

    // Check cooldown period to prevent rapid consecutive reindex attempts
    if (!forceRefresh && this.lastIndexAttempt) {
      const timeSinceLastAttempt = Date.now() - this.lastIndexAttempt.getTime();
      if (timeSinceLastAttempt < this.COOLDOWN_MS) {
        return {
          success: false,
          totalNodes: 0,
          indexed: 0,
          failed: 0,
          executionTimeMs: 0,
          error: `Cooldown period active. Please wait ${Math.ceil((this.COOLDOWN_MS - timeSinceLastAttempt) / 1000)}s before reindexing again.`,
        };
      }
    }

    const startTime = Date.now();
    this.isIndexing = true;
    this.lastIndexAttempt = new Date();

    try {
      const esService = getElasticsearchService();

      if (!esService.isAvailable()) {
        throw new Error('Elasticsearch is not available');
      }

      // Fetch nodes from CLI or use cached version
      let nodes: N8nNode[];
      if (forceRefresh || this.cachedNodes.length === 0) {
        nodes = await this.fetchNodesFromCLI();
        this.cachedNodes = nodes;
      } else {
        nodes = this.cachedNodes;
        console.log(`📦 Using cached nodes (${nodes.length} total)`);
      }

      // Bulk index nodes
      const { success, failed } = await esService.bulkIndexNodes(nodes);

      // Refresh index to make changes immediately searchable
      await esService.refreshIndex();

      this.lastIndexTime = new Date();
      const executionTimeMs = Date.now() - startTime;

      console.log(`✅ Indexing complete: ${success} success, ${failed} failed in ${executionTimeMs}ms`);

      return {
        success: true,
        totalNodes: nodes.length,
        indexed: success,
        failed,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      console.error('Error indexing nodes:', error);

      return {
        success: false,
        totalNodes: 0,
        indexed: 0,
        failed: 0,
        executionTimeMs,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      // Always reset indexing flag, even on error
      this.isIndexing = false;
    }
  }

  /**
   * Get cached nodes without re-fetching
   */
  getCachedNodes(): N8nNode[] {
    return this.cachedNodes;
  }

  /**
   * Clear cached nodes
   */
  clearCache(): void {
    this.cachedNodes = [];
  }

  /**
   * Get indexing status
   */
  getStatus(): {
    isIndexing: boolean;
    lastIndexTime: Date | null;
    lastIndexAttempt: Date | null;
    cachedNodesCount: number;
    cooldownRemaining: number;
  } {
    const cooldownRemaining = this.lastIndexAttempt
      ? Math.max(0, this.COOLDOWN_MS - (Date.now() - this.lastIndexAttempt.getTime()))
      : 0;

    return {
      isIndexing: this.isIndexing,
      lastIndexTime: this.lastIndexTime,
      lastIndexAttempt: this.lastIndexAttempt,
      cachedNodesCount: this.cachedNodes.length,
      cooldownRemaining,
    };
  }

  /**
   * Check if nodes need reindexing (e.g., if cache is stale)
   */
  needsReindex(maxAgeMinutes: number = 60): boolean {
    if (!this.lastIndexTime) {
      return true;
    }

    const ageMinutes = (Date.now() - this.lastIndexTime.getTime()) / 1000 / 60;
    return ageMinutes > maxAgeMinutes;
  }
}

// Singleton instance
let indexer: N8nNodeIndexer | null = null;

export function getN8nNodeIndexer(): N8nNodeIndexer {
  if (!indexer) {
    indexer = new N8nNodeIndexer();
  }
  return indexer;
}
