// offchain/src/services/n8nGateway.ts
import crypto from 'crypto';
import axios, { AxiosError } from 'axios';

export interface N8nConfig {
  url: string;
  hmacSecret: string;
  enabled: boolean;
  timeout?: number;
}

export interface N8nWorkflowRequest {
  workflowType: string;
  text?: string;
  input?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  [key: string]: any;
}

export interface N8nWorkflowResponse {
  content?: string;
  hash?: string;
  model?: string;
  provider?: string;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  cost?: number;
  qualityScore?: number;
  timestamp?: number;
  txSignature?: string;
  success?: boolean;
  [key: string]: any;
}

export class N8nGateway {
  private config: N8nConfig;

  constructor(config: N8nConfig) {
    this.config = {
      ...config,
      timeout: config.timeout || 30000
    };
  }

  /**
   * Generate HMAC signature for request authentication
   */
  private generateSignature(payload: any): string {
    const payloadStr = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', this.config.hmacSecret)
      .update(payloadStr)
      .digest('hex');
  }

  /**
   * Execute a workflow through n8n gateway
   */
  async executeWorkflow(
    request: N8nWorkflowRequest,
    tenantId: string = 'default'
  ): Promise<N8nWorkflowResponse> {
    if (!this.config.enabled) {
      throw new Error('n8n gateway is disabled');
    }

    const payload = {
      ...request,
      timestamp: Date.now()
    };

    const signature = this.generateSignature(payload);

    try {
      console.log(`🌉 n8n Gateway: Executing ${request.workflowType} workflow`);
      
      const response = await axios.post(
        `${this.config.url}/webhook/lucid-gateway`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Signature': signature,
            'X-Tenant-Id': tenantId
          },
          timeout: this.config.timeout
        }
      );

      console.log(`✅ n8n Gateway: Workflow completed successfully`);
      return response.data;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        console.error(`❌ n8n Gateway Error:`, axiosError.response?.data || axiosError.message);
        
        throw new Error(
          `n8n workflow execution failed: ${
            (axiosError.response?.data as any)?.message || 
            axiosError.message
          }`
        );
      }
      throw error;
    }
  }

  /**
   * Execute LLM inference workflow
   */
  async executeLLMInference(
    text: string,
    model?: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
      tenantId?: string;
    }
  ): Promise<N8nWorkflowResponse> {
    return this.executeWorkflow(
      {
        workflowType: 'llm-inference',
        text,
        model,
        maxTokens: options?.maxTokens,
        temperature: options?.temperature
      },
      options?.tenantId
    );
  }

  /**
   * Execute Solana write workflow
   */
  async executeSolanaWrite(
    hash: string,
    content: string,
    metadata?: {
      model?: string;
      qualityScore?: number;
      tenantId?: string;
    }
  ): Promise<N8nWorkflowResponse> {
    return this.executeWorkflow(
      {
        workflowType: 'solana-write',
        hash,
        content,
        model: metadata?.model,
        qualityScore: metadata?.qualityScore
      },
      metadata?.tenantId
    );
  }

  /**
   * Execute complete LLM + Solana pipeline
   */
  async executeFullPipeline(
    text: string,
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      tenantId?: string;
    }
  ): Promise<{
    llmResponse: N8nWorkflowResponse;
    solanaResponse: N8nWorkflowResponse;
  }> {
    // Step 1: LLM Inference
    const llmResponse = await this.executeLLMInference(
      text,
      options?.model,
      options
    );

    if (!llmResponse.hash || !llmResponse.content) {
      throw new Error('LLM response missing required fields (hash, content)');
    }

    // Step 2: Write to Solana
    const solanaResponse = await this.executeSolanaWrite(
      llmResponse.hash,
      llmResponse.content,
      {
        model: llmResponse.model,
        qualityScore: llmResponse.qualityScore,
        tenantId: options?.tenantId
      }
    );

    return {
      llmResponse,
      solanaResponse
    };
  }

  /**
   * Health check for n8n gateway
   */
  async healthCheck(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    try {
      const response = await axios.get(`${this.config.url}/`, {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      console.error('n8n health check failed:', error);
      return false;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): N8nConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<N8nConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig
    };
  }
}

// Factory function for easy instantiation
export function createN8nGateway(config: N8nConfig): N8nGateway {
  return new N8nGateway(config);
}
