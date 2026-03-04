// offchain/packages/engine/src/runtime/VercelAIAdapter.ts
// Vercel AI SDK adapter — generates standalone Node.js agent server

import { IRuntimeAdapter, RuntimeArtifact } from './IRuntimeAdapter';

/**
 * Vercel AI SDK Adapter
 *
 * Generates a standalone Node.js server using Vercel AI SDK's ToolLoopAgent.
 * This is the primary adapter since LucidMerged already uses @ai-sdk/openai.
 */
export class VercelAIAdapter implements IRuntimeAdapter {
  readonly name = 'vercel-ai';
  readonly version = '1.0.0';
  readonly language = 'typescript' as const;

  canHandle(descriptor: any): boolean {
    // Vercel AI SDK supports all workflow types except complex DAGs
    const workflow = descriptor?.agent_config?.workflow_type;
    return !workflow || workflow !== 'dag';
  }

  async generate(descriptor: any, passportId: string): Promise<RuntimeArtifact> {
    const config = descriptor.agent_config;
    const files = new Map<string, string>();

    // Generate main agent file
    const tools = this.generateToolImports(config);
    const stopConditions = this.generateStopConditions(config.stop_conditions || []);
    const maxSteps = config.stop_conditions?.find((s: any) => s.type === 'max_steps')?.value || 50;

    files.set('agent.ts', `import { generateText, streamText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import express from "express";

// --- LLM Provider (routes through TrustGate) ---
const provider = createOpenAI({
  baseURL: process.env.TRUSTGATE_URL || "https://trustgate-api-production.up.railway.app",
  apiKey: process.env.TRUSTGATE_API_KEY || "",
});

// --- MCP Tool Bridge ---
async function callMCPTool(server: string, toolName: string, args: Record<string, unknown>) {
  const mcpGateUrl = process.env.MCPGATE_URL || "https://mcpgate-api-production.up.railway.app";
  const res = await fetch(\`\${mcpGateUrl}/v1/tools/call\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \`Bearer \${process.env.MCPGATE_API_KEY || ""}\`,
    },
    body: JSON.stringify({ server, tool: toolName, arguments: args }),
  });
  if (!res.ok) throw new Error(\`MCP tool call failed: \${res.status}\`);
  return res.json();
}

${tools}

${stopConditions}

// --- HTTP Server ---
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "healthy", agent: "${passportId}", adapter: "vercel-ai" });
});

app.post("/run", async (req, res) => {
  try {
    const { prompt, stream } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt required" });

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      const result = await streamText({
        model: provider("${config.model_passport_id}"),
        system: ${JSON.stringify(config.system_prompt)},
        prompt,
        tools: agentTools,
        maxSteps: ${maxSteps},
      });
      for await (const chunk of result.textStream) {
        res.write(\`data: \${JSON.stringify({ text: chunk })}\\n\\n\`);
      }
      res.write("data: [DONE]\\n\\n");
      res.end();
    } else {
      const result = await generateText({
        model: provider("${config.model_passport_id}"),
        system: ${JSON.stringify(config.system_prompt)},
        prompt,
        tools: agentTools,
        maxSteps: ${maxSteps},
      });
      res.json({
        ok: true,
        text: result.text,
        usage: result.usage,
        steps: result.steps?.length || 0,
      });
    }
  } catch (error) {
    console.error("Agent error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

${descriptor.agent_config.a2a_enabled ? `
// --- A2A Protocol Endpoints ---
app.get("/.well-known/agent.json", (_req, res) => {
  res.json({
    name: "${passportId}",
    description: ${JSON.stringify(config.system_prompt.substring(0, 200))},
    url: process.env.AGENT_URL || "http://localhost:3100",
    version: "1.0.0",
    capabilities: ${JSON.stringify(config.a2a_capabilities || [])},
    authentication: { type: "bearer" },
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
  });
});

app.post("/tasks/send", async (req, res) => {
  try {
    const { message } = req.body;
    const result = await generateText({
      model: provider("${config.model_passport_id}"),
      system: ${JSON.stringify(config.system_prompt)},
      prompt: message?.parts?.[0]?.text || "",
      tools: agentTools,
      maxSteps: ${maxSteps},
    });
    res.json({
      id: \`task_\${Date.now()}\`,
      status: { state: "completed" },
      artifacts: [{ parts: [{ type: "text", text: result.text }] }],
    });
  } catch (error) {
    res.status(500).json({
      id: \`task_\${Date.now()}\`,
      status: { state: "failed", message: error instanceof Error ? error.message : "Unknown" },
    });
  }
});
` : ''}

const PORT = parseInt(process.env.PORT || "3100");
app.listen(PORT, () => {
  console.log(\`Agent ${passportId} running on port \${PORT} (vercel-ai adapter)\`);
});
`);

    // Generate package.json
    files.set('package.json', JSON.stringify({
      name: `lucid-agent-${passportId}`,
      version: '1.0.0',
      private: true,
      scripts: {
        start: 'tsx agent.ts',
        dev: 'tsx watch agent.ts',
      },
      dependencies: {
        'ai': '^4.0.0',
        '@ai-sdk/openai': '^1.0.0',
        'express': '^4.18.2',
        'zod': '^3.22.0',
        'tsx': '^4.0.0',
      },
      devDependencies: {
        '@types/express': '^4.17.21',
        'typescript': '^5.3.0',
      },
    }, null, 2));

    // Generate tsconfig.json
    files.set('tsconfig.json', JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: './dist',
      },
      include: ['*.ts'],
    }, null, 2));

    // Generate Dockerfile
    const dockerfile = `FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:3100/health || exit 1
CMD ["npx", "tsx", "agent.ts"]
`;
    files.set('Dockerfile', dockerfile);

    return {
      adapter: this.name,
      files,
      entrypoint: 'agent.ts',
      dependencies: {
        'ai': '^4.0.0',
        '@ai-sdk/openai': '^1.0.0',
        'express': '^4.18.2',
        'zod': '^3.22.0',
        'tsx': '^4.0.0',
      },
      env_vars: {
        TRUSTGATE_URL: '',
        TRUSTGATE_API_KEY: '',
        MCPGATE_URL: '',
        MCPGATE_API_KEY: '',
        PORT: '3100',
      },
      dockerfile,
    };
  }

  private generateToolImports(config: any): string {
    const mcpServers: string[] = config.mcp_servers || [];
    const toolDefs: string[] = [];

    for (const server of mcpServers) {
      const safeName = server.replace(/[^a-zA-Z0-9]/g, '_');
      toolDefs.push(`  "${safeName}": tool({
    description: "Call ${server} MCP server tools",
    parameters: z.object({
      tool_name: z.string().describe("Name of the tool to call"),
      arguments: z.record(z.unknown()).describe("Tool arguments"),
    }),
    execute: async ({ tool_name, arguments: args }) => {
      return callMCPTool("${server}", tool_name, args);
    },
  })`);
    }

    // Add a generic tool caller if there are tool passport IDs
    if (config.tool_passport_ids?.length > 0) {
      toolDefs.push(`  "mcp_tool": tool({
    description: "Call any registered MCP tool",
    parameters: z.object({
      server: z.string().describe("MCP server name"),
      tool_name: z.string().describe("Tool name"),
      arguments: z.record(z.unknown()).describe("Tool arguments"),
    }),
    execute: async ({ server, tool_name, arguments: args }) => {
      return callMCPTool(server, tool_name, args);
    },
  })`);
    }

    return `const agentTools = {\n${toolDefs.join(',\n')}\n};`;
  }

  private generateStopConditions(conditions: any[]): string {
    const parts: string[] = [];
    for (const c of conditions) {
      if (c.type === 'max_cost_usd') {
        parts.push(`// Budget limit: $${c.value} USD`);
      }
      if (c.type === 'max_duration_ms') {
        parts.push(`// Time limit: ${c.value}ms`);
      }
    }
    return parts.length > 0 ? `// --- Stop Conditions ---\n${parts.join('\n')}` : '';
  }
}
