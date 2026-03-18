'use client'

import { useState, useCallback, useEffect, type FormEvent } from 'react'
import { lucidGet, lucidPost } from '@/lib/api'
import { StatusDot } from '@/components/shared/status-dot'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorBanner } from '@/components/shared/error-banner'
import { JsonViewer } from '@/components/shared/json-viewer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemoryHealth {
  store_type: string
  capabilities: Record<string, boolean>
  status: string
}

interface RecallResponse {
  success: boolean
  results: unknown[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MEMORY_TYPES: { value: string; label: string; description: string }[] = [
  { value: 'episodic', label: 'Episodic', description: 'Conversation turns and interactions' },
  { value: 'semantic', label: 'Semantic', description: 'Extracted facts and knowledge' },
  { value: 'procedural', label: 'Procedural', description: 'Learned rules and workflows' },
  { value: 'entity', label: 'Entity', description: 'Knowledge graph nodes' },
  { value: 'trust_weighted', label: 'Trust Weighted', description: 'Cross-agent trust scores' },
  { value: 'temporal', label: 'Temporal', description: 'Time-bounded facts' },
]

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function MemorySkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MemoryPage() {
  // --- health state ---
  const [health, setHealth] = useState<MemoryHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- recall state ---
  const [query, setQuery] = useState('')
  const [agentId, setAgentId] = useState('')
  const [recalling, setRecalling] = useState(false)
  const [recallResults, setRecallResults] = useState<unknown[] | null>(null)
  const [recallError, setRecallError] = useState<string | null>(null)

  // --- fetch health ---
  const fetchHealth = useCallback(async () => {
    try {
      const data = await lucidGet<MemoryHealth>('/v1/memory/health')
      setHealth(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory health')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  // --- recall handler ---
  const handleRecall = async (e: FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setRecalling(true)
    setRecallError(null)
    setRecallResults(null)

    try {
      const body: { query: string; agent_passport_id?: string } = { query: query.trim() }
      if (agentId.trim()) body.agent_passport_id = agentId.trim()

      const data = await lucidPost<RecallResponse>('/v1/memory/recall', body)
      setRecallResults(data.results)
    } catch (err) {
      setRecallError(err instanceof Error ? err.message : 'Recall failed')
    } finally {
      setRecalling(false)
    }
  }

  if (loading) return <MemorySkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <h2 className="text-2xl font-bold">Memory Explorer</h2>

      {/* Error */}
      {error && <ErrorBanner message={error} onRetry={fetchHealth} />}

      {/* Health card */}
      {health && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusDot status={health.status} />
              <span>Memory Store: {health.store_type}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(health.capabilities).map(([cap, enabled]) => (
                <Badge
                  key={cap}
                  className={
                    enabled
                      ? 'bg-emerald-900/50 text-emerald-300'
                      : 'bg-zinc-800 text-zinc-500'
                  }
                >
                  {cap}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recall form */}
      <Card>
        <CardHeader>
          <CardTitle>Semantic Recall</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRecall} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recall-query">Query</Label>
              <Input
                id="recall-query"
                placeholder="e.g. What tools does the agent use?"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recall-agent">Agent Passport ID (optional)</Label>
              <Input
                id="recall-agent"
                placeholder="e.g. abc-123"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={recalling || !query.trim()}>
              {recalling ? 'Recalling...' : 'Recall'}
            </Button>
          </form>

          {/* Recall error */}
          {recallError && (
            <div className="mt-4">
              <ErrorBanner message={recallError} />
            </div>
          )}

          {/* Recall results */}
          {recallResults !== null && (
            <div className="mt-4">
              {recallResults.length === 0 ? (
                <p className="text-sm text-zinc-500">No results found.</p>
              ) : (
                <JsonViewer data={recallResults} defaultOpen />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Memory type tabs */}
      <Tabs defaultValue="episodic">
        <TabsList>
          {MEMORY_TYPES.map((mt) => (
            <TabsTrigger key={mt.value} value={mt.value}>
              {mt.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {MEMORY_TYPES.map((mt) => (
          <TabsContent key={mt.value} value={mt.value}>
            <Card>
              <CardHeader>
                <CardTitle>{mt.label} Memory</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-400">{mt.description}</p>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
