"""
CrewAI Workflow Planner Service
Generates FlowSpec DSL from natural language goals
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from dotenv import load_dotenv
from crewai import Agent, Task, Crew
from langchain_openai import ChatOpenAI

load_dotenv()

app = FastAPI(title="CrewAI Planner Service", version="1.0.0")

# Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4")

# Request/Response Models
class PlanRequest(BaseModel):
    goal: str
    context: Optional[Dict[str, Any]] = None
    constraints: Optional[List[str]] = None

class PlanResponse(BaseModel):
    flowspec: Dict[str, Any]
    reasoning: str
    estimated_complexity: str

class WorkflowPlanner:
    """Main workflow planning service using CrewAI"""
    
    def __init__(self):
        self.llm = ChatOpenAI(
            model=LLM_MODEL,
            api_key=OPENAI_API_KEY,
            temperature=0.7
        )
        
        self.planner_agent = Agent(
            role='Workflow Architect',
            goal='Design efficient and practical workflows for AI automation tasks',
            backstory="""You are an expert in designing workflow automation systems.
            You understand FlowSpec DSL and can translate natural language goals into
            structured workflows. You consider API integrations, data flow, error handling,
            and best practices in automation.""",
            llm=self.llm,
            verbose=True
        )
    
    def plan_workflow(self, goal: str, context: Optional[Dict] = None, 
                     constraints: Optional[List[str]] = None) -> Dict[str, Any]:
        """Generate FlowSpec workflow from natural language goal"""
        
        # Build task description with context
        task_desc = f"""
        Create a FlowSpec workflow for the following goal:
        
        Goal: {goal}
        
        Context: {context or 'No additional context provided'}
        Constraints: {', '.join(constraints) if constraints else 'None'}
        
        Generate a valid FlowSpec JSON structure with:
        1. Clear node definitions (id, type, config)
        2. Proper edge connections
        3. Input/output mappings
        4. Error handling where appropriate
        
        Available node types:
        - llm.chat: LLM interactions
        - tool.http: HTTP API calls
        - tool.mcp: MCP tool invocations (Twitter, IPFS, Solana, etc.)
        - solana.read: Read Solana blockchain data
        - solana.write: Write Solana transactions
        - data.transform: Data transformations
        - control.condition: Conditional branching
        - control.loop: Iterative processing
        
        Return ONLY valid JSON in FlowSpec format.
        """
        
        task = Task(
            description=task_desc,
            agent=self.planner_agent,
            expected_output="Valid FlowSpec JSON workflow"
        )
        
        crew = Crew(
            agents=[self.planner_agent],
            tasks=[task],
            verbose=True
        )
        
        result = crew.kickoff()
        
        # Parse result to FlowSpec
        flowspec = self.parse_to_flowspec(str(result), goal)
        
        return flowspec
    
    def parse_to_flowspec(self, result: str, goal: str) -> Dict[str, Any]:
        """Parse CrewAI result into valid FlowSpec format"""
        
        # Try to extract JSON from the result
        import json
        import re
        
        # Look for JSON block in the result
        json_match = re.search(r'\{[\s\S]*\}', result)
        if json_match:
            try:
                flowspec = json.loads(json_match.group())
                # Validate basic structure
                if 'nodes' in flowspec and 'edges' in flowspec:
                    return flowspec
            except json.JSONDecodeError:
                pass
        
        # Fallback: Create a simple FlowSpec template
        return self.create_fallback_flowspec(goal)
    
    def create_fallback_flowspec(self, goal: str) -> Dict[str, Any]:
        """Create a basic FlowSpec template when parsing fails"""
        return {
            "version": "1.0",
            "name": f"Workflow for: {goal}",
            "description": f"Auto-generated workflow to accomplish: {goal}",
            "nodes": [
                {
                    "id": "start",
                    "type": "llm.chat",
                    "config": {
                        "model": "gpt-4",
                        "prompt": f"Help me accomplish this goal: {goal}",
                        "temperature": 0.7
                    }
                },
                {
                    "id": "output",
                    "type": "data.transform",
                    "config": {
                        "operation": "format",
                        "template": "Result: {{input}}"
                    }
                }
            ],
            "edges": [
                {
                    "from": "start",
                    "to": "output",
                    "data": "response"
                }
            ],
            "metadata": {
                "created_by": "crewai-planner",
                "goal": goal,
                "auto_generated": True
            }
        }
    
    def estimate_complexity(self, flowspec: Dict[str, Any]) -> str:
        """Estimate workflow complexity"""
        node_count = len(flowspec.get('nodes', []))
        edge_count = len(flowspec.get('edges', []))
        
        if node_count <= 3:
            return "simple"
        elif node_count <= 7:
            return "moderate"
        else:
            return "complex"


# Initialize planner
planner = WorkflowPlanner()

# API Endpoints
@app.get("/")
async def root():
    return {
        "service": "CrewAI Workflow Planner",
        "version": "1.0.0",
        "status": "operational"
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/plan", response_model=PlanResponse)
async def plan_workflow(request: PlanRequest):
    """
    Generate a FlowSpec workflow from a natural language goal
    
    Example:
    ```json
    {
        "goal": "Fetch BTC price and post to Twitter if > $50k",
        "context": {"twitter_handle": "@mybot"},
        "constraints": ["must complete in < 30 seconds"]
    }
    ```
    """
    try:
        flowspec = planner.plan_workflow(
            goal=request.goal,
            context=request.context,
            constraints=request.constraints
        )
        
        complexity = planner.estimate_complexity(flowspec)
        
        return PlanResponse(
            flowspec=flowspec,
            reasoning=f"Generated workflow with {len(flowspec['nodes'])} nodes to accomplish: {request.goal}",
            estimated_complexity=complexity
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Planning failed: {str(e)}")

@app.post("/validate")
async def validate_flowspec(flowspec: Dict[str, Any]):
    """Validate a FlowSpec structure"""
    required_fields = ["nodes", "edges"]
    
    for field in required_fields:
        if field not in flowspec:
            return {"valid": False, "error": f"Missing required field: {field}"}
    
    if not isinstance(flowspec["nodes"], list):
        return {"valid": False, "error": "nodes must be an array"}
    
    if not isinstance(flowspec["edges"], list):
        return {"valid": False, "error": "edges must be an array"}
    
    # Validate each node has id and type
    for i, node in enumerate(flowspec["nodes"]):
        if "id" not in node:
            return {"valid": False, "error": f"Node {i} missing 'id' field"}
        if "type" not in node:
            return {"valid": False, "error": f"Node {i} missing 'type' field"}
    
    return {"valid": True, "message": "FlowSpec structure is valid"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8082)
