'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { lucidGet } from '@/lib/api'
import { StatusDot } from '@/components/shared/status-dot'
import { DataTable, type Column } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorBanner } from '@/components/shared/error-banner'
import { TimeAgo } from '@/components/shared/time-ago'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentPassport {
  id: string
  name: string
  status: string
  deployment_status?: string
  created_at: string
}

interface PassportListResponse {
  success: boolean
  passports: AgentPassport[]
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function DeploymentsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
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

export default function DeploymentsPage() {
  const router = useRouter()
  const [passports, setPassports] = useState<AgentPassport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDeployments = useCallback(async () => {
    try {
      const data = await lucidGet<PassportListResponse>('/v1/passports?type=agent')
      setPassports(data.passports)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deployments')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDeployments()
  }, [fetchDeployments])

  const columns: Column<AgentPassport>[] = [
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusDot status={row.deployment_status || row.status} />
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (row) => <span className="font-semibold text-zinc-100">{row.name}</span>,
    },
    {
      key: 'passport_status',
      header: 'Passport Status',
      render: (row) => <span className="text-zinc-400">{row.status}</span>,
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row) => <TimeAgo date={row.created_at} />,
    },
  ]

  if (loading) return <DeploymentsSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <h2 className="text-2xl font-bold">Deployments</h2>

      {/* Error */}
      {error && <ErrorBanner message={error} onRetry={fetchDeployments} />}

      {/* Table or empty */}
      {!error && passports.length === 0 ? (
        <EmptyState title="No agent deployments" />
      ) : (
        !error && (
          <DataTable<AgentPassport & Record<string, unknown>>
            columns={columns as Column<AgentPassport & Record<string, unknown>>[]}
            data={passports as (AgentPassport & Record<string, unknown>)[]}
            onRowClick={(row) => router.push(`/deployments/${row.id}`)}
          />
        )
      )}
    </div>
  )
}
