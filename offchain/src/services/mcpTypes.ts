/**
 * MCP (Model Context Protocol) Types
 * Type definitions for MCP tool registry and operations
 */

export interface MCPToolOperation {
  name: string;
  description: string;
  parameters: Record<string, string>;
}

export interface MCPTool {
  name: string;
  type: 'social' | 'storage' | 'blockchain' | 'data' | 'other';
  description: string;
  version: string;
  status: 'available' | 'unavailable' | 'error';
  operations: MCPToolOperation[];
  port: number;
  protocol: string;
  authentication?: string;
  url: string;
  metadata?: Record<string, any>;
}

export interface MCPToolExecuteRequest {
  tool: string;
  operation: string;
  params: Record<string, any>;
}

export interface MCPToolExecuteResponse {
  success: boolean;
  result?: any;
  error?: string;
  executionTime?: number;
}

export interface MCPRegistryConfig {
  tools: {
    name: string;
    port: number;
    url: string;
  }[];
  baseUrl?: string;
  timeout?: number;
}
