'use client'

import { useState, useCallback, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { lucidGet } from '@/lib/api'
import { StatusDot } from '@/components/shared/status-dot'
import { ErrorBanner } from '@/components/shared/error-banner'
import { CopyButton } from '@/components/shared/copy-button'
import { JsonViewer } from '@/components/shared/json-viewer'
import { TimeAgo } from '@/components/shared/time-ago'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Passport {
  id: string
  name: string
  type: 'model' | 'compute' | 'tool' | 'agent' | 'dataset'
  status: 'active' | 'deprecated' | 'revoked'
  created_at: string
  metadata: Record<string, unknown>
}

interface PassportDetailResponse {
  success: boolean
  passport: Passport
}

type PassportType = Passport['type']

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const typeBadgeClasses: Record<PassportType, string> = {
  model: 'bg-blue-900/50 text-blue-300',
  compute: 'bg-purple-900/50 text-purple-300',
  tool: 'bg-amber-900/50 text-amber-300',
  agent: 'bg-emerald-900/50 text-emerald-300',
  dataset: 'bg-pink-900/50 text-pink-300',
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-6" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PassportDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [passport, setPassport] = useState<Passport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPassport = useCallback(async () => {
    try {
      const data = await lucidGet<PassportDetailResponse>(`/v1/passports/${id}`)
      setPassport(data.passport)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load passport')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchPassport()
  }, [fetchPassport])

  // --- loading ---
  if (loading) return <DetailSkeleton />

  // --- error ---
  if (error) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/passports')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <ErrorBanner message={error} onRetry={fetchPassport} />
      </div>
    )
  }

  if (!passport) return null

  // --- main ---
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/passports')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">{passport.name}</h2>
        <StatusDot status={passport.status} />
        <Badge className={typeBadgeClasses[passport.type]}>{passport.type}</Badge>
      </div>

      {/* Details card */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
            <div>
              <dt className="text-zinc-500">ID</dt>
              <dd className="flex items-center gap-1 font-mono text-zinc-200">
                <span className="truncate">{passport.id}</span>
                <CopyButton value={passport.id} />
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Type</dt>
              <dd className="capitalize text-zinc-200">{passport.type}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Status</dt>
              <dd className="flex items-center gap-2 text-zinc-200">
                <StatusDot status={passport.status} />
                <span className="capitalize">{passport.status}</span>
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Created</dt>
              <dd className="text-zinc-200">
                <TimeAgo date={passport.created_at} />
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Metadata card */}
      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          {passport.metadata && Object.keys(passport.metadata).length > 0 ? (
            <JsonViewer data={passport.metadata} defaultOpen />
          ) : (
            <p className="text-sm text-zinc-500">No metadata</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
