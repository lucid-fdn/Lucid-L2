/**
 * Executor Router Service
 * Intelligently routes FlowSpec workflows to n8n or LangGraph
 * based on workflow complexity and characteristics
 */

import axios from 'axios';
import { FlowSpec, FlowExecutionContext, FlowExecutionResult } from '../contrib/integrations/flowspec/types';
import { FlowSpecService } from '../contrib/integrations/flowspec/flowspecService';
import { N8N_URL, N8N_HMAC_SECRET, N8N_API_KEY } from '../../../engine/src/config/config';

export type ExecutorType = 'n8n' | 'langgraph';

export interface ExecutorDecision {
  executor: ExecutorType;
  reason: string;
  confidence: number;
  complexity: 'simple' | 'moderate' | 'complex';
}

export class ExecutorRouter {
  private n8nService: FlowSpecService;
  private langGraphUrl: string;

  constructor(langGraphUrl: string = 'http://localhost:8083') {
    this.n8nService = new FlowSpecService(N8N_URL, N8N_HMAC_SECRET, N8N_API_KEY);
    this.langGraphUrl = langGraphUrl;
  }

  /**
   * Execute a FlowSpec workflow with automatic executor selection
   */
  async execute(
    flowspec: FlowSpec,
    context: FlowExecutionContext,
    preferredExecutor?: ExecutorType
  ): Promise<FlowExecutionResult & { executor: ExecutorType }> {
    // Determine which executor to use
    const decision = preferredExecutor 
      ? { executor: preferredExecutor, reason: 'User preference', confidence: 1.0, complexity: this.analyzeComplexity(flowspec) }
      : this.selectBestExecutor(flowspec);

    console.log(`🔀 Routing to ${decision.executor} executor`);
    console.log(`   Reason: ${decision.reason}`);
    console.log(`   Complexity: ${decision.complexity}`);
    console.log(`   Confidence: ${(decision.confidence * 100).toFixed(0)}%`);

    // Route to appropriate executor
    if (decision.executor === 'langgraph') {
      const result = await this.executeLangGraph(flowspec, context);
      return { ...result, executor: 'langgraph' };
    } else {
      const result = await this.executeN8n(flowspec, context);
      return { ...result, executor: 'n8n' };
    }
  }

  /**
   * Select the best executor based on FlowSpec characteristics
   */
  selectBestExecutor(flowspec: FlowSpec): ExecutorDecision {
    const analysis = this.analyzeFlowSpec(flowspec);
    
    // Decision tree based on workflow characteristics
    
    // 1. Check for loops/recursion → LangGraph (better support)
    if (analysis.hasLoops) {
      return {
        executor: 'langgraph',
        reason: 'Workflow contains loops - LangGraph has better loop support',
        confidence: 0.95,
        complexity: analysis.complexity
      };
    }

    // 2. Check for many conditional branches → LangGraph (state management)
    if (analysis.conditionalCount > 3) {
      return {
        executor: 'langgraph',
        reason: `${analysis.conditionalCount} conditional branches - LangGraph better for complex routing`,
        confidence: 0.9,
        complexity: analysis.complexity
      };
    }

    // 3. Check if uses MCP tools → LangGraph (native integration)
    if (analysis.usesMCPTools) {
      return {
        executor: 'langgraph',
        reason: 'Uses MCP tools - LangGraph has native MCP integration',
        confidence: 0.85,
        complexity: analysis.complexity
      };
    }

    // 4. Check node count (complexity) → LangGraph for complex workflows
    if (analysis.nodeCount > 10) {
      return {
        executor: 'langgraph',
        reason: `${analysis.nodeCount} nodes - LangGraph better for complex workflows`,
        confidence: 0.8,
        complexity: analysis.complexity
      };
    }

    // 5. Check for control flow nodes → LangGraph
    if (analysis.controlNodeCount > 0) {
      return {
        executor: 'langgraph',
        reason: `${analysis.controlNodeCount} control nodes - LangGraph better for state machines`,
        confidence: 0.75,
        complexity: analysis.complexity
      };
    }

    // 6. Default to n8n for simple workflows (visual debugging)
    return {
      executor: 'n8n',
      reason: 'Simple workflow - n8n provides better visual debugging and monitoring',
      confidence: 0.7,
      complexity: analysis.complexity
    };
  }

  /**
   * Analyze FlowSpec to determine characteristics
   */
  private analyzeFlowSpec(flowspec: FlowSpec): {
    nodeCount: number;
    edgeCount: number;
    conditionalCount: number;
    controlNodeCount: number;
    usesMCPTools: boolean;
    hasLoops: boolean;
    complexity: 'simple' | 'moderate' | 'complex';
  } {
    const nodeCount = flowspec.nodes.length;
    const edgeCount = flowspec.edges.length;
    
    // Count conditional edges
    const conditionalCount = flowspec.edges.filter(e => e.when).length;
    
    // Count control flow nodes (condition, loop)
    const controlNodeCount = flowspec.nodes.filter(n => 
      n.type.startsWith('control.')
    ).length;
    
    // Check for MCP tool usage
    const usesMCPTools = flowspec.nodes.some(n => n.type === 'tool.mcp');
    
    // Detect loops (simplified - check for cycles in graph)
    const hasLoops = this.detectLoops(flowspec);
    
    // Determine complexity
    const complexity = this.analyzeComplexity(flowspec);

    return {
      nodeCount,
      edgeCount,
      conditionalCount,
      controlNodeCount,
      usesMCPTools,
      hasLoops,
      complexity
    };
  }

