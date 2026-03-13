/**
 * MCP Server Implementation for Lucid Layer SDK
 *
 * Provides MCP-compatible tool and resource interfaces for Lucid operations.
 */

import { evaluatePolicy } from '../../../gateway-lite/src/compute/policyEngine';
import { matchComputeForModel } from '../../../gateway-lite/src/compute/matchingEngine';
import { getComputeRegistry } from '../../../gateway-lite/src/compute/computeRegistry';
import { createInferenceReceipt } from '../../../engine/src/receipt/receiptService';
import { getReceiptTree } from '../../../engine/src/crypto/merkleTree';
import { calculatePayoutSplit } from '../../../engine/src/finance/payoutService';
import { MEMORY_TOOL_DEFINITIONS, executeMemoryTool } from './memoryTools';

// =============================================================================
// Types
// =============================================================================

interface ServerInfo {
  name: string;
  version: string;
}

interface Capabilities {
  tools: boolean;
  resources: boolean;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

interface ToolCallRequest {
  name: string;
  arguments: Record<string, any>;
}

interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

interface ResourceReadResult {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}

// =============================================================================
// Tool Definitions
// =============================================================================

const TOOLS: ToolDefinition[] = [
  ...MEMORY_TOOL_DEFINITIONS,
  {
    name: 'lucid_match_explain',
    description: 'Evaluate a policy against compute and model metadata',
    inputSchema: {
      type: 'object',
      properties: {
        policy: { type: 'object', description: 'Policy to evaluate' },
        model_meta: { type: 'object', description: 'Model metadata' },
        compute_meta: { type: 'object', description: 'Compute metadata' },
      },
      required: ['policy'],
    },
  },
  {
    name: 'lucid_match',
    description: 'Match compute for a model given a compute catalog and policy',
    inputSchema: {
      type: 'object',
      properties: {
        model_meta: { type: 'object', description: 'Model metadata' },
        compute_catalog: { type: 'array', description: 'Compute catalog' },
        policy: { type: 'object', description: 'Policy constraints' },
      },
      required: ['model_meta', 'policy'],
    },
  },
  {
    name: 'lucid_route',
    description: 'Match and resolve an executable inference endpoint',
    inputSchema: {
      type: 'object',
      properties: {
        model_meta: { type: 'object', description: 'Model metadata' },
        compute_catalog: { type: 'array', description: 'Compute catalog' },
        policy: { type: 'object', description: 'Policy constraints' },
      },
      required: ['model_meta', 'policy'],
    },
  },
  {
    name: 'lucid_heartbeat',
    description: 'Submit a compute node heartbeat',
    inputSchema: {
      type: 'object',
      properties: {
        compute_passport_id: { type: 'string' },
        status: { type: 'string', enum: ['healthy', 'degraded', 'down'] },
        queue_depth: { type: 'number' },
        p95_ms_estimate: { type: 'number' },
      },
      required: ['compute_passport_id', 'status'],
    },
  },
  {
    name: 'lucid_get_health',
    description: 'Get the health state of a compute node',
    inputSchema: {
      type: 'object',
      properties: {
        compute_passport_id: { type: 'string' },
      },
      required: ['compute_passport_id'],
    },
  },
  {
    name: 'lucid_create_receipt',
    description: 'Create a receipt and append it to the receipt MMR',
    inputSchema: {
      type: 'object',
      properties: {
        model_passport_id: { type: 'string' },
        compute_passport_id: { type: 'string' },
        policy_hash: { type: 'string' },
        runtime: { type: 'string' },
        tokens_in: { type: 'number' },
        tokens_out: { type: 'number' },
        ttft_ms: { type: 'number' },
      },
      required: ['model_passport_id', 'compute_passport_id', 'policy_hash', 'runtime', 'tokens_in', 'tokens_out', 'ttft_ms'],
    },
  },
  {
    name: 'lucid_get_mmr_root',
    description: 'Get the current MMR root and leaf count',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'lucid_calculate_payout',
    description: 'Calculate payout split between recipients',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string' },
        total_amount_lamports: { type: 'string' },
        compute_wallet: { type: 'string' },
        model_wallet: { type: 'string' },
        orchestrator_wallet: { type: 'string' },
      },
      required: ['run_id', 'total_amount_lamports', 'compute_wallet'],
    },
  },
];

