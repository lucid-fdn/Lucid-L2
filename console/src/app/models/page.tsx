'use client'

import { useState, useCallback, useEffect } from 'react'
import { lucidGet } from '@/lib/api'
import { StatusDot } from '@/components/shared/status-dot'
import { DataTable, type Column } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorBanner } from '@/components/shared/error-banner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Model {
  id: string
  name: string
  format: string
  runtime: string
  available: boolean
}

interface ModelListResponse {
  success: boolean
  models: Model[]
}

type AvailabilityFilter = 'all' | 'available' | 'unavailable'

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ModelsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-28" />
        <div className="flex gap-1">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
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

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<AvailabilityFilter>('all')

  const fetchModels = useCallback(async () => {
    try {
      let path = '/v1/models'
      if (filter === 'available') path += '?available=true'
      else if (filter === 'unavailable') path += '?available=false'

      const data = await lucidGet<ModelListResponse>(path)
      setModels(data.models)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    setLoading(true)
    fetchModels()
  }, [fetchModels])

  const columns: Column<Model>[] = [
    {
      key: 'available',
      header: 'Status',
      render: (row) => <StatusDot status={row.available ? 'healthy' : 'down'} />,
    },
    {
      key: 'name',
      header: 'Name',
      render: (row) => <span className="font-semibold text-zinc-100">{row.name}</span>,
    },
    {
      key: 'format',
      header: 'Format',
      render: (row) => <Badge variant="outline">{row.format}</Badge>,
    },
    {
      key: 'runtime',
      header: 'Runtime',
      render: (row) => <span className="text-zinc-400">{row.runtime}</span>,
    },
  ]

  if (loading) return <ModelsSkeleton />

  const filterOptions: { value: AvailabilityFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'available', label: 'Available' },
    { value: 'unavailable', label: 'Unavailable' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Models</h2>
        <div className="flex gap-1 rounded-lg border border-zinc-800 p-0.5">
          {filterOptions.map((opt) => (
            <Button
              key={opt.value}
              variant={filter === opt.value ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && <ErrorBanner message={error} onRetry={fetchModels} />}

      {/* Table or empty */}
      {!error && models.length === 0 ? (
        <EmptyState title="No models registered" />
      ) : (
        !error && (
          <DataTable<Model & Record<string, unknown>>
            columns={columns as Column<Model & Record<string, unknown>>[]}
            data={models as (Model & Record<string, unknown>)[]}
          />
        )
      )}
    </div>
  )
}
