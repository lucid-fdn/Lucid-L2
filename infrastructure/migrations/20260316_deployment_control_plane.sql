-- Deployment Control Plane — Phase 1
-- Creates the durable deployment records + append-only event stream.
-- Spec: docs/superpowers/specs/2026-03-16-deployment-control-plane-phase1-design.md

-- ============================================================================
-- Table: deployments
-- ============================================================================

CREATE TABLE deployments (
  deployment_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_passport_id     TEXT NOT NULL,
  tenant_id             TEXT,

  -- Versioning (separate concerns)
  version               INTEGER NOT NULL DEFAULT 1,     -- optimistic locking (incremented on any write)
  revision              INTEGER NOT NULL DEFAULT 1,     -- deployment revision (incremented on redeploy/config change)

  -- Provider
  provider              TEXT NOT NULL,                   -- railway, akash, phala, ionet, nosana, docker
  runtime_adapter       TEXT NOT NULL,                   -- vercel-ai, crewai, langgraph, etc.

  -- Platform state (Lucid's view)
  desired_state         TEXT NOT NULL DEFAULT 'running'
    CHECK (desired_state IN ('running', 'stopped', 'terminated')),
  actual_state          TEXT NOT NULL DEFAULT 'pending'
    CHECK (actual_state IN ('pending', 'deploying', 'running', 'stopped', 'failed', 'terminated')),
  health_status         TEXT NOT NULL DEFAULT 'unknown'
    CHECK (health_status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),

  -- Provider state (raw, from provider API)
  provider_status       TEXT,                            -- BUILDING, ACTIVE, RUNNING, etc. (provider-specific)
  provider_status_detail JSONB,                          -- raw provider response for debugging

  -- Provider resources
  provider_deployment_id TEXT,                           -- Railway service ID, Akash deployment ID, etc.
  provider_region       TEXT,                            -- Provider region/location if available
  deployment_url         TEXT,
  a2a_endpoint          TEXT,
  wallet_address        TEXT,

  -- Rollout slot (Phase 3 prep — supports blue/green without schema surgery)
  deployment_slot       TEXT NOT NULL DEFAULT 'primary', -- 'primary', 'blue', 'green', 'canary'

  -- Config (frozen at deploy time)
  descriptor_snapshot   JSONB NOT NULL,                  -- full AgentDescriptor at this revision
  env_vars_hash         TEXT,                            -- SHA-256 of env config (not the values)
  code_bundle_hash      TEXT,                            -- SHA-256 of generated code artifact

  -- Lifecycle timestamps
  lease_expires_at      TIMESTAMPTZ,                     -- for time-limited providers (io.net)
  last_health_at        TIMESTAMPTZ,
  last_transition_at    TIMESTAMPTZ DEFAULT NOW(),
  terminated_at         TIMESTAMPTZ,
  terminated_reason     TEXT,                            -- 'user_request', 'lease_expired', 'deploy_failed', 'policy', 'reconciler'
  error                 TEXT,

  -- Audit
  created_by            TEXT NOT NULL DEFAULT 'system',  -- 'system', 'user:{id}', 'api'
  updated_by            TEXT NOT NULL DEFAULT 'system',
  idempotency_key       TEXT,                            -- prevents duplicate deploys

  -- Standard timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary queries
CREATE INDEX idx_deploy_agent ON deployments(agent_passport_id);
CREATE INDEX idx_deploy_state ON deployments(actual_state, updated_at) WHERE actual_state NOT IN ('terminated');
CREATE INDEX idx_deploy_desired ON deployments(desired_state, actual_state);
CREATE INDEX idx_deploy_health ON deployments(health_status, updated_at);
CREATE INDEX idx_deploy_lease ON deployments(lease_expires_at) WHERE lease_expires_at IS NOT NULL;
CREATE INDEX idx_deploy_provider ON deployments(provider, actual_state);
CREATE INDEX idx_deploy_provider_id ON deployments(provider, provider_deployment_id) WHERE provider_deployment_id IS NOT NULL;
CREATE UNIQUE INDEX idx_deploy_idempotency ON deployments(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Active deployment per agent per slot (supports blue/green in Phase 3)
CREATE UNIQUE INDEX idx_deploy_active_agent_slot ON deployments(agent_passport_id, deployment_slot)
  WHERE actual_state NOT IN ('terminated', 'failed');


-- ============================================================================
-- Table: deployment_events
-- ============================================================================

CREATE TABLE deployment_events (
  event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id   UUID NOT NULL REFERENCES deployments(deployment_id),
  sequence        BIGSERIAL,                            -- monotonic ordering for replay
  event_type      TEXT NOT NULL CHECK (event_type IN (
    -- Lifecycle
    'created', 'started', 'succeeded', 'failed', 'stopped', 'terminated', 'restarted',
    -- Health
    'health_changed',
    -- Lease
    'lease_extended', 'lease_expiring',
    -- Config
    'config_updated', 'scaled',
    -- Rollout (Phase 3 prep)
    'promoted', 'rolled_back'
  )),
  actor           TEXT NOT NULL,                         -- 'system', 'user:{id}', 'reconciler', 'health_monitor', 'lease_manager'
  previous_state  TEXT,
  new_state       TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  idempotency_key TEXT,                                  -- prevents duplicate events
  correlation_id  TEXT,                                  -- links related events across systems
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_deployment ON deployment_events(deployment_id, created_at DESC);
CREATE INDEX idx_event_type ON deployment_events(event_type, created_at DESC);
CREATE UNIQUE INDEX idx_event_idempotency ON deployment_events(idempotency_key) WHERE idempotency_key IS NOT NULL;