// =============================================================================
// Resource Definitions
// =============================================================================

const RESOURCES: ResourceDefinition[] = [
  {
    uri: 'lucid://schemas/policy',
    name: 'Policy Schema',
    description: 'JSON Schema for Lucid policy objects',
    mimeType: 'application/json',
  },
  {
    uri: 'lucid://mmr/root',
    name: 'MMR Root',
    description: 'Current Merkle Mountain Range root and leaf count',
    mimeType: 'application/json',
  },
];

// =============================================================================
// LucidMcpServer
// =============================================================================

export class LucidMcpServer {
  getServerInfo(): ServerInfo {
    return {
      name: 'lucid-layer-sdk',
      version: '1.0.0',
    };
  }

  getCapabilities(): Capabilities {
    return {
      tools: true,
      resources: true,
    };
  }

  listTools(): ToolDefinition[] {
    return TOOLS;
  }

  listResources(): ResourceDefinition[] {
    return RESOURCES;
  }

  async readResource(uri: string): Promise<ResourceReadResult> {
    switch (uri) {
      case 'lucid://schemas/policy': {
        const schema = {
          type: 'object',
          required: ['policy_version'],
          properties: {
            policy_version: { type: 'string' },
            allow_regions: { type: 'array', items: { type: 'string' } },
          },
        };
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(schema),
          }],
        };
      }

      case 'lucid://mmr/root': {
        const tree = getReceiptTree();
        const merkleRoot = { root: tree.getRoot(), leafCount: tree.getLeafCount() };
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              root: merkleRoot.root,
              leaf_count: merkleRoot.leafCount,
            }),
          }],
        };
      }

      default:
        throw new Error(`Resource not found: ${uri}`);
    }
  }

  async callTool(request: ToolCallRequest): Promise<ToolCallResult> {
    try {
      switch (request.name) {
        case 'lucid_match_explain':
          return this.handleMatchExplain(request.arguments);
        case 'lucid_match':
          return this.handleMatch(request.arguments);
        case 'lucid_route':
          return this.handleRoute(request.arguments);
        case 'lucid_heartbeat':
          return this.handleHeartbeat(request.arguments);
        case 'lucid_get_health':
          return this.handleGetHealth(request.arguments);
        case 'lucid_create_receipt':
          return this.handleCreateReceipt(request.arguments);
        case 'lucid_get_mmr_root':
          return this.handleGetMmrRoot();
        case 'lucid_calculate_payout':
          return this.handleCalculatePayout(request.arguments);
        default: {
          // Check if it's a memory tool
          if (request.name.startsWith('memory_')) {
            const result = await executeMemoryTool(request.name, request.arguments);
            return this.jsonResult({ success: true, ...result });
          }
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${request.name}` }) }],
            isError: true,
          };
        }
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }],
        isError: true,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Tool Handlers
  // ---------------------------------------------------------------------------

  private handleMatchExplain(args: Record<string, any>): ToolCallResult {
    const result = evaluatePolicy({
      policy: args.policy,
      modelMeta: args.model_meta,
      computeMeta: args.compute_meta,
    });

    return this.jsonResult({
      success: true,
      allowed: result.allowed,
      reasons: result.reasons,
      policy_hash: result.policy_hash,
    });
  }

  private handleMatch(args: Record<string, any>): ToolCallResult {
    const { match, explain } = matchComputeForModel({
      model_meta: args.model_meta,
      policy: args.policy,
      compute_catalog: args.compute_catalog || [],
    });

    return this.jsonResult({
      success: true,
      match: match || null,
      explain,
    });
  }

  private handleRoute(args: Record<string, any>): ToolCallResult {
    const { match, explain } = matchComputeForModel({
      model_meta: args.model_meta,
      policy: args.policy,
      compute_catalog: args.compute_catalog || [],
      require_live_healthy: true,
    });

    return this.jsonResult({
      success: true,
      match: match || null,
      explain,
    });
  }

  private handleHeartbeat(args: Record<string, any>): ToolCallResult {
    const { compute_passport_id, status, queue_depth, p95_ms_estimate } = args;

    const validStatuses = ['healthy', 'degraded', 'down'];
    if (!validStatuses.includes(status)) {
      return this.jsonResult({
        success: false,
        error: `status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const registry = getComputeRegistry();
    registry.upsertHeartbeat({
      compute_passport_id,
      status,
      queue_depth: queue_depth || 0,
      p95_ms_estimate: p95_ms_estimate || 0,
    });

    const state = registry.getLiveState(compute_passport_id);

    return this.jsonResult({
      success: true,
      state,
    });
  }

  private handleGetHealth(args: Record<string, any>): ToolCallResult {
    const { compute_passport_id } = args;
    const registry = getComputeRegistry();
    const state = registry.getLiveState(compute_passport_id);

    if (!state) {
      return this.jsonResult({
        success: false,
        error: 'No health state found',
      });
    }

    return this.jsonResult({
      success: true,
      state,
    });
  }

  private handleCreateReceipt(args: Record<string, any>): ToolCallResult {
    const required = ['model_passport_id', 'compute_passport_id', 'policy_hash', 'runtime', 'tokens_in', 'tokens_out', 'ttft_ms'];
    for (const field of required) {
      if (args[field] === undefined || args[field] === null) {
        return this.jsonResult({
          success: false,
          error: `Missing required field: ${field}`,
        });
      }
    }

    const receipt = createInferenceReceipt({
      model_passport_id: args.model_passport_id,
      compute_passport_id: args.compute_passport_id,
      policy_hash: args.policy_hash,
      runtime: args.runtime,
      tokens_in: args.tokens_in,
      tokens_out: args.tokens_out,
      ttft_ms: args.ttft_ms,
    });

    return this.jsonResult({
      success: true,
      receipt: {
        run_id: receipt.run_id,
        receipt_hash: receipt.receipt_hash,
      },
    });
  }

  private handleGetMmrRoot(): ToolCallResult {
    const tree = getReceiptTree();
        const merkleRoot = { root: tree.getRoot(), leafCount: tree.getLeafCount() };
    return this.jsonResult({
      success: true,
      root: merkleRoot.root,
      leaf_count: merkleRoot.leafCount,
    });
  }

  private handleCalculatePayout(args: Record<string, any>): ToolCallResult {
    const payout = calculatePayoutSplit({
      run_id: args.run_id,
      total_amount_lamports: BigInt(args.total_amount_lamports),
      compute_wallet: args.compute_wallet,
      model_wallet: args.model_wallet,
      orchestrator_wallet: args.orchestrator_wallet,
    });

    return this.jsonResult({
      success: true,
      payout: {
        ...payout,
        total_amount_lamports: payout.total_amount_lamports.toString(),
        recipients: payout.recipients.map(r => ({
          ...r,
          amount_lamports: r.amount_lamports.toString(),
        })),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private jsonResult(data: any): ToolCallResult {
    return {
      content: [{ type: 'text', text: JSON.stringify(data) }],
    };
  }
}

// =============================================================================
// Singleton
// =============================================================================

let instance: LucidMcpServer | null = null;

export function getMcpServer(): LucidMcpServer {
  if (!instance) {
    instance = new LucidMcpServer();
  }
  return instance;
}

export function resetMcpServer(): void {
  instance = null;
}
