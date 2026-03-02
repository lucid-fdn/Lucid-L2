/**
 * MCP Tool Registry Service
 * Discovers, manages, and executes MCP tools
 */

import axios from 'axios';
import { MCPTool, MCPToolExecuteRequest, MCPToolExecuteResponse } from './mcpTypes';

export class MCPToolRegistry {
  private tools: Map<string, MCPTool> = new Map();
  private baseUrl: string;
  private timeout: number;
  private initialized: boolean = false;

  constructor(baseUrl: string = 'http://localhost', timeout: number = 10000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * Initialize registry by discovering all available tools
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('🔍 Discovering MCP tools...');

    // Default tool ports
    const toolPorts = [
      { name: 'twitter', port: 9001 },
      { name: 'ipfs', port: 9002 },
      { name: 'solana', port: 9003 },
      { name: 'github', port: 9004 },
      { name: 'web-search', port: 9005 },
    ];

    for (const { name, port } of toolPorts) {
      try {
        await this.discoverTool(name, port);
      } catch (error: any) {
        console.warn(`⚠️  Failed to discover tool ${name} on port ${port}:`, error.message);
      }
    }

    this.initialized = true;
    console.log(`✅ Discovered ${this.tools.size} MCP tools`);
  }

  /**
   * Discover a single tool by fetching its info endpoint
   */
  private async discoverTool(name: string, port: number): Promise<void> {
    const url = `${this.baseUrl}:${port}`;
    
    try {
      const response = await axios.get(`${url}/info.json`, {
        timeout: this.timeout,
      });

      const toolInfo = response.data;
      
      const tool: MCPTool = {
        name: toolInfo.name || name,
        type: toolInfo.type || 'other',
        description: toolInfo.description || '',
        version: toolInfo.version || '1.0.0',
        status: 'available',
        operations: toolInfo.operations || [],
        port: toolInfo.port || port,
        protocol: toolInfo.protocol || 'mcp',
        authentication: toolInfo.authentication,
        url: url,
        metadata: toolInfo,
      };

      this.tools.set(tool.name, tool);
      console.log(`  ✓ Discovered: ${tool.name} (${tool.type}) - ${tool.operations.length} operations`);
    } catch (error: any) {
      console.error(`  ✗ Failed to discover ${name}:`, error.message);
      
      // Register as unavailable
      this.tools.set(name, {
        name,
        type: 'other',
        description: `Tool ${name} is unavailable`,
        version: '0.0.0',
        status: 'unavailable',
        operations: [],
        port,
        protocol: 'mcp',
        url,
      });
    }
  }

  /**
   * List all available tools
   */
  async listTools(): Promise<MCPTool[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool by name
   */
  async getTool(name: string): Promise<MCPTool | undefined> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.tools.get(name);
  }

  /**
   * Execute a tool operation
   * Note: For placeholders, this returns simulated responses
   * In production, this would call actual MCP server endpoints
   */
  async executeTool(
    toolName: string,
    operation: string,
    params: Record<string, any>
  ): Promise<MCPToolExecuteResponse> {
    const startTime = Date.now();

    try {
      const tool = await this.getTool(toolName);
      
      if (!tool) {
        return {
          success: false,
          error: `Tool '${toolName}' not found in registry`,
        };
      }

      if (tool.status !== 'available') {
        return {
          success: false,
          error: `Tool '${toolName}' is ${tool.status}`,
        };
      }

      // Check if operation exists
      const operationExists = tool.operations.some(op => op.name === operation);
      if (!operationExists) {
        return {
          success: false,
          error: `Operation '${operation}' not found in tool '${toolName}'`,
        };
      }

      console.log(`🔧 Executing: ${toolName}.${operation}`);

      // For placeholder tools, return simulated responses
      // In production, this would call the actual MCP server endpoint
      const result = await this.simulateToolExecution(toolName, operation, params);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        result,
        executionTime,
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      
      return {
        success: false,
        error: error.message,
        executionTime,
      };
    }
  }

  /**
   * Simulate tool execution for placeholder services
   * In production, replace with actual MCP protocol calls
   */
  private async simulateToolExecution(
    toolName: string,
    operation: string,
    params: Record<string, any>
  ): Promise<any> {
    // Simulate execution with appropriate responses per tool type
    
    switch (toolName) {
      case 'twitter':
        return this.simulateTwitterOperation(operation, params);
      
      case 'ipfs':
        return this.simulateIPFSOperation(operation, params);
      
      case 'solana':
        return this.simulateSolanaOperation(operation, params);
      
      case 'github':
        return this.simulateGitHubOperation(operation, params);
      
      case 'web-search':
        return this.simulateSearchOperation(operation, params);
      
      default:
        return {
          status: 'simulated',
          tool: toolName,
          operation,
          params,
          message: 'Placeholder execution - replace with actual MCP call'
        };
    }
  }

