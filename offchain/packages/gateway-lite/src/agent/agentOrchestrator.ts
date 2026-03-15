/**
 * Agent Orchestrator Service
 * 
 * Combines AgentPlanner + ExecutorRouter into a unified agent experience.
 * Takes natural language goals and returns complete execution results.
 */

import { AgentPlannerService, PlanRequest, PlanResponse } from './agentPlanner';
import { ExecutorRouter, ExecutorType } from './executorRouter';
import { FlowSpec } from '../../../contrib/integrations/flowspec/types';
import { logger } from '../../../engine/src/shared/lib/logger';

export interface AgentAccomplishRequest {
  goal: string;
  context?: Record<string, unknown>;
  preferredExecutor?: ExecutorType;
  dryRun?: boolean; // If true, only plan but don't execute
}

export interface AgentAccomplishResult {
  success: boolean;
  goal: string;
  flowspec: FlowSpec;
  executor?: ExecutorType;
  executionResult?: any;
  planningTime: number;
  executionTime?: number;
  totalTime: number;
  timestamp: number;
  error?: string;
}

export interface AgentHistoryEntry {
  id: string;
  goal: string;
  flowspec: FlowSpec;
  executor: ExecutorType;
  success: boolean;
  timestamp: number;
  executionTime: number;
}

/**
 * Agent Orchestrator - Unified agent service
 */
export class AgentOrchestrator {
  private planner: AgentPlannerService;
  private router: ExecutorRouter;
  private history: Map<string, AgentHistoryEntry[]> = new Map();
  
  constructor() {
    this.planner = new AgentPlannerService();
    this.router = new ExecutorRouter();
  }

  /**
   * Main method: Accomplish a goal from natural language to results
   */
  async accomplish(request: AgentAccomplishRequest): Promise<AgentAccomplishResult> {
    const startTime = Date.now();
    const { goal, context = {}, preferredExecutor, dryRun = false } = request;

    try {
      logger.info(`🎯 AgentOrchestrator: Accomplishing goal: "${goal}"`);
      
      // Step 1: Plan the workflow
      const planStartTime = Date.now();
      logger.info('📋 Step 1: Planning workflow with CrewAI...');
      
      const planRequest: PlanRequest = { goal, context };
      const planResponse: PlanResponse = await this.planner.planWorkflow(planRequest);
      const flowspec = planResponse.flowspec;
      const planningTime = Date.now() - planStartTime;
      
      logger.info(`✅ FlowSpec generated with ${flowspec.nodes.length} nodes (${planningTime}ms)`);

      // If dry run, return plan without executing
      if (dryRun) {
        return {
          success: true,
          goal,
          flowspec,
          planningTime,
          totalTime: Date.now() - startTime,
          timestamp: Date.now()
        };
      }

      // Step 2: Execute the workflow
      const execStartTime = Date.now();
      logger.info('⚙️ Step 2: Executing workflow...');
      
      const executionResult = await this.router.execute(
        flowspec,
        context as any,
        preferredExecutor
      );
      
      const executionTime = Date.now() - execStartTime;
      const totalTime = Date.now() - startTime;

      logger.info(`✅ Execution complete via ${executionResult.executor} (${executionTime}ms)`);
      logger.info(`🎉 Total time: ${totalTime}ms`);

      // Store in history
      if (context.tenantId) {
        this.addToHistory(
          context.tenantId as string,
          goal,
          flowspec,
          executionResult.executor,
          executionResult.success,
          executionTime
        );
      }

      return {
        success: executionResult.success,
        goal,
        flowspec,
        executor: executionResult.executor,
        executionResult: executionResult.outputs,
        planningTime,
        executionTime,
        totalTime,
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('❌ AgentOrchestrator error:', error);
      return {
        success: false,
        goal,
        flowspec: { name: 'failed', nodes: [], edges: [] },
        planningTime: Date.now() - startTime,
        totalTime: Date.now() - startTime,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Preview a workflow without executing it (dry run)
   */
  async preview(goal: string, context?: Record<string, unknown>): Promise<AgentAccomplishResult> {
    return this.accomplish({ goal, context, dryRun: true });
  }

  /**
   * Get execution history for a tenant
   */
  getHistory(tenantId: string, limit: number = 50): AgentHistoryEntry[] {
    const entries = this.history.get(tenantId) || [];
    return entries.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Clear history for a tenant
   */
  clearHistory(tenantId: string): void {
    this.history.delete(tenantId);
  }

  /**
   * Get history statistics
   */
  getHistoryStats(tenantId: string): {
    totalExecutions: number;
    successRate: number;
    averageExecutionTime: number;
    favoredExecutor: ExecutorType | null;
  } {
    const entries = this.history.get(tenantId) || [];
    
    if (entries.length === 0) {
      return {
        totalExecutions: 0,
        successRate: 0,
        averageExecutionTime: 0,
        favoredExecutor: null
      };
    }

    const successful = entries.filter(e => e.success).length;
    const avgTime = entries.reduce((sum, e) => sum + e.executionTime, 0) / entries.length;
    
    // Count executor usage
    const executorCounts = entries.reduce((acc, e) => {
      acc[e.executor] = (acc[e.executor] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const favoredExecutor = Object.entries(executorCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] as ExecutorType || null;

    return {
      totalExecutions: entries.length,
      successRate: (successful / entries.length) * 100,
      averageExecutionTime: Math.round(avgTime),
      favoredExecutor
    };
  }

  /**
   * Add entry to history
   */
  private addToHistory(
    tenantId: string,
    goal: string,
    flowspec: FlowSpec,
    executor: ExecutorType,
    success: boolean,
    executionTime: number
  ): void {
    if (!this.history.has(tenantId)) {
      this.history.set(tenantId, []);
    }
    
    const entries = this.history.get(tenantId)!;
    entries.push({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      goal,
      flowspec,
      executor,
      success,
      timestamp: Date.now(),
      executionTime
    });

    // Keep only last 100 entries per tenant
    if (entries.length > 100) {
      entries.shift();
    }
  }

  /**
   * Health check - verify all components are operational
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    components: {
      planner: boolean;
      router: boolean;
      langgraph: boolean;
      crewai: boolean;
    };
  }> {
    try {
      // Check router (which checks both executors)
      const executorHealth = await this.router.checkExecutorHealth();
      
      // Check planner (CrewAI)
      const plannerHealthy = await this.planner.health();

      const healthy = executorHealth.n8n && executorHealth.langgraph && plannerHealthy;

      return {
        healthy,
        components: {
          planner: plannerHealthy,
          router: executorHealth.n8n || executorHealth.langgraph,
          langgraph: executorHealth.langgraph,
          crewai: plannerHealthy
        }
      };
    } catch (error) {
      logger.error('Health check error:', error);
      return {
        healthy: false,
        components: {
          planner: false,
          router: false,
          langgraph: false,
          crewai: false
        }
      };
    }
  }
}

// Singleton instance
let orchestratorInstance: AgentOrchestrator | null = null;

export function getAgentOrchestrator(): AgentOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new AgentOrchestrator();
  }
  return orchestratorInstance;
}
