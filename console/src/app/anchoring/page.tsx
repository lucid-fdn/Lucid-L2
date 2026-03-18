'use client'

import { useState, useCallback, useEffect } from 'react'
import { lucidGet, lucidPost } from '@/lib/api'
import { DataTable, type Column } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorBanner } from '@/components/shared/error-banner'
import { TimeAgo } from '@/components/shared/time-ago'
import { CopyButton } from '@/components/shared/copy-button'
import { JsonViewer } from '@/components/shared/json-viewer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentPassport {
  id: string
  name: string
  [key: string]: unknown
}

interface PassportListResponse {
  success: boolean
  passports: AgentPassport[]
}

interface Anchor {
  id: string
  artifact_type: string
  content_hash: string
  cid?: string
  provider: string
  storage_tier: string
  created_at: string
  [key: string]: unknown
}

interface AnchorListResponse {
  success: boolean
  anchors: Anchor[]
}

interface LineageResponse {
  success: boolean
  lineage: unknown[]
}

interface VerifyResponse {
  success: boolean
  verified: boolean
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function AnchoringSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AnchoringPage() {
  // --- agent dropdown state ---
  const [agents, setAgents] = useState<AgentPassport[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [agentsError, setAgentsError] = useState<string | null>(null)

  // --- anchors state ---
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const [anchorsLoading, setAnchorsLoading] = useState(false)
  const [anchorsError, setAnchorsError] = useState<string | null>(null)

  // --- lineage / verify state ---
  const [lineageData, setLineageData] = useState<Record<string, unknown> | null>(null)
  const [lineageLoading, setLineageLoading] = useState(false)
  const [verifyData, setVerifyData] = useState<Record<string, unknown> | null>(null)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // --- fetch agents on mount ---
  const fetchAgents = useCallback(async () => {
    try {
      const data = await lucidGet<PassportListResponse>('/v1/passports?type=agent')
      setAgents(data.passports)
      setAgentsError(null)
    } catch (err) {
      setAgentsError(err instanceof Error ? err.message : 'Failed to load agents')
    } finally {
      setAgentsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  // --- fetch anchors when agent changes ---
  const fetchAnchors = useCallback(async (agentId: string) => {
    if (!agentId) return
    setAnchorsLoading(true)
    setAnchorsError(null)
    setLineageData(null)
    setVerifyData(null)
    setActionError(null)
    try {
      const data = await lucidGet<AnchorListResponse>(
        `/v1/anchors?agent_passport_id=${encodeURIComponent(agentId)}`
      )
      setAnchors(data.anchors)
    } catch (err) {
      setAnchorsError(err instanceof Error ? err.message : 'Failed to load anchors')
    } finally {
      setAnchorsLoading(false)
    }
  }, [])

  const handleAgentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const agentId = e.target.value
    setSelectedAgentId(agentId)
    if (agentId) {
      fetchAnchors(agentId)
    } else {
      setAnchors([])
    }
  }

  // --- lineage handler ---
  const handleLineage = async (anchorId: string) => {
    setLineageLoading(true)
    setLineageData(null)
    setVerifyData(null)
    setActionError(null)
    try {
      const data = await lucidGet<LineageResponse>(`/v1/anchors/${encodeURIComponent(anchorId)}/lineage`)
      setLineageData(data as unknown as Record<string, unknown>)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load lineage')
    } finally {
      setLineageLoading(false)
    }
  }

  // --- verify handler ---
  const handleVerify = async (anchorId: string) => {
    setVerifyLoading(true)
    setVerifyData(null)
    setLineageData(null)
    setActionError(null)
    try {
      const data = await lucidPost<VerifyResponse>(`/v1/anchors/${encodeURIComponent(anchorId)}/verify`, {})
      setVerifyData(data as unknown as Record<string, unknown>)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to verify anchor')
    } finally {
      setVerifyLoading(false)
    }
  }

  // --- columns ---
  const columns: Column<Anchor>[] = [
    {
      key: 'artifact_type',
      header: 'Type',
      render: (row) => <Badge variant="outline">{row.artifact_type}</Badge>,
    },
    {
      key: 'cid',
      header: 'CID',
      render: (row) =>
        row.cid ? (
          <span className="flex items-center gap-1">
            <span className="font-mono text-sm text-zinc-300">
              {row.cid.slice(0, 16)}...
            </span>
            <CopyButton value={row.cid} />
          </span>
        ) : (
          <span className="text-zinc-500">—</span>
        ),
    },
    {
      key: 'provider',
      header: 'Provider',
      render: (row) => <span className="text-zinc-300">{row.provider}</span>,
    },
    {
      key: 'storage_tier',
      header: 'Tier',
      render: (row) => <Badge variant="outline">{row.storage_tier}</Badge>,
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row) => <TimeAgo date={row.created_at} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              handleLineage(row.id)
            }}
            disabled={lineageLoading}
          >
            Lineage
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              handleVerify(row.id)
            }}
            disabled={verifyLoading}
          >
            Verify
          </Button>
        </div>
      ),
    },
  ]

  // --- render ---
  if (agentsLoading) return <AnchoringSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <h2 className="text-2xl font-bold">Anchoring</h2>

      {/* Agent selector */}
      <div className="space-y-2">
        <Label htmlFor="agent-select">Agent</Label>
        <select
          id="agent-select"
          value={selectedAgentId}
          onChange={handleAgentChange}
          className="h-8 w-full max-w-sm rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Select an agent...</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} ({agent.id.slice(0, 8)}...)
            </option>
          ))}
        </select>
      </div>

      {/* Agents error */}
      {agentsError && <ErrorBanner message={agentsError} onRetry={fetchAgents} />}

      {/* No agent selected */}
      {!selectedAgentId && !agentsError && (
        <EmptyState title="Select an agent to view anchors" />
      )}

      {/* Anchors loading */}
      {anchorsLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Anchors error */}
      {anchorsError && (
        <ErrorBanner
          message={anchorsError}
          onRetry={() => fetchAnchors(selectedAgentId)}
        />
      )}

      {/* Anchors table or empty */}
      {selectedAgentId && !anchorsLoading && !anchorsError && anchors.length === 0 && (
        <EmptyState title="No anchors found for this agent" />
      )}

      {selectedAgentId && !anchorsLoading && !anchorsError && anchors.length > 0 && (
        <DataTable<Anchor & Record<string, unknown>>
          columns={columns as Column<Anchor & Record<string, unknown>>[]}
          data={anchors as (Anchor & Record<string, unknown>)[]}
        />
      )}

      {/* Action error */}
      {actionError && <ErrorBanner message={actionError} />}

      {/* Lineage result */}
      {lineageData && (
        <Card>
          <CardHeader>
            <CardTitle>Lineage</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonViewer data={lineageData} defaultOpen />
          </CardContent>
        </Card>
      )}

      {/* Verify result */}
      {verifyData && (
        <Card>
          <CardHeader>
            <CardTitle>Verification Result</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonViewer data={verifyData} defaultOpen />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
