"""
FlowSpec to LangGraph Compiler
Compiles FlowSpec DSL into executable LangGraph state machines
"""

from typing import Dict, Any, List
from langgraph.graph import StateGraph, END
from .node_factories import NodeFactories
import logging

logger = logging.getLogger(__name__)


class FlowSpecCompiler:
    """
    Compiles FlowSpec DSL to LangGraph state machines
    
    FlowSpec Structure:
    {
        "name": "workflow-name",
        "nodes": [
            {"id": "node1", "type": "llm.chat", "input": {...}},
            {"id": "node2", "type": "tool.http", "input": {...}}
        ],
        "edges": [
            {"from": "node1", "to": "node2"},
            {"from": "node2", "to": "node3", "when": "condition"}
        ]
    }
    """
    
    def __init__(self):
        self.node_factories = NodeFactories()
    
    async def compile_and_execute(
        self,
        flowspec: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Compile FlowSpec and execute it
        
        Args:
            flowspec: FlowSpec definition
            context: Initial execution context
            
        Returns:
            Final state after execution
        """
        try:
            logger.info(f"Compiling FlowSpec: {flowspec.get('name', 'unnamed')}")
            
            # Validate FlowSpec
            self._validate_flowspec(flowspec)
            
            # Build the state graph
            graph = self._build_graph(flowspec)
            
            # Initialize state with context
            initial_state = {
                '_context': context,
                '_flowspec_name': flowspec.get('name', 'unnamed')
            }
            
            # Execute the graph
            logger.info("Executing workflow...")
            final_state = await graph.ainvoke(initial_state)
            
            logger.info("Workflow execution complete")
            return final_state
            
        except Exception as e:
            logger.error(f"Error compiling/executing FlowSpec: {str(e)}")
            raise
    
    def _build_graph(self, flowspec: Dict[str, Any]) -> StateGraph:
        """
        Build LangGraph state machine from FlowSpec
        
        Args:
            flowspec: FlowSpec definition
            
        Returns:
            Compiled StateGraph
        """
        # Create state graph with dict state
        workflow = StateGraph(dict)
        
        nodes = flowspec.get('nodes', [])
        edges = flowspec.get('edges', [])
        
        logger.info(f"Building graph with {len(nodes)} nodes and {len(edges)} edges")
        logger.info(f"Edges detail: {edges}")
        
        # Add all nodes
        for node in nodes:
            node_id = node['id']
            node_func = NodeFactories.create(node)
            workflow.add_node(node_id, node_func)
            logger.info(f"Added node: {node_id} (type: {node.get('type')})")
        
        # Set entry point FIRST (before adding edges)
        if nodes:
            entry_point = nodes[0]['id']
            workflow.set_entry_point(entry_point)
            logger.info(f"Set entry point: {entry_point}")
        
        # Add edges
        for edge in edges:
            from_node = edge.get('from')
            to_node = edge.get('to')
            condition = edge.get('when')
            
            logger.info(f"Processing edge: from={from_node}, to={to_node}, when={condition}")
            
            if condition:
                # Conditional edge
                logger.info(f"Adding conditional edge: {from_node} -> {to_node} (when: {condition})")
                # For conditional edges, provide path_map
                workflow.add_conditional_edges(
                    from_node,
                    self._make_condition_router(to_node, condition),
                    {to_node: to_node, END: END}  # Path map
                )
            else:
                # Regular edge
                logger.info(f"Adding regular edge: {from_node} -> {to_node}")
                if from_node and to_node:
                    workflow.add_edge(from_node, to_node)
                elif from_node:
                    # Edge to END
                    workflow.add_edge(from_node, END)
        
        # Find terminal nodes (nodes with no outgoing edges) and connect to END
        node_ids = {node['id'] for node in nodes}
        nodes_with_outgoing = {edge.get('from') for edge in edges if edge.get('from')}
        
        terminal_nodes = node_ids - nodes_with_outgoing
        
        logger.info(f"Terminal nodes: {terminal_nodes}")
        
        # Add END edges for terminal nodes
        for terminal_node in terminal_nodes:
            logger.info(f"Connecting terminal node to END: {terminal_node}")
            workflow.add_edge(terminal_node, END)
        
        # Compile the graph
        compiled_graph = workflow.compile()
        logger.info("Graph compiled successfully")
        
        return compiled_graph
    
    def _make_condition_router(self, target_node: str, condition: str):
        """
        Create a condition router function for conditional edges
        
        Args:
            target_node: Node to route to if condition is true
            condition: Condition expression
            
        Returns:
            Router function
        """
        def router(state: Dict) -> str:
            """Route based on condition evaluation"""
            try:
                # Simple condition evaluation
                # In production, use a proper expression evaluator
                
                if condition == 'true':
                    return target_node
                elif condition == 'false':
                    return END
                
                # Check if condition refers to a previous node's output
                if condition.startswith('$ref.'):
                    # Get the referenced value
                    ref_path = condition[5:]
                    parts = ref_path.split('.')
                    
                    value = state
                    for part in parts:
                        if isinstance(value, dict):
                            value = value.get(part)
                        else:
                            return END
                    
                    # If value is truthy, go to target node
                    if value:
                        return target_node
                    else:
                        return END
                
                # Default: evaluate to true and go to target
                return target_node
                
            except Exception as e:
                logger.error(f"Error evaluating condition '{condition}': {str(e)}")
                return END
        
        return router
    
    def _validate_flowspec(self, flowspec: Dict[str, Any]):
        """
        Validate FlowSpec structure
        
        Args:
            flowspec: FlowSpec to validate
            
        Raises:
            ValueError: If FlowSpec is invalid
        """
        if not isinstance(flowspec, dict):
            raise ValueError("FlowSpec must be a dictionary")
        
        if 'nodes' not in flowspec:
            raise ValueError("FlowSpec must have 'nodes' field")
        
        nodes = flowspec.get('nodes', [])
        if not isinstance(nodes, list):
            raise ValueError("FlowSpec 'nodes' must be a list")
        
        if not nodes:
            raise ValueError("FlowSpec must have at least one node")
        
        # Validate nodes
        node_ids = set()
        for i, node in enumerate(nodes):
            if not isinstance(node, dict):
                raise ValueError(f"Node {i} must be a dictionary")
            
            if 'id' not in node:
                raise ValueError(f"Node {i} missing 'id' field")
            
            if 'type' not in node:
                raise ValueError(f"Node {i} missing 'type' field")
            
            node_id = node['id']
            if node_id in node_ids:
                raise ValueError(f"Duplicate node ID: {node_id}")
            
            node_ids.add(node_id)
        
        # Validate edges
        edges = flowspec.get('edges', [])
        if not isinstance(edges, list):
            raise ValueError("FlowSpec 'edges' must be a list")
        
        for i, edge in enumerate(edges):
            if not isinstance(edge, dict):
                raise ValueError(f"Edge {i} must be a dictionary")
            
            if 'to' not in edge:
                raise ValueError(f"Edge {i} missing 'to' field")
            
            # Validate node references
            from_node = edge.get('from')
            to_node = edge.get('to')
            
            if from_node and from_node not in node_ids:
                raise ValueError(f"Edge {i} references unknown 'from' node: {from_node}")
            
            if to_node and to_node not in node_ids:
                raise ValueError(f"Edge {i} references unknown 'to' node: {to_node}")
        
        logger.info("FlowSpec validation passed")
    
    def estimate_complexity(self, flowspec: Dict[str, Any]) -> str:
        """
        Estimate workflow complexity
        
        Args:
            flowspec: FlowSpec definition
            
        Returns:
            Complexity level: 'simple', 'moderate', or 'complex'
        """
        nodes = flowspec.get('nodes', [])
        edges = flowspec.get('edges', [])
        
        node_count = len(nodes)
        edge_count = len(edges)
        conditional_count = len([e for e in edges if e.get('when')])
        
        # Count loop and condition nodes
        control_nodes = len([n for n in nodes if n.get('type', '').startswith('control.')])
        
        # Simple: 1-3 nodes, no conditionals
        if node_count <= 3 and conditional_count == 0 and control_nodes == 0:
            return 'simple'
        
        # Complex: >10 nodes, multiple conditionals, or loops
        if node_count > 10 or conditional_count > 3 or control_nodes > 2:
            return 'complex'
        
        # Moderate: everything else
        return 'moderate'
    
    def analyze_workflow(self, flowspec: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze workflow characteristics
        
        Args:
            flowspec: FlowSpec definition
            
        Returns:
            Analysis results
        """
        nodes = flowspec.get('nodes', [])
        edges = flowspec.get('edges', [])
        
        # Count node types
        node_types = {}
        for node in nodes:
            node_type = node.get('type', 'unknown')
            node_types[node_type] = node_types.get(node_type, 0) + 1
        
        # Analyze graph structure
        has_loops = self._detect_loops(nodes, edges)
        has_conditionals = any(e.get('when') for e in edges)
        
        # Find parallel paths
        parallel_branches = self._count_parallel_branches(nodes, edges)
        
        return {
            'node_count': len(nodes),
            'edge_count': len(edges),
            'node_types': node_types,
            'complexity': self.estimate_complexity(flowspec),
            'has_loops': has_loops,
            'has_conditionals': has_conditionals,
            'parallel_branches': parallel_branches,
            'estimated_execution_time': self._estimate_execution_time(nodes)
        }
    
    def _detect_loops(self, nodes: List[Dict], edges: List[Dict]) -> bool:
        """Detect if workflow has loops (cycles)"""
        # Build adjacency list
        graph = {node['id']: [] for node in nodes}
        for edge in edges:
            from_node = edge.get('from')
            to_node = edge.get('to')
            if from_node and to_node:
                graph[from_node].append(to_node)
        
        # DFS to detect cycles
        visited = set()
        rec_stack = set()
        
        def has_cycle(node_id: str) -> bool:
            visited.add(node_id)
            rec_stack.add(node_id)
            
            for neighbor in graph.get(node_id, []):
                if neighbor not in visited:
                    if has_cycle(neighbor):
                        return True
                elif neighbor in rec_stack:
                    return True
            
            rec_stack.remove(node_id)
            return False
        
        for node in nodes:
            node_id = node['id']
            if node_id not in visited:
                if has_cycle(node_id):
                    return True
        
        return False
    
    def _count_parallel_branches(self, nodes: List[Dict], edges: List[Dict]) -> int:
        """Count number of parallel execution branches"""
        # Build adjacency list
        graph = {node['id']: [] for node in nodes}
        for edge in edges:
            from_node = edge.get('from')
            to_node = edge.get('to')
            if from_node and to_node:
                graph[from_node].append(to_node)
        
        # Find nodes with multiple outgoing edges (branching points)
        max_branches = 0
        for node_id, neighbors in graph.items():
            if len(neighbors) > max_branches:
                max_branches = len(neighbors)
        
        return max_branches
    
    def _estimate_execution_time(self, nodes: List[Dict]) -> int:
        """Estimate execution time in seconds"""
        # Rough estimates per node type
        time_estimates = {
            'llm.chat': 3,
            'tool.http': 2,
            'tool.mcp': 2,
            'solana.write': 5,
            'solana.read': 1,
            'data.transform': 0.5,
            'control.condition': 0.1,
            'control.loop': 1,
        }
        
        total_time = 0
        for node in nodes:
            node_type = node.get('type', '')
            total_time += time_estimates.get(node_type, 1)
        
        return int(total_time)
