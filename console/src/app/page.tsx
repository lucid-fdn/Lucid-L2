'use client'

import { useState, useCallback, useEffect } from 'react'
import { lucidGet } from '@/lib/api'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { StatusDot } from '@/components/shared/status-dot'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorBanner } from '@/components/shared/error-banner'
import { RefreshButton } from '@/components/shared/refresh-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HealthData {
  status: string
  timestamp: string
  uptime: number
  version: string
  dependencies: Record<string, { status: string; latency?: number }>
}

interface PassportStats {
  success: boolean
  stats: { total: number; by_type: Record<string, number>; by_status: Record<string, number> }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ---------------------------------------------------------------------------
// Loading skeletons
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-24" />
      </div>

      {/* System status skeleton */}
      <Skeleton className="h-24 w-full rounded-xl" />

      {/* Dependencies skeleton */}
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [stats, setStats] = useState<PassportStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [healthData, statsData] = await Promise.all([
        lucidGet<HealthData>('/health'),
        lucidGet<PassportStats>('/v1/passports/stats').catch(() => null),
      ])
      setHealth(healthData)
      setStats(statsData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach L2')
    } finally {
      setLoading(false)
    }
  }, [])

  const { enabled, setEnabled, refresh, refreshing } = useAutoRefresh(fetchData, 10_000)

  // Initial fetch on mount
  useEffect(() => { fetchData() }, [fetchData])

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading) return <DashboardSkeleton />

  // ── Error ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <ErrorBanner message={error} onRetry={refresh} />
      </div>
    )
  }

  // ── Main content ─────────────────────────────────────────────────────
  const deps = health?.dependencies ?? {}
  const depEntries = Object.entries(deps)
  const byType = stats?.stats.by_type ?? {}
  const typeEntries = Object.entries(byType)
  const hasStats = stats !== null && stats.stats.total > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <RefreshButton
          onRefresh={refresh}
          refreshing={refreshing}
          autoEnabled={enabled}
          onToggleAuto={setEnabled}
        />
      </div>

      {/* System status */}
      {health && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusDot status={health.status} />
              <span>System {health.status}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6 text-sm text-zinc-400">
              <span>Version <span className="text-zinc-200">{health.version}</span></span>
              <span>Uptime <span className="text-zinc-200">{formatUptime(health.uptime)}</span></span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dependencies */}
      {depEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Dependencies</h3>
          <div className="grid grid-cols-3 gap-4">
            {depEntries.map(([name, dep]) => (
              <Card key={name}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2">
                    <StatusDot status={dep.status} />
                    <span className="font-medium capitalize">{name}</span>
                  </div>
                  {dep.latency !== undefined && (
                    <p className="text-xs text-zinc-500 mt-1 ml-4.5">
                      {dep.latency}ms
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Passport stats */}
      {hasStats ? (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Passports by Type</h3>
          <div className="grid grid-cols-5 gap-4">
            {typeEntries.map(([type, count]) => (
              <StatCard key={type} label={type} value={count} />
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          title="No passports yet"
          description="L2 is running. Create your first passport to get started."
        />
      )}
    </div>
  )
}
