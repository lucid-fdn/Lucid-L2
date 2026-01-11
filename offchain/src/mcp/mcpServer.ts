/**
 * PR7: MCP Server Implementation
 * 
 * Exposes LucidLayer SDK tools via Model Context Protocol (MCP).
 * Implements the standard MCP server interface for tool discovery and execution.
 */

import { evaluatePolicy } from '../services/policyEngine';
import { matchComputeForModel } from '../services/matchingEngine';
import { getComputeRegistry } from '../services/computeRegistry';
import { createReceipt, getReceipt, verifyReceipt, getReceiptProof, getMmrRoot, getMmrLeafCount, getSignerPublicKey } from '../services/receiptService';
import { calculatePayoutSplit, createPayoutFromReceipt, getPayout, storePayout, verifyPayoutSplit } from '../services/payoutService';
import { validateWithSchema } from '../utils/schemaValidator';
import { getPassportManager } from '../services/passportManager';
import type { PassportType, PassportStatus, PassportFilters } from '../storage/passportStore';
import * as fs from 'fs';
import * as path from 'path';

// MCP Protocol Types
export interface McpToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, unknown>;
}

/**
 * LucidLayer MCP Server
 */
export class LucidMcpServer {
  private manifest: Record<string, unknown>;

  constructor() {
    // Load manifest
    const manifestPath = path.join(__dirname, '../../mcp-manifest.json');
    if (fs.existsSync(manifestPath)) {
      this.manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } else {
      this.manifest = { name: 'lucid-layer-sdk', version: '1.0.0' };
    }
  }

  /**
   * Get server info
   */
  getServerInfo(): { name: string; version: string } {
    return {
      name: this.manifest.name as string || 'lucid-layer-sdk',
      version: this.manifest.version as string || '1.0.0',
    };
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): McpServerCapabilities {
    return {
      tools: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
      logging: {},
    };
  }

  /**
   * List available tools
   */
  listTools(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    return (this.manifest.tools as any[]) || [];
  }

