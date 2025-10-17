"""
LangGraph Executor Service
Executes FlowSpec DSL workflows using LangGraph
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import os
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="LangGraph Executor Service",
    description="Execute FlowSpec DSL workflows using LangGraph",
    version="0.1.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class FlowSpecNode(BaseModel):
    id: str
    type: str
    input: Dict[str, Any] = {}
    output: Optional[str] = None

class FlowSpecEdge(BaseModel):
    from_: Optional[str] = Field(None, alias='from')
    to: str
    when: Optional[str] = None
    
    class Config:
        populate_by_name = True

class FlowSpec(BaseModel):
    name: str
    nodes: List[FlowSpecNode]
    edges: List[FlowSpecEdge]
    metadata: Optional[Dict[str, Any]] = {}

class FlowExecutionContext(BaseModel):
    tenantId: Optional[str] = None
    userId: Optional[str] = None
    variables: Optional[Dict[str, Any]] = {}

class ExecuteRequest(BaseModel):
    flowspec: FlowSpec
    context: FlowExecutionContext

class ExecuteResponse(BaseModel):
    success: bool
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    executor: str = "langgraph"
    executionTime: Optional[float] = None

class HealthResponse(BaseModel):
    status: str
    executor: str
    version: str
    environment: str

class InfoResponse(BaseModel):
    name: str
    version: str
    executor: str
    capabilities: List[str]
    supportedNodeTypes: List[str]

# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "executor": "langgraph",
        "version": "0.1.0",
        "environment": os.getenv("ENVIRONMENT", "development")
    }

# Service info endpoint
@app.get("/info", response_model=InfoResponse)
async def get_info():
    """Get service information and capabilities"""
    return {
        "name": "LangGraph Executor Service",
        "version": "0.1.0",
        "executor": "langgraph",
        "capabilities": [
            "flowspec_execution",
            "state_management",
            "conditional_routing",
            "loop_support",
            "checkpoint_persistence"
        ],
        "supportedNodeTypes": [
            "llm.chat",
            "tool.http",
            "tool.mcp",
            "solana.write",
            "solana.read",
            "data.transform",
            "control.condition",
            "control.loop"
        ]
    }

# Execute FlowSpec workflow
@app.post("/execute", response_model=ExecuteResponse)
async def execute_flowspec(request: ExecuteRequest):
    """
    Execute a FlowSpec workflow using LangGraph
    
    This endpoint compiles FlowSpec DSL to a LangGraph state machine
    and executes it with the provided context.
    """
    try:
        import time
        from executors import FlowSpecCompiler
        
        start_time = time.time()
        
        logger.info(f"Executing FlowSpec workflow: {request.flowspec.name}")
        logger.info(f"Nodes: {len(request.flowspec.nodes)}, Edges: {len(request.flowspec.edges)}")
        
        # Convert Pydantic models to dicts for compiler
        flowspec_dict = {
            "name": request.flowspec.name,
            "nodes": [node.dict() for node in request.flowspec.nodes],
            "edges": [{
                "from": edge.from_,
                "to": edge.to,
                "when": edge.when
            } for edge in request.flowspec.edges],
            "metadata": request.flowspec.metadata or {}
        }
        
        context_dict = {
            "tenantId": request.context.tenantId,
            "userId": request.context.userId,
            "variables": request.context.variables or {}
        }
        
        # Compile and execute
        compiler = FlowSpecCompiler()
        final_state = await compiler.compile_and_execute(flowspec_dict, context_dict)
        
        execution_time = time.time() - start_time
        
        # Extract results (exclude internal state keys)
        result = {k: v for k, v in final_state.items() if not k.startswith('_')}
        
        return {
            "success": True,
            "result": result,
            "executor": "langgraph",
            "executionTime": execution_time
        }
        
    except Exception as e:
        logger.error(f"Error executing FlowSpec: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Validate FlowSpec structure
@app.post("/validate")
async def validate_flowspec(flowspec: FlowSpec):
    """
    Validate FlowSpec structure without executing
    """
    try:
        # Basic validation
        if not flowspec.nodes:
            return {
                "valid": False,
                "error": "FlowSpec must have at least one node"
            }
        
        # Check for valid node IDs
        node_ids = {node.id for node in flowspec.nodes}
        
        # Validate edges reference existing nodes
        for edge in flowspec.edges:
            if edge.from_ and edge.from_ not in node_ids:
                return {
                    "valid": False,
                    "error": f"Edge references non-existent node: {edge.from_}"
                }
            if edge.to not in node_ids:
                return {
                    "valid": False,
                    "error": f"Edge references non-existent node: {edge.to}"
                }
        
        return {
            "valid": True,
            "nodes": len(flowspec.nodes),
            "edges": len(flowspec.edges),
            "message": "FlowSpec structure is valid"
        }
        
    except Exception as e:
        return {
            "valid": False,
            "error": str(e)
        }

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": "LangGraph Executor",
        "version": "0.1.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "info": "/info",
            "execute": "/execute",
            "validate": "/validate"
        }
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8083))
    uvicorn.run(app, host="0.0.0.0", port=port)
