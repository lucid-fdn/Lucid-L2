# Lucid Console Implementation Plan

> **Status:** Plan needs regeneration. The original 15-task plan was lost due to filesystem sync. The design spec at `docs/specs/2026-03-18-lucid-console-design.md` is the source of truth.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bundled Next.js operator dashboard to the L2 Docker deployment with 8 pages: Dashboard, Passports, Models, Deployments, Memory, Receipts, Anchoring, Config.

**Architecture:** Standalone Next.js app in `console/` directory. Browser → Next.js proxy route → L2 API (`LUCID_API_URL`). No auth. Dark mode operator aesthetic with shadcn/ui.

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS 4, shadcn/ui, Geist font, Turbopack (dev), standalone output (Docker)

**Spec:** `docs/specs/2026-03-18-lucid-console-design.md`

---

## Task Overview (15 tasks)

1. **Scaffold Next.js project** — create-next-app + Geist font + standalone output config
2. **Initialize shadcn/ui** — init + install Card, Table, Badge, Button, Input, Select, Dialog, Tabs, Separator, Tooltip, Label, Textarea, Skeleton, ScrollArea, DropdownMenu, Sheet
3. **API proxy + client wrapper** — proxy route handler (async params for Next.js 15) + client-side fetch wrapper (handles both success-envelope and raw health responses) + vitest tests
4. **Root layout + sidebar navigation** — Geist font, dark mode, desktop sidebar + mobile Sheet drawer, root loading.tsx + error.tsx
5. **Shared components** — StatusDot, StatCard, EmptyState, ErrorBanner, TimeAgo, CopyButton, JsonViewer, DataTable, RefreshButton + useAutoRefresh hook
6. **Dashboard page** — health status, dependency health, passport stats, auto-refresh 10s
7. **Passports page** — list with type + status filters, detail view with JSON metadata, create passport dialog
8. **Models page** — listing with tri-state availability filter
9. **Deployments page** — agent list with status dots, event timeline per agent
10. **Memory explorer page** — store health diagnostics, semantic recall form, hash chain verification, memory type tabs
11. **Receipts & Epochs page** — epoch list with pagination, receipt ID lookup, receipt detail
12. **Anchoring page** — agent dropdown selector (fetched from passports API), anchor table, lineage flat list, verify button
13. **Config page** — system status, structured provider display, payment config, full health JSON
14. **Dockerfile + Docker Compose** — standalone Next.js Docker build, add console service to docker-compose.yml
15. **Final verification** — typecheck, tests, all 8 pages render, sidebar navigation works

## Review Fixes Applied

The following issues from spec review are addressed in this plan:
- Proxy route uses `Promise<{ path: string[] }>` (Next.js 15 async params)
- Health endpoint handled separately (no `{ success }` wrapper)
- Dashboard uses `/v1/passports/stats` (not `/v1/passports`)
- Passport create dialog included (spec requires write operations)
- Status filter added to passports (spec requires type + status filtering)
- Agent dropdown on anchoring page (not text input)
- Root loading.tsx + error.tsx for navigation transitions
- Mobile sidebar via Sheet component
- Epoch pagination with prev/next controls
- `public/` directory verification after scaffold (for Dockerfile COPY)
