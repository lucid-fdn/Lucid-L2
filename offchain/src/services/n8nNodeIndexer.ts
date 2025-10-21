// offchain/src/services/n8nNodeIndexer.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { getElasticsearchService, N8nNode } from './elasticsearchService';

const execAsync = promisify(exec);

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
  private cachedNodes: N8nNode[] = [];

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

      return filteredNodes;
    } catch (error) {
      console.error('Error fetching nodes from CLI:', error);
      throw new Error(`Failed to fetch nodes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Index all n8n nodes into Elasticsearch
   */
  async indexNodes(forceRefresh: boolean = false): Promise<IndexingResult> {
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

    const startTime = Date.now();
    this.isIndexing = true;

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
    cachedNodesCount: number;
  } {
    return {
      isIndexing: this.isIndexing,
      lastIndexTime: this.lastIndexTime,
      cachedNodesCount: this.cachedNodes.length,
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
