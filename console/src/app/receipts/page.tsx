'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { lucidGet } from '@/lib/api'
import { DataTable, type Column } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorBanner } from '@/components/shared/error-banner'
import { TimeAgo } from '@/components/shared/time-ago'
import { CopyButton } from '@/components/shared/copy-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Epoch {
  epoch_id: string
  status: string
  leaf_count: number
  mmr_root?: string
  created_at: string
  [key: string]: unknown
}

interface EpochListResponse {
  success: boolean
  epochs: Epoch[]
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ReceiptsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full rounded-lg" />
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

export default function ReceiptsPage() {
  const router = useRouter()

  // --- receipt lookup state ---
  const [receiptId, setReceiptId] = useState('')

  // --- epoch data state ---
  const [epochs, setEpochs] = useState<Epoch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const perPage = 20

  // --- fetch epochs ---
  const fetchEpochs = useCallback(async () => {
    try {
      const data = await lucidGet<EpochListResponse>(
        `/v1/epochs?page=${page}&per_page=${perPage}`
      )
      setEpochs(data.epochs)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load epochs')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    setLoading(true)
    fetchEpochs()
  }, [fetchEpochs])

  // --- receipt lookup ---
  const handleLookup = () => {
    const trimmed = receiptId.trim()
    if (trimmed) {
      router.push(`/receipts/${encodeURIComponent(trimmed)}`)
    }
  }

  // --- columns ---
  const columns: Column<Epoch>[] = [
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.status === 'finalized' ? 'default' : 'outline'}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'epoch_id',
      header: 'Epoch ID',
      render: (row) => (
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm text-zinc-300">
            {row.epoch_id.slice(0, 12)}...
          </span>
          <CopyButton value={row.epoch_id} />
        </span>
      ),
    },
    {
      key: 'leaf_count',
      header: 'Receipts',
      render: (row) => <span className="text-zinc-300">{row.leaf_count}</span>,
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row) => <TimeAgo date={row.created_at} />,
    },
  ]

  // --- render ---
  if (loading) return <ReceiptsSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <h2 className="text-2xl font-bold">Receipts &amp; Epochs</h2>

      {/* Receipt lookup card */}
      <Card>
        <CardHeader>
          <CardTitle>Receipt Lookup</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="receipt-id">Receipt ID</Label>
              <Input
                id="receipt-id"
                placeholder="Enter receipt ID..."
                value={receiptId}
                onChange={(e) => setReceiptId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLookup()
                }}
              />
            </div>
            <Button onClick={handleLookup} disabled={!receiptId.trim()}>
              <Search className="h-4 w-4 mr-1" />
              Lookup
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && <ErrorBanner message={error} onRetry={fetchEpochs} />}

      {/* Epoch table or empty */}
      {!error && epochs.length === 0 ? (
        <EmptyState title="No epochs yet" />
      ) : (
        !error && (
          <>
            <DataTable<Epoch & Record<string, unknown>>
              columns={columns as Column<Epoch & Record<string, unknown>>[]}
              data={epochs as (Epoch & Record<string, unknown>)[]}
              keyField="epoch_id"
            />

            {/* Pagination */}
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Prev
              </Button>
              <span className="text-sm text-zinc-400">Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={epochs.length < perPage}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </>
        )
      )}
    </div>
  )
}
