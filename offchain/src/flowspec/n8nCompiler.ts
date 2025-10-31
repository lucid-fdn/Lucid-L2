/**
 * FlowSpec to n8n Compiler
 * 
 * Compiles FlowSpec DSL into n8n workflow JSON format.
 */

import { FlowSpec, FlowNode, FlowEdge, FlowNodeType } from './types';

interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
}

interface N8nConnection {
  [key: string]: {
    main: Array<Array<{ node: string; type: string; index: number }>>;
  };
}

interface N8nWorkflow {
  name: string;
  nodes: N8nNode[];
  connections: N8nConnection;
  settings?: {
    executionOrder?: 'v0' | 'v1';
  };
  staticData?: Record<string, unknown>;
  tags?: string[];
  meta?: Record<string, unknown>;
}

export class N8nCompiler {
  private nodeIdMap: Map<string, string> = new Map();
  private nodeCounter = 0;

  /**
   * Compile a FlowSpec into an n8n workflow JSON
   */
  compile(spec: FlowSpec): N8nWorkflow {
    this.nodeIdMap.clear();
    this.nodeCounter = 0;

    const n8nNodes: N8nNode[] = spec.nodes.map((node, index) => 
      this.compileNode(node, index)
    );

    const connections: N8nConnection = this.compileConnections(spec.edges);

    return {
      name: spec.name,
      nodes: n8nNodes,
      connections,
      settings: {}
    };
  }

  /**
   * Compile a single FlowNode into an n8n node
   */
  private compileNode(node: FlowNode, index: number): N8nNode {
    const n8nId = `node_${this.nodeCounter++}`;
    this.nodeIdMap.set(node.id, n8nId);

    const position = node.position || this.calculatePosition(index);

    const n8nNode: N8nNode = {
      // Don't include id - n8n generates it
      name: node.id,
      type: this.mapNodeType(node.type),
      typeVersion: 1,
      position: [position.x, position.y],
      parameters: this.compileNodeParameters(node)
    } as any;

    if (node.config?.credentials) {
      n8nNode.credentials = this.compileCredentials(node.config.credentials as Record<string, string>);
    }

    return n8nNode;
  }

  /**
   * Map FlowSpec node types to n8n node types
   */
  private mapNodeType(type: FlowNodeType | string): string {
    // If the type is already an n8n node type (starts with 'n8n-nodes-'), use it directly
    if (typeof type === 'string' && (type.startsWith('n8n-nodes-') || type.startsWith('@n8n/'))) {
      return type;
    }

    const typeMap: Record<FlowNodeType, string> = {
      'llm.chat': 'n8n-nodes-langchain.lmChatOpenAi',
      'embed': 'n8n-nodes-langchain.embeddingsOpenAi',
      'search': 'n8n-nodes-base.httpRequest',
      'tool.http': 'n8n-nodes-base.httpRequest',
      'tool.mcp': 'n8n-nodes-base.function',
      'solana.write': 'n8n-nodes-base.httpRequest',
      'solana.read': 'n8n-nodes-base.httpRequest',
      'ipfs.pin': 'n8n-nodes-base.httpRequest',
      'branch': 'n8n-nodes-base.if',
      'transform': 'n8n-nodes-base.function',
      'webhook': 'n8n-nodes-base.webhook',
      'schedule': 'n8n-nodes-base.cron'
    };

    return typeMap[type as FlowNodeType] || 'n8n-nodes-base.noOp';
  }

