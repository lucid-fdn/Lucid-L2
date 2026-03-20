# Public Docs Phase 1: Restructure + P0 Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the existing `lucid-fdn/lucid-docs` Mintlify site with new nav, new positioning, and 4 critical pages so the site is live with the correct structure.

**Architecture:** Rewrite `docs.json` nav to match the approved structure (Get Started → Build & Deploy → How Lucid Works → Core Concepts → Gateway → API & SDK → On-Chain → Self-Hosting → Advanced). Write 4 P0 pages. Keep existing pages that still work. Placeholder stubs for sections filled in Phase 2.

**Tech Stack:** Mintlify v2 (Aspen theme), MDX, GitHub (auto-deploy on push to main)

**Spec:** `docs/superpowers/specs/2026-03-20-public-docs-design.md`

---

### Task 1: Clone repo and set up local preview

**Files:**
- Clone: `lucid-fdn/lucid-docs` to `/home/debian/Lucid/lucid-docs`

- [ ] **Step 1: Clone the docs repo**

```bash
cd /home/debian/Lucid
git clone git@github.com:lucid-fdn/lucid-docs.git
cd lucid-docs
```

- [ ] **Step 2: Install Mintlify CLI and test locally**

```bash
npm i -g mintlify
mintlify dev
```

Expected: Opens at localhost:3000 with the current (old) site.

- [ ] **Step 3: Verify current structure loads**

Confirm the existing site renders. Note any broken pages. Close the dev server.

---

### Task 2: Rewrite docs.json with new navigation

**Files:**
- Modify: `docs.json`

- [ ] **Step 1: Replace docs.json with new structure**

```json
{
  "$schema": "https://mintlify.com/docs.json",
  "theme": "aspen",
  "name": "Lucid",
  "colors": {
    "primary": "#6366F1",
    "light": "#818CF8",
    "dark": "#4F46E5"
  },
  "favicon": "/logo/lucid_w.png",
  "logo": {
    "light": "/images/CopyofCopyofCopyofCopyofCopyofCopyofCopyofMiyokaDeckv1(3).png",
    "dark": "/images/CopyofCopyofCopyofCopyofCopyofCopyofCopyofMiyokaDeckv1(2).png"
  },
  "navigation": {
    "tabs": [
      {
        "tab": "Get Started",
        "groups": [
          {
            "group": "Get Started",
            "pages": [
              "index",
              "quickstart",
              "install-agent",
              "architecture"
            ]
          }
        ]
      },
      {
        "tab": "Build & Deploy",
        "groups": [
          {
            "group": "Launch an Agent",
            "pages": [
              "deploy/from-telegram",
              "deploy/from-cli",
              "deploy/from-source",
              "deploy/from-image",
              "deploy/from-catalog"
            ]
          },
          {
            "group": "Configure an Agent",
            "pages": [
              "deploy/setup-wizard",
              "deploy/secrets",
              "deploy/channels",
              "deploy/runtime-config"
            ]
          },
          {
            "group": "Deploy a Model",
            "pages": [
              "deploy/hosted-models",
              "deploy/bring-your-model",
              "deploy/model-routing"
            ]
          },
          {
            "group": "Compute Providers",
            "pages": [
              "deploy/compute-selection",
              "deploy/depin",
              "deploy/gpu-routing"
            ]
          }
        ]
      },
      {
        "tab": "How Lucid Works",
        "groups": [
          {
            "group": "Execution Layer",
            "pages": [
              "how/execution-compute",
              "how/execution-models",
              "how/execution-runtime"
            ]
          },
          {
            "group": "Coordination Layer",
            "pages": [
              "how/coordination-a2a",
              "how/coordination-mcp",
              "how/coordination-gateway",
              "how/coordination-channels"
            ]
          },
          {
            "group": "Settlement Layer",
            "pages": [
              "how/settlement-identity",
              "how/settlement-payments",
              "how/settlement-receipts",
              "how/settlement-anchoring",
              "how/settlement-reputation"
            ]
          }
        ]
      },
      {
        "tab": "Core Concepts",
        "groups": [
          {
            "group": "Core Concepts",
            "pages": [
              "concepts/passports",
              "concepts/memory",
              "concepts/compute-models",
              "concepts/agent-deployment",
              "concepts/agent-orchestration",
              "concepts/payments",
              "concepts/receipts",
              "concepts/anchoring",
              "concepts/reputation"
            ]
          }
        ]
      },
      {
        "tab": "Gateway",
        "groups": [
          {
            "group": "Lucid Cloud",
            "pages": [
              "gateway/trustgate",
              "gateway/mcpgate",
              "gateway/control-plane",
              "gateway/channels"
            ]
          }
        ]
      },
      {
        "tab": "API & SDK",
        "groups": [
          {
            "group": "API Reference",
            "pages": [
              "api-reference/introduction",
              "api-reference/errors",
              "api-reference/rate-limits"
            ]
          },
          {
            "group": "API Endpoints",
            "openapi": "https://raw.githubusercontent.com/lucid-fdn/Lucid-L2/master/openapi.yaml"
          },
          {
            "group": "SDKs",
            "pages": [
              "sdks/typescript",
              "sdks/examples"
            ]
          }
        ]
      },
      {
        "tab": "On-Chain",
        "groups": [
          {
            "group": "Solana Programs",
            "pages": [
              "on-chain/solana-overview",
              "on-chain/thought-epoch",
              "on-chain/lucid-passports",
              "on-chain/lucid-agent-wallet",
              "on-chain/lucid-reputation",
              "on-chain/gas-utils",
              "on-chain/zkml-verifier"
            ]
          },
          {
            "group": "EVM Contracts",
            "pages": [
              "on-chain/evm-overview"
            ]
          }
        ]
      },
      {
        "tab": "More",
        "groups": [
          {
            "group": "Self-Hosting",
            "pages": [
              "advanced/self-hosting",
              "advanced/configuration"
            ]
          },
          {
            "group": "Advanced",
            "pages": [
              "advanced/custom-agents",
              "advanced/extending-runtime",
              "advanced/contributing"
            ]
          }
        ]
      }
    ],
    "global": {
      "anchors": [
        {
          "anchor": "API Status",
          "href": "https://api.lucid.foundation/health",
          "icon": "signal"
        },
        {
          "anchor": "GitHub",
          "href": "https://github.com/lucid-fdn/Lucid-L2",
          "icon": "github"
        },
        {
          "anchor": "Telegram Bot",
          "href": "https://t.me/mylclaw_bot",
          "icon": "paper-plane"
        }
      ]
    }
  },
  "navbar": {
    "links": [
      {
        "label": "Support",
        "href": "mailto:kevin.wayne@raijinlabs.io"
      }
    ],
    "primary": {
      "type": "button",
      "label": "Launch Agent",
      "href": "https://t.me/mylclaw_bot"
    }
  },
  "contextual": {
    "options": ["copy", "view", "chatgpt", "claude", "cursor", "vscode"]
  },
  "feedback": {
    "thumbsRating": true,
    "suggestEdit": true
  },
  "footer": {
    "socials": {
      "x": "https://x.com/LucidChain",
      "github": "https://github.com/lucid-fdn"
    }
  },
  "fonts": {
    "family": "Montserrat"
  },
  "api": {
    "baseUrl": "https://api.lucid.foundation"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add docs.json
git commit -m "docs: restructure nav — user-journey flow with 3-layer model"
```