  /**
   * List available resources
   */
  listResources(): McpResource[] {
    const resources = (this.manifest.resources as any[]) || [];
    return resources.map(r => ({
      uri: r.name,
      name: r.name.split('/').pop() || r.name,
      description: r.description,
      mimeType: r.mimeType,
    }));
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string }> }> {
    // Schema resources
    if (uri === 'lucid://schemas/policy') {
      const schemaPath = path.join(__dirname, '../../../schemas/Policy.schema.json');
      const content = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf-8') : '{}';
      return { contents: [{ uri, mimeType: 'application/schema+json', text: content }] };
    }
    if (uri === 'lucid://schemas/model-meta') {
      const schemaPath = path.join(__dirname, '../../../schemas/ModelMeta.schema.json');
      const content = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf-8') : '{}';
      return { contents: [{ uri, mimeType: 'application/schema+json', text: content }] };
    }
    if (uri === 'lucid://schemas/compute-meta') {
      const schemaPath = path.join(__dirname, '../../../schemas/ComputeMeta.schema.json');
      const content = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf-8') : '{}';
      return { contents: [{ uri, mimeType: 'application/schema+json', text: content }] };
    }
    if (uri === 'lucid://schemas/run-receipt') {
      const schemaPath = path.join(__dirname, '../../../schemas/RunReceipt.schema.json');
      const content = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf-8') : '{}';
      return { contents: [{ uri, mimeType: 'application/schema+json', text: content }] };
    }
    if (uri === 'lucid://mmr/root') {
      const root = getMmrRoot();
      const leafCount = getMmrLeafCount();
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ root, leaf_count: leafCount }) }] };
    }

    throw new Error(`Resource not found: ${uri}`);
  }

  /**
   * Execute a tool call
   */
  async callTool(call: McpToolCall): Promise<McpToolResult> {
    try {
      const result = await this.executeTool(call.name, call.arguments);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
        }],
        isError: true,
      };
    }
  }

  /**
   * Execute a specific tool
   */
  private async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'lucid_match_explain':
        return this.toolMatchExplain(args);
      case 'lucid_match':
        return this.toolMatch(args);
      case 'lucid_route':
        return this.toolRoute(args);
      case 'lucid_heartbeat':
        return this.toolHeartbeat(args);
      case 'lucid_get_health':
        return this.toolGetHealth(args);
      case 'lucid_create_receipt':
        return this.toolCreateReceipt(args);
      case 'lucid_get_receipt':
        return this.toolGetReceipt(args);
      case 'lucid_verify_receipt':
        return this.toolVerifyReceipt(args);
      case 'lucid_get_mmr_root':
        return this.toolGetMmrRoot();
      case 'lucid_calculate_payout':
        return this.toolCalculatePayout(args);
      case 'lucid_payout_from_receipt':
        return this.toolPayoutFromReceipt(args);
      case 'lucid_get_payout':
        return this.toolGetPayout(args);
      case 'lucid_verify_payout':
        return this.toolVerifyPayout(args);
      // Passport tools
      case 'lucid_create_passport':
        return this.toolCreatePassport(args);
      case 'lucid_get_passport':
        return this.toolGetPassport(args);
      case 'lucid_update_passport':
        return this.toolUpdatePassport(args);
      case 'lucid_search_models':
        return this.toolSearchModels(args);
      case 'lucid_search_compute':
        return this.toolSearchCompute(args);
      case 'lucid_list_passports':
        return this.toolListPassports(args);
      case 'lucid_run_inference':
        return this.toolRunInference(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // Tool implementations

  private toolMatchExplain(args: Record<string, unknown>) {
    const { policy, compute_meta, model_meta } = args;
    
    if (policy) {
      const pv = validateWithSchema('Policy', policy);
      if (!pv.ok) {
        return { success: false, error: 'Invalid policy schema', details: pv.errors };
      }
    }

    const evalResult = evaluatePolicy({
      policy: policy as any,
      modelMeta: model_meta as any,
      computeMeta: compute_meta as any,
    });

    return {
      success: true,
      allowed: evalResult.allowed,
      reasons: evalResult.reasons,
      policy_hash: evalResult.policy_hash,
    };
  }

  private toolMatch(args: Record<string, unknown>) {
    const { model_meta, policy, compute_catalog, require_live_healthy } = args;
    
    const result = matchComputeForModel({
      model_meta: model_meta as any,
      policy: policy as any,
      compute_catalog: compute_catalog as any[],
      require_live_healthy: require_live_healthy !== false,
    });

    if (!result.match) {
      return { success: false, error: 'NO_COMPATIBLE_COMPUTE', explain: result.explain };
    }

    return { success: true, match: result.match, explain: result.explain };
  }

  private toolRoute(args: Record<string, unknown>) {
    const { model_meta, policy, compute_catalog, request_id, require_live_healthy } = args;
    
    const result = matchComputeForModel({
      model_meta: model_meta as any,
      policy: policy as any,
      compute_catalog: compute_catalog as any[],
      require_live_healthy: require_live_healthy !== false,
    });

    if (!result.match) {
      return { success: false, error: 'NO_COMPATIBLE_COMPUTE', request_id, explain: result.explain };
    }

    const catalog = compute_catalog as any[] || [];
    const selectedCompute = catalog.find(c => c?.compute_passport_id === result.match?.compute_passport_id);
    const endpoint = selectedCompute?.endpoints?.inference_url;

    if (!endpoint) {
      return { success: false, error: 'SELECTED_COMPUTE_MISSING_ENDPOINT', request_id, explain: result.explain };
    }

    return {
      success: true,
      request_id,
      route: {
        compute_passport_id: result.match.compute_passport_id,
        model_passport_id: result.match.model_passport_id,
        endpoint,
        runtime: result.match.selected_runtime,
        policy_hash: result.explain.policy_hash,
        fallbacks: result.match.fallbacks,
      },
      explain: result.explain,
    };
  }

  private toolHeartbeat(args: Record<string, unknown>) {
    const { compute_passport_id, status, queue_depth, price_per_1k_tokens_estimate, p95_ms_estimate } = args;
    
    if (!compute_passport_id || typeof compute_passport_id !== 'string') {
      return { success: false, error: 'compute_passport_id is required' };
    }
    if (!['healthy', 'degraded', 'down'].includes(status as string)) {
      return { success: false, error: 'status must be healthy|degraded|down' };
    }

    const reg = getComputeRegistry();
    const state = reg.upsertHeartbeat({
      compute_passport_id: compute_passport_id as string,
      status: status as 'healthy' | 'degraded' | 'down',
      queue_depth: queue_depth as number,
      price_per_1k_tokens_estimate: price_per_1k_tokens_estimate as number,
      p95_ms_estimate: p95_ms_estimate as number,
    });

    return { success: true, state };
  }

  private toolGetHealth(args: Record<string, unknown>) {
    const { compute_passport_id } = args;
    
    const reg = getComputeRegistry();
    const state = reg.getLiveState(compute_passport_id as string);
    
    if (!state) {
      return { success: false, status: 'unknown_or_expired' };
    }
    
    return { success: true, state };
  }

  private toolCreateReceipt(args: Record<string, unknown>) {
    const required = ['model_passport_id', 'compute_passport_id', 'policy_hash', 'runtime', 'tokens_in', 'tokens_out', 'ttft_ms'];
    for (const k of required) {
      if (args[k] === undefined || args[k] === null) {
        return { success: false, error: `Missing required field: ${k}` };
      }
    }

    const receipt = createReceipt(args as any);
    return { success: true, receipt };
  }

  private toolGetReceipt(args: Record<string, unknown>) {
    const { receipt_id } = args;
    const receipt = getReceipt(receipt_id as string);
    
    if (!receipt) {
      return { success: false, error: 'Receipt not found' };
    }
    
    return { success: true, receipt };
  }

  private toolVerifyReceipt(args: Record<string, unknown>) {
    const { receipt_id } = args;
    const result = verifyReceipt(receipt_id as string);
    
    if (!result.hash_valid && result.expected_hash === undefined) {
      return { success: false, error: 'Receipt not found' };
    }
    
    return { 
      success: true, 
      valid: result.hash_valid && result.signature_valid,
      hash_valid: result.hash_valid,
      signature_valid: result.signature_valid,
      inclusion_valid: result.inclusion_valid,
      expected_hash: result.expected_hash,
      computed_hash: result.computed_hash,
      merkle_root: result.merkle_root,
    };
  }

  private toolGetMmrRoot() {
    const root = getMmrRoot();
    const leaf_count = getMmrLeafCount();
    return { success: true, root, leaf_count };
  }

  private toolCalculatePayout(args: Record<string, unknown>) {
    const { run_id, total_amount_lamports, compute_wallet, model_wallet, orchestrator_wallet, config } = args;
    
    const required = ['run_id', 'total_amount_lamports', 'compute_wallet'];
    for (const k of required) {
      if (args[k] === undefined || args[k] === null) {
        return { success: false, error: `Missing required field: ${k}` };
      }
    }

    const totalAmount = BigInt(total_amount_lamports as string);
    const payout = calculatePayoutSplit({
      run_id: run_id as string,
      total_amount_lamports: totalAmount,
      compute_wallet: compute_wallet as string,
      model_wallet: model_wallet as string,
      orchestrator_wallet: orchestrator_wallet as string,
      config: config as any,
    });

    storePayout(payout);

    // Convert BigInt to string for JSON
    return {
      success: true,
      payout: {
        ...payout,
        total_amount_lamports: payout.total_amount_lamports.toString(),
        recipients: payout.recipients.map(r => ({
          ...r,
          amount_lamports: r.amount_lamports.toString(),
        })),
      },
    };
  }

  private toolPayoutFromReceipt(args: Record<string, unknown>) {
    const { run_id, tokens_in, tokens_out, price_per_1k_tokens_lamports, compute_wallet, model_wallet, orchestrator_wallet, config } = args;
    
    const required = ['run_id', 'tokens_in', 'tokens_out', 'price_per_1k_tokens_lamports', 'compute_wallet'];
    for (const k of required) {
      if (args[k] === undefined || args[k] === null) {
        return { success: false, error: `Missing required field: ${k}` };
      }
    }

    const pricePer1k = BigInt(price_per_1k_tokens_lamports as string);
    const payout = createPayoutFromReceipt({
      run_id: run_id as string,
      tokens_in: tokens_in as number,
      tokens_out: tokens_out as number,
      price_per_1k_tokens_lamports: pricePer1k,
      compute_wallet: compute_wallet as string,
      model_wallet: model_wallet as string,
      orchestrator_wallet: orchestrator_wallet as string,
      config: config as any,
    });

    storePayout(payout);

    return {
      success: true,
      payout: {
        ...payout,
        total_amount_lamports: payout.total_amount_lamports.toString(),
        recipients: payout.recipients.map(r => ({
          ...r,
          amount_lamports: r.amount_lamports.toString(),
        })),
      },
    };
  }

  private toolGetPayout(args: Record<string, unknown>) {
    const { run_id } = args;
    const payout = getPayout(run_id as string);
    
    if (!payout) {
      return { success: false, error: 'Payout not found' };
    }

    return {
      success: true,
      payout: {
        ...payout,
        total_amount_lamports: payout.total_amount_lamports.toString(),
        recipients: payout.recipients.map(r => ({
          ...r,
          amount_lamports: r.amount_lamports.toString(),
        })),
      },
    };
  }

  private toolVerifyPayout(args: Record<string, unknown>) {
    const { run_id } = args;
    const payout = getPayout(run_id as string);
    
    if (!payout) {
      return { success: false, error: 'Payout not found' };
    }

    const result = verifyPayoutSplit(payout);
    return { success: true, ...result };
  }

  // Passport tool implementations

  private async toolCreatePassport(args: Record<string, unknown>) {
    const { type, owner, metadata, name, description, version, tags } = args;
    
    if (!type) {
      return { success: false, error: 'Missing required field: type' };
    }
    if (!owner) {
      return { success: false, error: 'Missing required field: owner' };
    }
    if (!metadata) {
      return { success: false, error: 'Missing required field: metadata' };
    }

    const manager = getPassportManager();
    const result = await manager.createPassport({
      type: type as PassportType,
      owner: owner as string,
      metadata,
      name: name as string | undefined,
      description: description as string | undefined,
      version: version as string | undefined,
      tags: tags as string[] | undefined,
    });

    if (!result.ok) {
      return { success: false, error: result.error, details: result.details };
    }

    return { success: true, passport_id: result.data!.passport_id, passport: result.data };
  }

  private async toolGetPassport(args: Record<string, unknown>) {
    const { passport_id } = args;
    
    if (!passport_id) {
      return { success: false, error: 'Missing required field: passport_id' };
    }

    const manager = getPassportManager();
    const result = await manager.getPassport(passport_id as string);

    if (!result.ok) {
      return { success: false, error: result.error };
    }

    return { success: true, passport: result.data };
  }

  private async toolUpdatePassport(args: Record<string, unknown>) {
    const { passport_id, metadata, name, description, version, tags, status, owner_address } = args;
    
    if (!passport_id) {
      return { success: false, error: 'Missing required field: passport_id' };
    }

    const manager = getPassportManager();
    const result = await manager.updatePassport(
      passport_id as string,
      {
        metadata: metadata as any,
        name: name as string | undefined,
        description: description as string | undefined,
        version: version as string | undefined,
        tags: tags as string[] | undefined,
        status: status as PassportStatus | undefined,
      },
      owner_address as string | undefined
    );

    if (!result.ok) {
      return { success: false, error: result.error, details: result.details };
    }

    return { success: true, passport: result.data };
  }

  private async toolSearchModels(args: Record<string, unknown>) {
    const { runtime, format, max_vram, owner, tags, search, page, per_page } = args;
    
    const manager = getPassportManager();
    const result = await manager.searchModels({
      runtime: runtime as string | undefined,
      format: format as string | undefined,
      max_vram: max_vram as number | undefined,
      owner: owner as string | undefined,
      tags: tags as string[] | undefined,
      search: search as string | undefined,
      page: page as number | undefined,
      per_page: per_page as number | undefined,
    });

    return {
      success: true,
      models: result.items,
      pagination: result.pagination,
    };
  }

  private async toolSearchCompute(args: Record<string, unknown>) {
    const { regions, runtimes, provider_type, min_vram_gb, gpu, owner, tags, search, page, per_page } = args;
    
    const manager = getPassportManager();
    const result = await manager.searchCompute({
      regions: regions as string[] | undefined,
      runtimes: runtimes as string[] | undefined,
      provider_type: provider_type as string | undefined,
      min_vram_gb: min_vram_gb as number | undefined,
      gpu: gpu as string | undefined,
      owner: owner as string | undefined,
      tags: tags as string[] | undefined,
      search: search as string | undefined,
      page: page as number | undefined,
      per_page: per_page as number | undefined,
    });

    return {
      success: true,
      compute: result.items,
      pagination: result.pagination,
    };
  }

  private async toolListPassports(args: Record<string, unknown>) {
    const { type, owner, status, tags, tag_match, search, page, per_page, sort_by, sort_order } = args;
    
    const filters: PassportFilters = {};
    
    if (type) {
      const types = Array.isArray(type) ? type : [type];
      filters.type = types.length === 1 ? types[0] as PassportType : types as PassportType[];
    }
    if (owner) filters.owner = owner as string;
    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      filters.status = statuses.length === 1 ? statuses[0] as PassportStatus : statuses as PassportStatus[];
    }
    if (tags) filters.tags = tags as string[];
    if (tag_match === 'all' || tag_match === 'any') filters.tag_match = tag_match;
    if (search) filters.search = search as string;
    if (page) filters.page = page as number;
    if (per_page) filters.per_page = per_page as number;
    if (sort_by === 'created_at' || sort_by === 'updated_at' || sort_by === 'name') {
      filters.sort_by = sort_by;
    }
    if (sort_order === 'asc' || sort_order === 'desc') {
      filters.sort_order = sort_order;
    }

    const manager = getPassportManager();
    const result = await manager.listPassports(filters);

    return {
      success: true,
      passports: result.items,
      pagination: result.pagination,
    };
  }

  private async toolRunInference(args: Record<string, unknown>) {
    const { model_passport_id, prompt, policy, max_tokens, temperature, stream } = args;
    
    if (!model_passport_id) {
      return { success: false, error: 'Missing required field: model_passport_id' };
    }
    if (!prompt) {
      return { success: false, error: 'Missing required field: prompt' };
    }

    // For MCP tool, we don't support streaming - it returns synchronously
    if (stream) {
      return { success: false, error: 'Streaming not supported via MCP tools. Use the HTTP API for streaming.' };
    }

    // Note: This requires the execution gateway to be properly set up
    // For MVP, we return a placeholder indicating the tool is available but needs HTTP API
    return {
      success: false,
      error: 'lucid_run_inference via MCP is not fully implemented yet. Use POST /v1/run/inference HTTP endpoint.',
      hint: {
        endpoint: 'POST /v1/run/inference',
        body: {
          model_passport_id,
          prompt,
          policy: policy || {},
          max_tokens: max_tokens || 256,
          temperature: temperature || 0.7,
          stream: stream || false,
        },
      },
    };
  }
}

// Singleton instance
let mcpServerInstance: LucidMcpServer | null = null;

export function getMcpServer(): LucidMcpServer {
  if (!mcpServerInstance) {
    mcpServerInstance = new LucidMcpServer();
  }
  return mcpServerInstance;
}

// Export for testing
export function resetMcpServer(): void {
  mcpServerInstance = null;
}
