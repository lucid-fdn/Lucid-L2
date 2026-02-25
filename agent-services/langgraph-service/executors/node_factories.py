"""
Node Factories for FlowSpec Node Types
Creates executable functions for each node type
"""

import os
import json
import httpx
from typing import Dict, Any, Callable, Awaitable
import logging

logger = logging.getLogger(__name__)


class NodeFactories:
    """Factory class for creating node execution functions"""
    
    def __init__(self):
        self.trustgate_url = os.getenv('TRUSTGATE_URL', 'https://trustgate-api-production.up.railway.app')
        self.trustgate_api_key = os.getenv('TRUSTGATE_API_KEY', '')
        self.lucid_api_url = os.getenv('LUCID_API_URL', 'http://host.docker.internal:3001')
    
    @staticmethod
    def create(node: Dict[str, Any]) -> Callable[[Dict], Awaitable[Dict]]:
        """
        Create an executable function for a node based on its type
        
        Args:
            node: Node definition from FlowSpec
            
        Returns:
            Async function that executes the node
        """
        factories = NodeFactories()
        node_type = node.get('type', '')
        
        # Map node types to factory methods
        type_map = {
            'llm.chat': factories.make_llm_node,
            'tool.http': factories.make_http_node,
            'tool.mcp': factories.make_mcp_node,
            'solana.write': factories.make_solana_write_node,
            'solana.read': factories.make_solana_read_node,
            'data.transform': factories.make_transform_node,
            'control.condition': factories.make_condition_node,
            'control.loop': factories.make_loop_node,
        }
        
        factory_func = type_map.get(node_type, factories.make_passthrough_node)
        return factory_func(node)
    
    def make_llm_node(self, node: Dict[str, Any]) -> Callable:
        """Create LLM chat completion node"""
        async def llm_fn(state: Dict) -> Dict:
            try:
                node_id = node['id']
                node_input = node.get('input', {})
                
                # Get prompt - support template variables
                prompt = node_input.get('prompt', '')
                prompt = self._resolve_template(prompt, state)
                
                model = node_input.get('model', 'gpt-3.5-turbo')
                max_tokens = node_input.get('maxTokens', 150)
                
                logger.info(f"Executing LLM node {node_id} with model {model}")

                # Call TrustGate (OpenAI-compatible)
                headers = {'Content-Type': 'application/json'}
                if self.trustgate_api_key:
                    headers['Authorization'] = f'Bearer {self.trustgate_api_key}'

                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        f"{self.trustgate_url}/v1/chat/completions",
                        headers=headers,
                        json={
                            "model": model,
                            "messages": [{"role": "user", "content": prompt}],
                            "max_tokens": max_tokens
                        }
                    )

                    if response.status_code == 200:
                        data = response.json()
                        state[node_id] = data['choices'][0]['message']['content']
                    else:
                        logger.error(f"TrustGate API error: {response.status_code}")
                        state[node_id] = f"Error: {response.status_code}"
                
                return state
            except Exception as e:
                logger.error(f"Error in LLM node {node['id']}: {str(e)}")
                state[node['id']] = f"Error: {str(e)}"
                return state
        
        return llm_fn
    
    def make_http_node(self, node: Dict[str, Any]) -> Callable:
        """Create HTTP request node"""
        async def http_fn(state: Dict) -> Dict:
            try:
                node_id = node['id']
                node_input = node.get('input', {})
                
                url = node_input.get('url', '')
                url = self._resolve_template(url, state)
                
                method = node_input.get('method', 'GET').upper()
                headers = node_input.get('headers', {})
                body = node_input.get('body', {})
                
                logger.info(f"Executing HTTP node {node_id}: {method} {url}")
                
                async with httpx.AsyncClient(timeout=30.0) as client:
                    if method == 'POST':
                        response = await client.post(url, json=body, headers=headers)
                    elif method == 'PUT':
                        response = await client.put(url, json=body, headers=headers)
                    elif method == 'DELETE':
                        response = await client.delete(url, headers=headers)
                    else:  # GET
                        response = await client.get(url, headers=headers)
                    
                    state[node_id] = {
                        'status': response.status_code,
                        'data': response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text
                    }
                
                return state
            except Exception as e:
                logger.error(f"Error in HTTP node {node['id']}: {str(e)}")
                state[node['id']] = {'error': str(e)}
                return state
        
        return http_fn
    
    def make_mcp_node(self, node: Dict[str, Any]) -> Callable:
        """Create MCP tool call node"""
        async def mcp_fn(state: Dict) -> Dict:
            try:
                node_id = node['id']
                node_input = node.get('input', {})
                
                tool_name = node_input.get('tool', '')
                operation = node_input.get('operation', '')
                params = node_input.get('params', {})
                
                # Resolve parameter templates
                params = self._resolve_dict_templates(params, state)
                
                logger.info(f"Executing MCP node {node_id}: {tool_name}.{operation}")
                
                # Call Lucid API's MCP tool endpoint
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        f"{self.lucid_api_url}/tools/execute",
                        json={
                            "tool": tool_name,
                            "operation": operation,
                            "params": params
                        }
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        state[node_id] = data.get('result', {})
                    else:
                        state[node_id] = {'error': f"HTTP {response.status_code}"}
                
                return state
            except Exception as e:
                logger.error(f"Error in MCP node {node['id']}: {str(e)}")
                state[node['id']] = {'error': str(e)}
                return state
        
        return mcp_fn
    
    def make_solana_write_node(self, node: Dict[str, Any]) -> Callable:
        """Create Solana write operation node"""
        async def solana_write_fn(state: Dict) -> Dict:
            try:
                node_id = node['id']
                node_input = node.get('input', {})
                
                data = node_input.get('data', '')
                data = self._resolve_template(str(data), state)
                
                logger.info(f"Executing Solana write node {node_id}")
                
                # Call Lucid API for Solana write
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        f"{self.lucid_api_url}/run",
                        json={"text": data}
                    )
                    
                    if response.status_code == 200:
                        state[node_id] = response.json()
                    else:
                        state[node_id] = {'error': f"HTTP {response.status_code}"}
                
                return state
            except Exception as e:
                logger.error(f"Error in Solana write node {node['id']}: {str(e)}")
                state[node['id']] = {'error': str(e)}
                return state
        
        return solana_write_fn
    
    def make_solana_read_node(self, node: Dict[str, Any]) -> Callable:
        """Create Solana read operation node"""
        async def solana_read_fn(state: Dict) -> Dict:
            try:
                node_id = node['id']
                node_input = node.get('input', {})
                
                address = node_input.get('address', '')
                address = self._resolve_template(address, state)
                
                logger.info(f"Executing Solana read node {node_id}")
                
                # This is a placeholder - actual implementation would query Solana
                state[node_id] = {
                    'address': address,
                    'data': 'Solana read operation placeholder'
                }
                
                return state
            except Exception as e:
                logger.error(f"Error in Solana read node {node['id']}: {str(e)}")
                state[node['id']] = {'error': str(e)}
                return state
        
        return solana_read_fn
    
    def make_transform_node(self, node: Dict[str, Any]) -> Callable:
        """Create data transformation node"""
        async def transform_fn(state: Dict) -> Dict:
            try:
                node_id = node['id']
                node_input = node.get('input', {})
                
                # Get transformation type
                transform_type = node_input.get('type', 'json')
                source = node_input.get('source', '')
                
                logger.info(f"Executing transform node {node_id}")
                
                if transform_type == 'json':
                    # Parse JSON from previous node output
                    source_data = self._resolve_reference(source, state)
                    if isinstance(source_data, str):
                        state[node_id] = json.loads(source_data)
                    else:
                        state[node_id] = source_data
                elif transform_type == 'extract':
                    # Extract field from previous output
                    field = node_input.get('field', '')
                    source_data = self._resolve_reference(source, state)
                    state[node_id] = source_data.get(field) if isinstance(source_data, dict) else None
                else:
                    state[node_id] = {'transformed': True}
                
                return state
            except Exception as e:
                logger.error(f"Error in transform node {node['id']}: {str(e)}")
                state[node['id']] = {'error': str(e)}
                return state
        
        return transform_fn
    
    def make_condition_node(self, node: Dict[str, Any]) -> Callable:
        """Create conditional routing node"""
        async def condition_fn(state: Dict) -> Dict:
            try:
                node_id = node['id']
                node_input = node.get('input', {})
                
                condition = node_input.get('condition', 'true')
                
                logger.info(f"Executing condition node {node_id}")
                
                # Evaluate simple conditions
                result = self._evaluate_condition(condition, state)
                state[node_id] = {'condition_met': result}
                
                return state
            except Exception as e:
                logger.error(f"Error in condition node {node['id']}: {str(e)}")
                state[node['id']] = {'error': str(e), 'condition_met': False}
                return state
        
        return condition_fn
    
    def make_loop_node(self, node: Dict[str, Any]) -> Callable:
        """Create loop control node"""
        async def loop_fn(state: Dict) -> Dict:
            try:
                node_id = node['id']
                node_input = node.get('input', {})
                
                max_iterations = node_input.get('maxIterations', 10)
                current_iteration = state.get(f"{node_id}_iteration", 0)
                
                logger.info(f"Executing loop node {node_id}, iteration {current_iteration}")
                
                state[f"{node_id}_iteration"] = current_iteration + 1
                state[node_id] = {
                    'iteration': current_iteration + 1,
                    'continue': current_iteration + 1 < max_iterations
                }
                
                return state
            except Exception as e:
                logger.error(f"Error in loop node {node['id']}: {str(e)}")
                state[node['id']] = {'error': str(e), 'continue': False}
                return state
        
        return loop_fn
    
    def make_passthrough_node(self, node: Dict[str, Any]) -> Callable:
        """Create passthrough node for unsupported types"""
        async def passthrough_fn(state: Dict) -> Dict:
            node_id = node['id']
            logger.warning(f"Passthrough node {node_id}: type '{node.get('type')}' not fully implemented")
            state[node_id] = {'status': 'passthrough', 'type': node.get('type')}
            return state
        
        return passthrough_fn
    
    @staticmethod
    def _resolve_template(template: str, state: Dict) -> str:
        """Resolve template variables like $ref.nodeId"""
        if not template or not isinstance(template, str):
            return template
        
        # Simple $ref.nodeId resolution
        if template.startswith('$ref.'):
            ref_path = template[5:]  # Remove $ref.
            parts = ref_path.split('.')
            
            value = state
            for part in parts:
                if isinstance(value, dict):
                    value = value.get(part)
                else:
                    return template
            
            return str(value) if value is not None else template
        
        return template
    
    @staticmethod
    def _resolve_reference(ref: str, state: Dict) -> Any:
        """Resolve a reference to data in state"""
        if ref.startswith('$ref.'):
            ref_path = ref[5:]
            parts = ref_path.split('.')
            
            value = state
            for part in parts:
                if isinstance(value, dict):
                    value = value.get(part)
                else:
                    return None
            
            return value
        
        return ref
    
    def _resolve_dict_templates(self, data: Dict, state: Dict) -> Dict:
        """Recursively resolve templates in a dictionary"""
        result = {}
        for key, value in data.items():
            if isinstance(value, str):
                result[key] = self._resolve_template(value, state)
            elif isinstance(value, dict):
                result[key] = self._resolve_dict_templates(value, state)
            elif isinstance(value, list):
                result[key] = [
                    self._resolve_template(item, state) if isinstance(item, str) else item
                    for item in value
                ]
            else:
                result[key] = value
        return result
    
    @staticmethod
    def _evaluate_condition(condition: str, state: Dict) -> bool:
        """Evaluate a simple condition"""
        # Very basic condition evaluation
        # In production, use a proper expression evaluator
        
        if condition == 'true':
            return True
        elif condition == 'false':
            return False
        
        # Try to evaluate simple comparisons
        # Example: "price > 50000"
        try:
            # This is unsafe in production - use a proper expression parser
            # For now, just return True for demo purposes
            return True
        except Exception:
            return False