---

### Task 3: Write index.mdx (What is Lucid)

**Files:**
- Modify: `index.mdx`

- [ ] **Step 1: Replace index.mdx with new positioning**

Write the "What is Lucid" page using the narrative from the spec:
- Coordination & settlement layer positioning
- The problem (isolated, non-verifiable, can't transact)
- The 3 layers (execution, coordination, settlement)
- What you can build
- CardGroup with 6 entry points

Key line: "Lucid is to AI agents what Ethereum is to smart contracts — the infrastructure for an economy of agents."

- [ ] **Step 2: Commit**

```bash
git add index.mdx
git commit -m "docs: rewrite index — coordination & settlement layer positioning"
```

---

### Task 4: Write quickstart.mdx

**Files:**
- Modify: `quickstart.mdx`

- [ ] **Step 1: Replace quickstart.mdx with Telegram-first flow**

Two paths:
1. **Fastest (Telegram):** Open t.me/mylclaw_bot → /launch → tap OpenClaw → Lucid Cloud → Launch → done
2. **CLI:** `npm i -g @lucid/cli` → `lucid login` → `lucid launch --agent openclaw --target railway`

Show the agent responding to a message after launch.

- [ ] **Step 2: Commit**

```bash
git add quickstart.mdx
git commit -m "docs: rewrite quickstart — 2-min Telegram-first agent launch"
```

---

### Task 5: Write install-agent.mdx

**Files:**
- Create: `install-agent.mdx`

- [ ] **Step 1: Write the Telegram install walkthrough**

Step-by-step with screenshots/descriptions:
1. Open Telegram, search @mylclaw_bot
2. Send /launch
3. Pick an agent (OpenClaw)
4. Choose Lucid Gateway (no key needed)
5. Choose Lucid Cloud (one-click)
6. Select skills
7. Confirm → agent is alive
8. Send a message → agent responds

- [ ] **Step 2: Commit**

```bash
git add install-agent.mdx
git commit -m "docs: add install-agent — Telegram walkthrough"
```

---

### Task 6: Write architecture.mdx

**Files:**
- Modify: `architecture.mdx`

- [ ] **Step 1: Rewrite architecture with 3-layer model**

Three sections:
1. **Execution Layer** — compute providers (Railway, Akash, Phala, io.net, Nosana), model flexibility, agent runtime
2. **Coordination Layer** — A2A, MCP tools, TrustGate routing, channel routing
3. **Settlement Layer** — passports (identity), x402 payments, receipts (proofs), Solana/EVM anchoring, reputation

Include the 4-layer infrastructure diagram:
- L1: Solana/EVM (commitment)
- L2: Arweave/Lighthouse (data availability)
- L3: Supabase (operational)
- L4: Lucid Cloud (product)

- [ ] **Step 2: Commit**

```bash
git add architecture.mdx
git commit -m "docs: rewrite architecture — 3-layer model + 4-layer infra"
```

---

### Task 7: Create stub pages for all nav entries

**Files:**
- Create: All `.mdx` files referenced in docs.json that don't exist yet

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p deploy how concepts gateway on-chain advanced sdks
```

- [ ] **Step 2: Generate stub .mdx files for every nav entry**

For each page in docs.json that doesn't exist, create a stub:
```mdx
---
title: "[Page Title]"
description: "[One-line description]"
---

Coming soon.
```

Pages to stub (~35 files):
- `deploy/from-telegram.mdx`, `deploy/from-cli.mdx`, `deploy/from-source.mdx`, `deploy/from-image.mdx`, `deploy/from-catalog.mdx`
- `deploy/setup-wizard.mdx`, `deploy/secrets.mdx`, `deploy/channels.mdx`, `deploy/runtime-config.mdx`
- `deploy/hosted-models.mdx`, `deploy/bring-your-model.mdx`, `deploy/model-routing.mdx`
- `deploy/compute-selection.mdx`, `deploy/depin.mdx`, `deploy/gpu-routing.mdx`
- `how/execution-compute.mdx`, `how/execution-models.mdx`, `how/execution-runtime.mdx`
- `how/coordination-a2a.mdx`, `how/coordination-mcp.mdx`, `how/coordination-gateway.mdx`, `how/coordination-channels.mdx`
- `how/settlement-identity.mdx`, `how/settlement-payments.mdx`, `how/settlement-receipts.mdx`, `how/settlement-anchoring.mdx`, `how/settlement-reputation.mdx`
- `concepts/memory.mdx`, `concepts/compute-models.mdx`, `concepts/agent-deployment.mdx`, `concepts/agent-orchestration.mdx`, `concepts/payments.mdx`, `concepts/anchoring.mdx`, `concepts/reputation.mdx`
- `gateway/trustgate.mdx`, `gateway/mcpgate.mdx`, `gateway/control-plane.mdx`, `gateway/channels.mdx`
- `on-chain/solana-overview.mdx`, `on-chain/thought-epoch.mdx`, `on-chain/lucid-passports.mdx`, `on-chain/lucid-agent-wallet.mdx`, `on-chain/lucid-reputation.mdx`, `on-chain/gas-utils.mdx`, `on-chain/zkml-verifier.mdx`, `on-chain/evm-overview.mdx`
- `advanced/self-hosting.mdx`, `advanced/configuration.mdx`, `advanced/custom-agents.mdx`, `advanced/extending-runtime.mdx`, `advanced/contributing.mdx`
- `sdks/examples.mdx`

Reuse existing pages where the file already exists (e.g., `concepts/passports.mdx`, `concepts/receipts.mdx`, `gateway/trustgate.mdx`, `gateway/mcpgate.mdx`). Move them to the new paths if needed.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: create stub pages for all nav entries"
```

---

### Task 8: Clean up stale pages

**Files:**
- Delete: Old pages that no longer fit the structure

- [ ] **Step 1: Remove pages not in new nav**

Delete files that are replaced or merged:
- `sdk-installation.mdx` (replaced by sdks/typescript)
- `authentication.mdx` (merged into api-reference/introduction)
- `glossary.mdx` (low value, remove)
- `concepts/inference.mdx` (merged into how/execution-models)
- `concepts/epochs.mdx` (merged into concepts/anchoring)
- `concepts/mmr.mdx` (merged into concepts/receipts)
- `concepts/session-signer.mdx` (move to advanced)
- `concepts/depin-storage.mdx` (merged into how/settlement-anchoring)
- `concepts/nft-passports.mdx` (merged into concepts/passports)
- `concepts/fractional-ownership.mdx` (merged into concepts/passports)
- `concepts/solana-programs.mdx` (moved to on-chain/)
- `guides/` directory (content redistributed to deploy/ and advanced/)
- `platform/` directory (merged into gateway/)
- Old sdks/ pages (replaced by Speakeasy output)

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: remove stale pages from old structure"
```

---

### Task 9: Push and verify deploy

**Files:**
- None (push only)

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

- [ ] **Step 2: Verify Mintlify deploys**

Check docs.lucid.foundation — should show new nav structure with:
- 4 real pages (index, quickstart, install-agent, architecture)
- Stub "Coming soon" for everything else
- API Reference tab auto-rendering from openapi.yaml

- [ ] **Step 3: Verify OpenAPI auto-render**

Check the API & SDK tab — Mintlify should render interactive API docs from the new openapi.yaml URL.

---

## Phase 1 Outcome

After this phase:
- Site is live at docs.lucid.foundation with new structure
- Positioning is correct ("coordination & settlement layer")
- Quick Start works (Telegram-first)
- Architecture page shows 3-layer model
- All other pages are stubbed (filled in Phase 2)
- OpenAPI reference auto-renders from current spec
