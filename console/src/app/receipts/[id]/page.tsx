'use client'

import { useState, useCallback, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { lucidGet, ApiError } from '@/lib/api'
import { CopyButton } from '@/components/shared/copy-button'
import { ErrorBanner } from '@/components/shared/error-banner'
import { JsonViewer } from '@/components/shared/json-viewer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Receipt {
  run_id: string
  receipt_hash: string
  model_passport_id: string
  compute_passport_id?: string
  tokens_in: number
  tokens_out: number
  ttft_ms?: number
  [key: string]: unknown
}

interface ReceiptResponse {
  success: boolean
  receipt: Receipt
}

// ---------------------------------------------------------------------------
// Field display helper
// ---------------------------------------------------------------------------

function ReceiptField({ label, value }: { label: string; value: string | number | undefined | null }) {
  const display = value !== undefined && value !== null ? String(value) : '—'
  return (
    <div className="space-y-1">
      <Label className="text-zinc-500 text-xs uppercase tracking-wide">{label}</Label>
      <div className="flex items-center gap-1">
        <span className="font-mono text-sm text-zinc-200 break-all">{display}</span>
        {value !== undefined && value !== null && <CopyButton value={String(value)} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ReceiptDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReceiptDetailPage() {
  const params = useParams<{ id: string }>()
  const receiptId = params.id
  const router = useRouter()

  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [fullData, setFullData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchReceipt = useCallback(async () => {
    try {
      const data = await lucidGet<ReceiptResponse>(
        `/v1/receipts/${encodeURIComponent(receiptId)}`
      )
      setReceipt(data.receipt)
      setFullData(data as unknown as Record<string, unknown>)
      setError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError('Receipt not found')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load receipt')
      }
    } finally {
      setLoading(false)
    }
  }, [receiptId])

  useEffect(() => {
    fetchReceipt()
  }, [fetchReceipt])

  if (loading) return <ReceiptDetailSkeleton />

  return (
    <div className="space-y-6">
      {/* Back button + header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/receipts')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h2 className="text-2xl font-bold">Receipt Detail</h2>
      </div>

      {/* Error */}
      {error && <ErrorBanner message={error} onRetry={fetchReceipt} />}

      {/* Receipt fields card */}
      {receipt && (
        <Card>
          <CardHeader>
            <CardTitle>Fields</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ReceiptField label="Receipt Hash" value={receipt.receipt_hash} />
              <ReceiptField label="Run ID" value={receipt.run_id} />
              <ReceiptField label="Model Passport ID" value={receipt.model_passport_id} />
              <ReceiptField label="Compute Passport ID" value={receipt.compute_passport_id} />
              <ReceiptField label="Tokens In" value={receipt.tokens_in} />
              <ReceiptField label="Tokens Out" value={receipt.tokens_out} />
              <ReceiptField label="TTFT (ms)" value={receipt.ttft_ms} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full receipt JSON */}
      {fullData && (
        <Card>
          <CardHeader>
            <CardTitle>Full Receipt</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonViewer data={fullData} defaultOpen />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
