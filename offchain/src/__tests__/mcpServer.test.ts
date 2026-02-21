/**
 * Tests for PR7: MCP Server Implementation
 */
import { LucidMcpServer, getMcpServer, resetMcpServer } from '../mcp/mcpServer';
import { getComputeRegistry } from '../services/computeRegistry';

describe('MCP Server', () => {
  let server: LucidMcpServer;

  beforeEach(() => {
    resetMcpServer();
    server = getMcpServer();
  });

  describe('Server Info', () => {
    it('should return server info', () => {
      const info = server.getServerInfo();
      expect(info.name).toBe('lucid-layer-sdk');
      expect(info.version).toBe('1.0.0');
    });

    it.skip('should not throw when listing tools/resources without legacy manifest', () => {
      expect(() => server.listTools()).not.toThrow();
      expect(() => server.listResources()).not.toThrow();
      expect(server.listTools()).toEqual([]);
      expect(server.listResources()).toEqual([]);
    });

    it('should return capabilities', () => {
      const caps = server.getCapabilities();
      expect(caps.tools).toBeDefined();
      expect(caps.resources).toBeDefined();
    });
  });

  describe('Tools', () => {
    it('should list available tools', () => {
      const tools = server.listTools();
      expect(tools.length).toBeGreaterThan(0);
      
      const toolNames = tools.map((t: any) => t.name);
      expect(toolNames).toContain('lucid_match_explain');
      expect(toolNames).toContain('lucid_match');
      expect(toolNames).toContain('lucid_route');
      expect(toolNames).toContain('lucid_heartbeat');
      expect(toolNames).toContain('lucid_create_receipt');
      expect(toolNames).toContain('lucid_calculate_payout');
    });

    it('should have input schemas for all tools', () => {
      const tools = server.listTools();
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('Resources', () => {
    it('should list available resources', () => {
      const resources = server.listResources();
      expect(resources.length).toBeGreaterThan(0);
      
      const uris = resources.map((r: any) => r.uri);
      expect(uris).toContain('lucid://schemas/policy');
      expect(uris).toContain('lucid://mmr/root');
    });

    it('should read MMR root resource', async () => {
      const result = await server.readResource('lucid://mmr/root');
      expect(result.contents).toBeDefined();
      expect(result.contents[0].uri).toBe('lucid://mmr/root');
      expect(result.contents[0].mimeType).toBe('application/json');
      
      const data = JSON.parse(result.contents[0].text || '{}');
      expect(data.root).toBeDefined();
      expect(data.leaf_count).toBeDefined();
    });

    it('should throw for unknown resource', async () => {
      await expect(server.readResource('lucid://unknown')).rejects.toThrow('Resource not found');
    });
  });

  describe('Tool Execution', () => {
    describe('lucid_match_explain', () => {
      it('should evaluate policy and return result', async () => {
        const result = await server.callTool({
          name: 'lucid_match_explain',
          arguments: {
            policy: {
              policy_version: '1.0',
              allow_regions: ['US', 'EU'],
            },
            compute_meta: {
              compute_passport_id: 'test-compute-001',
              regions: ['US'],  // Must be array, matching policy engine expectations
              supported_runtimes: ['vLLM'],
              vram_gb: 24,
            },
          },
        });

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text || '{}');
        expect(data.success).toBe(true);
        expect(data.allowed).toBe(true);
        expect(data.policy_hash).toBeDefined();
      });
    });

    describe('lucid_heartbeat', () => {
      it('should register heartbeat', async () => {
        const result = await server.callTool({
          name: 'lucid_heartbeat',
          arguments: {
            compute_passport_id: 'mcp-test-compute-001',
            status: 'healthy',
            queue_depth: 5,
          },
        });

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text || '{}');
        expect(data.success).toBe(true);
        expect(data.state.status).toBe('healthy');
      });

      it('should reject invalid status', async () => {
        const result = await server.callTool({
          name: 'lucid_heartbeat',
          arguments: {
            compute_passport_id: 'mcp-test-compute-001',
            status: 'invalid',
          },
        });

        const data = JSON.parse(result.content[0].text || '{}');
        expect(data.success).toBe(false);
        expect(data.error).toContain('status must be');
      });
    });

    describe('lucid_get_health', () => {
      it('should get health after heartbeat', async () => {
        // First send heartbeat
        await server.callTool({
          name: 'lucid_heartbeat',
          arguments: {
            compute_passport_id: 'mcp-health-test-001',
            status: 'healthy',
          },
        });

        // Then get health
        const result = await server.callTool({
          name: 'lucid_get_health',
          arguments: {
            compute_passport_id: 'mcp-health-test-001',
          },
        });

        const data = JSON.parse(result.content[0].text || '{}');
        expect(data.success).toBe(true);
        expect(data.state.status).toBe('healthy');
      });
    });

    describe('lucid_create_receipt', () => {
      it('should create receipt', async () => {
        const result = await server.callTool({
          name: 'lucid_create_receipt',
          arguments: {
            model_passport_id: 'model-mcp-test',
            compute_passport_id: 'compute-mcp-test',
            policy_hash: 'a'.repeat(64),
            runtime: 'vLLM',
            tokens_in: 100,
            tokens_out: 200,
            ttft_ms: 50,
          },
        });

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text || '{}');
        expect(data.success).toBe(true);
        expect(data.receipt.run_id).toBeDefined();
        expect(data.receipt.receipt_hash).toBeDefined();
      });

      it('should reject missing required fields', async () => {
        const result = await server.callTool({
          name: 'lucid_create_receipt',
          arguments: {
            model_passport_id: 'model-mcp-test',
            // Missing other required fields
          },
        });

        const data = JSON.parse(result.content[0].text || '{}');
        expect(data.success).toBe(false);
        expect(data.error).toContain('Missing required field');
      });
    });

    describe('lucid_get_mmr_root', () => {
      it('should return MMR root', async () => {
        const result = await server.callTool({
          name: 'lucid_get_mmr_root',
          arguments: {},
        });

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text || '{}');
        expect(data.success).toBe(true);
        expect(data.root).toBeDefined();
        expect(typeof data.leaf_count).toBe('number');
      });
    });

    describe('lucid_calculate_payout', () => {
      it('should calculate payout split', async () => {
        const result = await server.callTool({
          name: 'lucid_calculate_payout',
          arguments: {
            run_id: 'mcp-run-payout-001',
            total_amount_lamports: '10000000',
            compute_wallet: 'ComputeWallet111111111111111111111111111111',
          },
        });

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text || '{}');
        expect(data.success).toBe(true);
        expect(data.payout.run_id).toBe('mcp-run-payout-001');
        expect(data.payout.total_amount_lamports).toBe('10000000');
        expect(data.payout.recipients.length).toBe(3); // compute, model, protocol
      });
    });

    describe('Unknown tool', () => {
      it('should return error for unknown tool', async () => {
        const result = await server.callTool({
          name: 'unknown_tool',
          arguments: {},
        });

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text || '{}');
        expect(data.error).toContain('Unknown tool');
      });
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const server1 = getMcpServer();
      const server2 = getMcpServer();
      expect(server1).toBe(server2);
    });

    it('should create new instance after reset', () => {
      const server1 = getMcpServer();
      resetMcpServer();
      const server2 = getMcpServer();
      expect(server1).not.toBe(server2);
    });
  });
});
