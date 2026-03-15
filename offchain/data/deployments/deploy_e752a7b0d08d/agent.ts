import { generateText, streamText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import express from "express";
import { logger } from '../lib/logger';

// --- LLM Provider (routes through TrustGate) ---
const provider = createOpenAI({
  baseURL: process.env.TRUSTGATE_URL || "https://trustgate-api-production.up.railway.app",
  apiKey: process.env.TRUSTGATE_API_KEY || "",
});

// --- MCP Tool Bridge ---
async function callMCPTool(server: string, toolName: string, args: Record<string, unknown>) {
  const mcpGateUrl = process.env.MCPGATE_URL || "https://mcpgate-api-production.up.railway.app";
  const res = await fetch(`${mcpGateUrl}/v1/tools/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.MCPGATE_API_KEY || ""}`,
    },
    body: JSON.stringify({ server, tool: toolName, arguments: args }),
  });
  if (!res.ok) throw new Error(`MCP tool call failed: ${res.status}`);
  return res.json();
}

const agentTools = {

};



// --- HTTP Server ---
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "healthy", agent: "passport_new_agent_123", adapter: "vercel-ai" });
});

app.post("/run", async (req, res) => {
  try {
    const { prompt, stream } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt required" });

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      const result = await streamText({
        model: provider("passport_model_abc"),
        system: "You are a helpful agent.",
        prompt,
        tools: agentTools,
        maxSteps: 50,
      });
      for await (const chunk of result.textStream) {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      const result = await generateText({
        model: provider("passport_model_abc"),
        system: "You are a helpful agent.",
        prompt,
        tools: agentTools,
        maxSteps: 50,
      });
      res.json({
        ok: true,
        text: result.text,
        usage: result.usage,
        steps: result.steps?.length || 0,
      });
    }
  } catch (error) {
    logger.error("Agent error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});


// --- A2A Protocol Endpoints ---
app.get("/.well-known/agent.json", (_req, res) => {
  res.json({
    name: "passport_new_agent_123",
    description: "You are a helpful agent.",
    url: process.env.AGENT_URL || "http://localhost:3100",
    version: "1.0.0",
    capabilities: ["research"],
    authentication: { type: "bearer" },
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
  });
});

app.post("/tasks/send", async (req, res) => {
  try {
    const { message } = req.body;
    const result = await generateText({
      model: provider("passport_model_abc"),
      system: "You are a helpful agent.",
      prompt: message?.parts?.[0]?.text || "",
      tools: agentTools,
      maxSteps: 50,
    });
    res.json({
      id: `task_${Date.now()}`,
      status: { state: "completed" },
      artifacts: [{ parts: [{ type: "text", text: result.text }] }],
    });
  } catch (error) {
    res.status(500).json({
      id: `task_${Date.now()}`,
      status: { state: "failed", message: error instanceof Error ? error.message : "Unknown" },
    });
  }
});


const PORT = parseInt(process.env.PORT || "3100");
app.listen(PORT, () => {
  logger.info(`Agent passport_new_agent_123 running on port ${PORT} (vercel-ai adapter)`);
});