  /**
   * Analyze workflow complexity
   */
  private analyzeComplexity(flowspec: FlowSpec): 'simple' | 'moderate' | 'complex' {
    const nodeCount = flowspec.nodes.length;
    const conditionalCount = flowspec.edges.filter(e => e.when).length;
    const controlNodes = flowspec.nodes.filter(n => n.type.startsWith('control.')).length;

    // Simple: 1-3 nodes, no conditionals
    if (nodeCount <= 3 && conditionalCount === 0 && controlNodes === 0) {
      return 'simple';
    }

    // Complex: >10 nodes, multiple conditionals, or control flow
    if (nodeCount > 10 || conditionalCount > 3 || controlNodes > 2) {
      return 'complex';
    }

    // Moderate: everything else
    return 'moderate';
  }

  /**
   * Detect if workflow has loops (cycles)
   */
  private detectLoops(flowspec: FlowSpec): boolean {
    // Build adjacency list
    const graph: Record<string, string[]> = {};
    flowspec.nodes.forEach(node => {
      graph[node.id] = [];
    });

    flowspec.edges.forEach(edge => {
      if (edge.from && edge.to) {
        if (!graph[edge.from]) graph[edge.from] = [];
        graph[edge.from].push(edge.to);
      }
    });

    // DFS to detect cycles
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);

      for (const neighbor of graph[nodeId] || []) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          return true;
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const nodeId of Object.keys(graph)) {
      if (!visited.has(nodeId)) {
        if (hasCycle(nodeId)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Execute workflow using LangGraph
   */
  private async executeLangGraph(
    flowspec: FlowSpec,
    context: FlowExecutionContext
  ): Promise<FlowExecutionResult> {
    try {
      console.log('📊 Executing via LangGraph...');
      
      const response = await axios.post(
        `${this.langGraphUrl}/execute`,
        { flowspec, context },
        { timeout: 60000 }
      );

      if (response.data.success) {
        return {
          success: true,
          executionId: `lg_${Date.now()}`,
          outputs: response.data.result || {},
          duration: response.data.executionTime
        };
      } else {
        throw new Error(response.data.error || 'LangGraph execution failed');
      }
    } catch (error: any) {
      console.error('❌ LangGraph execution error:', error.message);
      return {
        success: false,
        executionId: `lg_${Date.now()}`,
        outputs: {},
        errors: [error.message]
      };
    }
  }

  /**
   * Execute workflow using n8n
   */
  private async executeN8n(
    flowspec: FlowSpec,
    context: FlowExecutionContext
  ): Promise<FlowExecutionResult> {
    try {
      console.log('📊 Executing via n8n...');
      
      // Create workflow in n8n
      const workflowResult = await this.n8nService.createWorkflow(flowspec);
      
      // Execute it
      const executionResult = await this.n8nService.executeWorkflow(
        workflowResult.id,
        context
      );

      return executionResult;
    } catch (error: any) {
      console.error('❌ n8n execution error:', error.message);
      return {
        success: false,
        executionId: `n8n_${Date.now()}`,
        outputs: {},
        errors: [error.message]
      };
    }
  }

  /**
   * Get decision for a FlowSpec without executing
   */
  getExecutorDecision(flowspec: FlowSpec): ExecutorDecision {
    return this.selectBestExecutor(flowspec);
  }

  /**
   * Check executor availability
   */
  async checkExecutorHealth(): Promise<{
    n8n: boolean;
    langgraph: boolean;
  }> {
    let n8nHealthy = false;
    let langgraphHealthy = false;

    // Check n8n
    try {
      const response = await axios.get(`${N8N_URL}/healthz`, { timeout: 5000 });
      n8nHealthy = response.status === 200;
    } catch (error) {
      n8nHealthy = false;
    }

    // Check LangGraph
    try {
      const response = await axios.get(`${this.langGraphUrl}/health`, { timeout: 5000 });
      langgraphHealthy = response.data.status === 'healthy';
    } catch (error) {
      langgraphHealthy = false;
    }

    return { n8n: n8nHealthy, langgraph: langgraphHealthy };
  }
}

// Singleton instance
let routerInstance: ExecutorRouter | null = null;

export function getExecutorRouter(): ExecutorRouter {
  if (!routerInstance) {
    routerInstance = new ExecutorRouter();
  }
  return routerInstance;
}
