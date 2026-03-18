// offchain/packages/engine/src/runtime/DockerAdapter.ts
// Docker adapter — universal fallback, minimal Node.js agent server

import { IRuntimeAdapter, RuntimeArtifact } from './IRuntimeAdapter';

/**
 * Docker Adapter (Universal Fallback)
 *
 * Generates a minimal Node.js agent server that can run in any Docker environment.
 * This is the universal fallback when no specific runtime is needed.
 * Zero framework dependencies — only uses Node.js built-ins + tsx.
 */
export class DockerAdapter implements IRuntimeAdapter {
  readonly name = 'docker';
  readonly version = '1.0.0';
  readonly language = 'typescript' as const;

  canHandle(): boolean {
    return true; // Always available as fallback
  }

  async generate(descriptor: any, passportId: string): Promise<RuntimeArtifact> {
    const config = descriptor.agent_config;
    const files = new Map<string, string>();

    files.set('agent.ts', `/**
 * Lucid Agent: ${passportId}
 * Universal Docker agent (minimal dependencies)
 */
import http from "node:http";


const TRUSTGATE_URL = process.env.TRUSTGATE_URL || "https://trustgate-api-production.up.railway.app";
const TRUSTGATE_API_KEY = process.env.TRUSTGATE_API_KEY || "";
const MCPGATE_URL = process.env.MCPGATE_URL || "https://mcpgate-api-production.up.railway.app";
const MCPGATE_API_KEY = process.env.MCPGATE_API_KEY || "";
const PORT = parseInt(process.env.PORT || "3100");

const SYSTEM_PROMPT = ${JSON.stringify(config.system_prompt)};
const MODEL = "${config.model_passport_id}";

async function chatCompletion(messages: any[]): Promise<string> {
  const res = await fetch(\`\${TRUSTGATE_URL}/v1/chat/completions\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \`Bearer \${TRUSTGATE_API_KEY}\`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      temperature: ${config.temperature || 0.7},
      max_tokens: ${config.max_tokens || 4096},
    }),
  });
  if (!res.ok) throw new Error(\`Chat failed: \${res.status}\`);
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content || "";
}

async function callMCPTool(server: string, toolName: string, args: Record<string, unknown>) {
  const res = await fetch(\`\${MCPGATE_URL}/v1/tools/call\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \`Bearer \${MCPGATE_API_KEY}\`,
    },
    body: JSON.stringify({ server, tool: toolName, arguments: args }),
  });
  if (!res.ok) throw new Error(\`MCP tool failed: \${res.status}\`);
  return res.json();
}

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.url === "/health" && req.method === "GET") {
    res.end(JSON.stringify({ status: "healthy", agent: "${passportId}", adapter: "docker" }));
    return;
  }

  if (req.url === "/run" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      if (!body.prompt) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "prompt required" }));
        return;
      }
      const text = await chatCompletion([{ role: "user", content: body.prompt }]);
      res.end(JSON.stringify({ ok: true, text }));
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Unknown" }));
    }
    return;
  }

  if (req.url === "/tools/call" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const result = await callMCPTool(body.server, body.tool_name, body.arguments || {});
      res.end(JSON.stringify({ ok: true, data: result }));
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Unknown" }));
    }
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(\`Agent ${passportId} running on port \${PORT} (docker adapter)\`);
});
`);

    files.set('package.json', JSON.stringify({
      name: `lucid-agent-${passportId}`,
      version: '1.0.0',
      private: true,
      scripts: { start: 'tsx agent.ts' },
      dependencies: { 'tsx': '^4.0.0' },
    }, null, 2));

    const dockerfile = `FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3100/health').then(r=>process.exit(r.ok?0:1))"
CMD ["npx", "tsx", "agent.ts"]
`;
    files.set('Dockerfile', dockerfile);

    return {
      adapter: this.name,
      files,
      entrypoint: 'agent.ts',
      dependencies: { 'tsx': '^4.0.0' },
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
}
