# Code Generation Adapters (Reference Examples)

These adapters were the original code-generation system for Lucid agent deployment.
They have been replaced by the image-based launch system (`lucid launch`).

These files are kept as reference examples showing how to build a Lucid agent
with each framework.

## Adapters

| Adapter | Framework | Language |
|---------|-----------|----------|
| VercelAIAdapter | Vercel AI SDK | TypeScript |
| OpenClawAdapter | OpenClaw | Markdown |
| OpenAIAgentsAdapter | OpenAI Agents SDK | Python |
| LangGraphAdapter | LangGraph | Python |
| CrewAIAdapter | CrewAI | Python |
| GoogleADKAdapter | Google ADK | Python |
| DockerAdapter | Vanilla Node.js | TypeScript |

## Also Included

- `imageBuilder.ts` — Docker image build pipeline (was used by Akash deployer)
- `descriptorBuilder.ts` — Helper for building AgentDescriptor from CLI args

## Usage

These are NOT used by `lucid launch`. They are reference implementations
for developers who want to see how agent code is structured for each framework.

For actual deployment, use:
- `lucid launch --image <your-image>` (bring your own)
- `lucid launch --runtime base --model <model> --prompt <prompt>` (no-code)
