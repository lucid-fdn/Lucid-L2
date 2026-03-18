'use client'

import { useState, useCallback, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { lucidGet } from '@/lib/api'
import { StatusDot } from '@/components/shared/status-dot'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorBanner } from '@/components/shared/error-banner'
import { TimeAgo } from '@/components/shared/time-ago'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeploymentEvent {
  id: string
  type: string
  status?: string
  message?: string
  created_at: string
}

interface EventsResponse {
  success: boolean
  events: DeploymentEvent[]
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function EventsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-56" />
      </div>
      <div className="space-y-4 pl-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DeploymentEventsPage() {
  const params = useParams()
  const router = useRouter()
  const passportId = params.passportId as string

  const [events, setEvents] = useState<DeploymentEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    try {
      const data = await lucidGet<EventsResponse>(`/v1/agents/${passportId}/events`)
      setEvents(data.events)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events')
    } finally {
      setLoading(false)
    }
  }, [passportId])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  if (loading) return <EventsSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/deployments')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">Deployment Events</h2>
          <p className="text-sm font-mono text-zinc-500">{passportId}</p>
        </div>
      </div>

      {/* Error */}
      {error && <ErrorBanner message={error} onRetry={fetchEvents} />}

      {/* Events timeline or empty */}
      {!error && events.length === 0 ? (
        <EmptyState title="No events yet" />
      ) : (
        !error && (
          <div className="relative ml-4 border-l-2 border-zinc-800 pl-6 space-y-6">
            {events.map((event) => (
              <div key={event.id} className="relative">
                {/* Dot on timeline */}
                <div className="absolute -left-[31px] top-1">
                  <StatusDot status={event.status || 'unknown'} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{event.type}</Badge>
                  <TimeAgo date={event.created_at} />
                </div>
                {event.message && (
                  <p className="mt-1 text-sm text-zinc-300">{event.message}</p>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
