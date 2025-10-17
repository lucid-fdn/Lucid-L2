/**
 * Agent Planner Service
 * Connects to CrewAI service to generate workflows from natural language goals
 */
import axios from 'axios';
import { FlowSpec } from '../flowspec/types';

export interface PlanRequest {
  goal: string;
  context?: Record<string, any>;
  constraints?: string[];
}

export interface PlanResponse {
  flowspec: FlowSpec;
  reasoning: string;
  estimated_complexity: 'simple' | 'moderate' | 'complex';
}

export class AgentPlannerService {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8082') {
    this.baseUrl = baseUrl;
  }

  /**
   * Plan a workflow from a natural language goal
   */
  async planWorkflow(request: PlanRequest): Promise<PlanResponse> {
    try {
      const response = await axios.post<PlanResponse>(
        `${this.baseUrl}/plan`,
        request,
        {
          timeout: 60000, // 60 second timeout for planning
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Failed to plan workflow: ${error.response?.data?.detail || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Validate a FlowSpec structure
   */
  async validateFlowSpec(flowspec: FlowSpec): Promise<{ valid: boolean; error?: string; message?: string }> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/validate`,
        flowspec,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Failed to validate FlowSpec: ${error.response?.data?.detail || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Check if CrewAI service is healthy
   */
  async health(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: 5000,
      });
      return response.data.status === 'healthy';
    } catch {
      return false;
    }
  }

  /**
   * Get service info
   */
  async info(): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/`, {
        timeout: 5000,
      });
      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Failed to get service info: ${error.message}`
        );
      }
      throw error;
    }
  }
}

// Singleton instance
let plannerInstance: AgentPlannerService | null = null;

export function getAgentPlanner(baseUrl?: string): AgentPlannerService {
  if (!plannerInstance) {
    plannerInstance = new AgentPlannerService(baseUrl);
  }
  return plannerInstance;
}