  /**
   * Compile node parameters based on type
   */
  private compileNodeParameters(node: FlowNode): Record<string, unknown> {
    const baseParams = node.input || {};
    const nodeType = typeof node.type === 'string' ? node.type : '';

    // If using a real n8n node type directly, use config as-is with some smart defaults
    if (nodeType.startsWith('n8n-nodes-') || nodeType.startsWith('@n8n/')) {
      // For n8n-nodes-base.httpRequest specifically
      if (nodeType === 'n8n-nodes-base.httpRequest') {
        return {
          ...baseParams,
          ...node.config,
          method: node.config?.method || 'GET',
          url: node.config?.url || '',
          options: node.config?.options || {}
        };
      }
      
      // For n8n-nodes-base.rssFeed
      if (nodeType === 'n8n-nodes-base.rssFeed') {
        return {
          ...baseParams,
          ...node.config,
          url: node.config?.url || ''
        };
      }
      
      // For n8n-nodes-base.emailSend
      if (nodeType === 'n8n-nodes-base.emailSend') {
        return {
          ...baseParams,
          ...node.config
        };
      }
      
      // For n8n-nodes-base.manualTrigger
      if (nodeType === 'n8n-nodes-base.manualTrigger') {
        return {};  // No parameters needed
      }
      
      // For n8n-nodes-base.webhook
      if (nodeType === 'n8n-nodes-base.webhook') {
        return {
          ...baseParams,
          path: node.config?.path || '',
          httpMethod: node.config?.method || 'POST',
          responseMode: node.config?.responseMode || 'lastNode',  // Wait for last node (respond)
          responseData: node.config?.responseData || 'firstEntryJson'  // Defer to respond node
        };
      }
      
      // For n8n-nodes-base.respondToWebhook
      if (nodeType === 'n8n-nodes-base.respondToWebhook') {
        return {
          ...baseParams,
          respondWith: node.config?.respondWith || 'allIncomingItems',
          responseMode: node.config?.responseMode || 'responseNode'
        };
      }
      
      // For any other real n8n node, just merge config with baseParams
      return {
        ...baseParams,
        ...node.config
      };
    }

    switch (node.type) {
      case 'llm.chat':
        return {
          ...baseParams,
          model: node.config?.model || 'gpt-3.5-turbo',
          temperature: node.config?.temperature || 0.7,
          maxTokens: node.config?.maxTokens || 1000
        };

      case 'tool.http':
      case 'solana.write':
      case 'solana.read':
        return {
          ...baseParams,
          method: node.config?.method || 'POST',
          url: node.config?.url || '',
          responseFormat: 'json',
          options: {}
        };

      case 'transform':
        return {
          ...baseParams,
          functionCode: node.config?.code || 'return items;'
        };

      case 'branch':
        return {
          ...baseParams,
          conditions: {
            boolean: [
              {
                value1: node.config?.condition || '',
                value2: ''
              }
            ]
          }
        };

      case 'webhook':
        return {
          ...baseParams,
          path: node.config?.path || '',
          httpMethod: node.config?.method || 'POST',
          responseMode: node.config?.responseMode || 'responseNode',  // Wait for respond node by default
          responseData: node.config?.responseData || 'allEntries'
        };

      default:
        return baseParams;
    }
  }

  /**
   * Compile credentials references
   */
  private compileCredentials(credentials: Record<string, string>): Record<string, { id: string; name: string }> {
    const compiled: Record<string, { id: string; name: string }> = {};
    
    for (const [type, name] of Object.entries(credentials)) {
      compiled[type] = {
        id: name,
        name: name
      };
    }

    return compiled;
  }

  /**
   * Compile connections between nodes
   * n8n uses node NAMES (not internal IDs) in the connections object
   */
  private compileConnections(edges: FlowEdge[]): N8nConnection {
    const connections: N8nConnection = {};

    for (const edge of edges) {
      // Use the FlowSpec node IDs directly as they become node names in n8n
      const fromNodeName = edge.from;
      const toNodeName = edge.to;

      if (!connections[fromNodeName]) {
        connections[fromNodeName] = { main: [[]] };
      }

      connections[fromNodeName].main[0].push({
        node: toNodeName,
        type: 'main',
        index: 0
      });
    }

    return connections;
  }

  /**
   * Calculate default position for a node
   */
  private calculatePosition(index: number): { x: number; y: number } {
    const col = Math.floor(index / 3);
    const row = index % 3;
    
    return {
      x: 250 + col * 300,
      y: 250 + row * 150
    };
  }

  /**
   * Validate a FlowSpec before compilation
   */
  validate(spec: FlowSpec): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!spec.name || spec.name.trim() === '') {
      errors.push('Flow name is required');
    }

    if (!spec.nodes || spec.nodes.length === 0) {
      errors.push('Flow must have at least one node');
    }

    // Check for duplicate node IDs
    const nodeIds = new Set<string>();
    for (const node of spec.nodes) {
      if (nodeIds.has(node.id)) {
        errors.push(`Duplicate node ID: ${node.id}`);
      }
      nodeIds.add(node.id);
    }

    // Validate edges reference existing nodes
    for (const edge of spec.edges) {
      if (!nodeIds.has(edge.from)) {
        errors.push(`Edge references unknown 'from' node: ${edge.from}`);
      }
      if (!nodeIds.has(edge.to)) {
        errors.push(`Edge references unknown 'to' node: ${edge.to}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
