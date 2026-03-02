/**
 * FlowSpec Service
 * 
 * Service layer for managing FlowSpec workflows via n8n API
 */

import axios from 'axios';
import crypto from 'crypto';
import { FlowSpec, FlowExecutionContext, FlowExecutionResult } from './types';
import { N8nCompiler } from './n8nCompiler';

export class FlowSpecService {
  private n8nUrl: string;
  private n8nApiKey?: string;
  private compiler: N8nCompiler;
  private hmacSecret: string;

  constructor(n8nUrl: string, hmacSecret: string, n8nApiKey?: string) {
    this.n8nUrl = n8nUrl;
    this.n8nApiKey = n8nApiKey;
    this.hmacSecret = hmacSecret;
    this.compiler = new N8nCompiler();
  }

  /**
   * Create a new workflow from FlowSpec
   */
  async createWorkflow(spec: FlowSpec): Promise<{ id: string; url: string }> {
    // Validate the spec
    const validation = this.compiler.validate(spec);
    if (!validation.valid) {
      throw new Error(`Invalid FlowSpec: ${validation.errors.join(', ')}`);
    }

    // Compile to n8n format
    const n8nWorkflow = this.compiler.compile(spec);

    // Debug: log what we're sending to n8n
    console.log('🔍 FlowSpec input name:', spec.name);
    console.log('🔍 Compiled workflow name:', n8nWorkflow.name);
    console.log('🔍 Full payload to n8n API:', JSON.stringify(n8nWorkflow, null, 2));

    // Create workflow via n8n API
    try {
      const response = await axios.post(
        `${this.n8nUrl}/api/v1/workflows`,
        n8nWorkflow,
        {
          headers: this.getAuthHeaders()
        }
      );

      const workflowId = response.data.id;
      
      // Activate the workflow
      await this.activateWorkflow(workflowId);

      return {
        id: workflowId,
        url: `${this.n8nUrl}/workflow/${workflowId}`
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to create workflow: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Execute a workflow with input data
   */
  async executeWorkflow(
    workflowId: string,
    context: FlowExecutionContext
  ): Promise<FlowExecutionResult> {
    const startTime = Date.now();

    try {
      // Prepare execution payload
      const payload = {
        workflowId,
        tenantId: context.tenantId,
        userId: context.userId,
        variables: context.variables || {}
      };

      // Sign the payload
      const signature = this.signPayload(payload);

      // Execute via webhook
      const response = await axios.post(
        `${this.n8nUrl}/webhook/lucid-gateway`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Signature': signature,
            'X-Tenant-Id': context.tenantId
          },
          timeout: context.timeout || 30000
        }
      );

      return {
        success: true,
        executionId: response.data.executionId || 'unknown',
        outputs: response.data,
        duration: Date.now() - startTime
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          executionId: 'error',
          outputs: {},
          errors: [error.response?.data?.message || error.message],
          duration: Date.now() - startTime
        };
      }
      throw error;
    }
  }

  /**
   * Get workflow execution history
   */
  async getExecutionHistory(workflowId: string, limit = 10): Promise<any[]> {
    try {
      const response = await axios.get(
        `${this.n8nUrl}/api/v1/executions`,
        {
          params: {
            workflowId,
            limit
          },
          headers: this.getAuthHeaders()
        }
      );

      return response.data.data || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to get execution history: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Update an existing workflow
   */
  async updateWorkflow(workflowId: string, spec: FlowSpec): Promise<void> {
    // Validate the spec
    const validation = this.compiler.validate(spec);
    if (!validation.valid) {
      throw new Error(`Invalid FlowSpec: ${validation.errors.join(', ')}`);
    }

    // Compile to n8n format
    const n8nWorkflow = this.compiler.compile(spec);

    try {
      await axios.patch(
        `${this.n8nUrl}/api/v1/workflows/${workflowId}`,
        n8nWorkflow,
        {
          headers: this.getAuthHeaders()
        }
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to update workflow: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    try {
      await axios.delete(
        `${this.n8nUrl}/api/v1/workflows/${workflowId}`,
        {
          headers: this.getAuthHeaders()
        }
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to delete workflow: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * List all workflows
   */
  async listWorkflows(): Promise<any[]> {
    try {
      const response = await axios.get(
        `${this.n8nUrl}/api/v1/workflows`,
        {
          headers: this.getAuthHeaders()
        }
      );

      return response.data.data || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to list workflows: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }


  /**
   * Activate a workflow using the official n8n API endpoint
   * POST /api/v1/workflows/{id}/activate
   */
  private async activateWorkflow(workflowId: string): Promise<void> {
    try {
      // Use the dedicated activation endpoint
      await axios.post(
        `${this.n8nUrl}/api/v1/workflows/${workflowId}/activate`,
        {},  // No body required
        {
          headers: this.getAuthHeaders()
        }
      );
      
      console.log(`✅ Activated workflow ${workflowId}`);
    } catch (error) {
      console.error(`❌ Failed to activate workflow ${workflowId}`);
      if (axios.isAxiosError(error)) {
        console.error('Error:', error.response?.data || error.message);
      }
      throw error;
    }
  }

  /**
   * Get authentication headers for n8n API
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.n8nApiKey) {
      headers['X-N8N-API-KEY'] = this.n8nApiKey;
    }

    return headers;
  }

  /**
   * Sign a payload with HMAC
   */
  private signPayload(payload: any): string {
    return crypto
      .createHmac('sha256', this.hmacSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}