  private simulateTwitterOperation(operation: string, params: any): any {
    switch (operation) {
      case 'post':
        return {
          id: `tweet_${Date.now()}`,
          content: params.content,
          url: `https://twitter.com/lucid/status/${Date.now()}`,
          created_at: new Date().toISOString(),
        };
      
      case 'search':
        return {
          query: params.query,
          results: [
            { id: '1', text: `Sample tweet about ${params.query}`, author: 'user1' },
            { id: '2', text: `Another tweet about ${params.query}`, author: 'user2' },
          ],
          count: 2,
        };
      
      case 'trends':
        return {
          trends: [
            { name: '#Solana', tweets: 50000 },
            { name: '#AI', tweets: 30000 },
            { name: '#Web3', tweets: 20000 },
          ],
        };
      
      default:
        return { error: `Unknown operation: ${operation}` };
    }
  }

  private simulateIPFSOperation(operation: string, params: any): any {
    switch (operation) {
      case 'upload':
        return {
          cid: `Qm${Math.random().toString(36).substring(2, 15)}`,
          filename: params.filename,
          size: params.content?.length || 0,
          url: `https://ipfs.io/ipfs/Qm...`,
        };
      
      case 'pin':
        return {
          cid: params.cid,
          pinned: true,
          timestamp: new Date().toISOString(),
        };
      
      case 'get':
        return {
          cid: params.cid,
          content: 'Sample IPFS content',
          retrieved: true,
        };
      
      default:
        return { error: `Unknown operation: ${operation}` };
    }
  }

  private simulateSolanaOperation(operation: string, params: any): any {
    switch (operation) {
      case 'read':
        return {
          address: params.address,
          data: {
            lamports: 1000000,
            owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          },
          exists: true,
        };
      
      case 'write':
        return {
          signature: `sig_${Math.random().toString(36).substring(2, 15)}`,
          success: true,
          data: params.data,
        };
      
      case 'transfer':
        return {
          signature: `sig_${Math.random().toString(36).substring(2, 15)}`,
          from: 'sender_address',
          to: params.to,
          amount: params.amount,
          success: true,
        };
      
      default:
        return { error: `Unknown operation: ${operation}` };
    }
  }

  private simulateGitHubOperation(operation: string, params: any): any {
    switch (operation) {
      case 'createIssue':
        return {
          id: Date.now(),
          number: Math.floor(Math.random() * 1000),
          title: params.title,
          body: params.body,
          url: `https://github.com/${params.repo}/issues/${Date.now()}`,
          state: 'open',
        };
      
      case 'searchRepos':
        return {
          query: params.query,
          total_count: 2,
          items: [
            { name: 'repo1', description: 'Sample repo 1', stars: 100 },
            { name: 'repo2', description: 'Sample repo 2', stars: 50 },
          ],
        };
      
      case 'getFile':
        return {
          repo: params.repo,
          path: params.path,
          content: 'Sample file content from GitHub',
          encoding: 'utf-8',
        };
      
      default:
        return { error: `Unknown operation: ${operation}` };
    }
  }

  private simulateSearchOperation(operation: string, params: any): any {
    switch (operation) {
      case 'search':
        return {
          query: params.query,
          results: [
            {
              title: `Result 1 for ${params.query}`,
              url: 'https://example.com/1',
              snippet: 'This is a sample search result...',
            },
            {
              title: `Result 2 for ${params.query}`,
              url: 'https://example.com/2',
              snippet: 'Another relevant result...',
            },
          ],
          total: 2,
        };
      
      case 'news':
        return {
          query: params.query,
          articles: [
            {
              title: `News about ${params.query}`,
              url: 'https://news.example.com/article1',
              published: new Date().toISOString(),
              source: 'News Source 1',
            },
          ],
        };
      
      default:
        return { error: `Unknown operation: ${operation}` };
    }
  }

  /**
   * Refresh tool discovery
   */
  async refresh(): Promise<void> {
    this.tools.clear();
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalTools: number;
    availableTools: number;
    unavailableTools: number;
    toolsByType: Record<string, number>;
  } {
    const tools = Array.from(this.tools.values());
    const available = tools.filter(t => t.status === 'available').length;
    const unavailable = tools.filter(t => t.status !== 'available').length;

    const toolsByType: Record<string, number> = {};
    tools.forEach(tool => {
      toolsByType[tool.type] = (toolsByType[tool.type] || 0) + 1;
    });

    return {
      totalTools: tools.length,
      availableTools: available,
      unavailableTools: unavailable,
      toolsByType,
    };
  }
}

// Singleton instance
let registryInstance: MCPToolRegistry | null = null;

export function getMCPRegistry(): MCPToolRegistry {
  if (!registryInstance) {
    registryInstance = new MCPToolRegistry();
  }
  return registryInstance;
}
