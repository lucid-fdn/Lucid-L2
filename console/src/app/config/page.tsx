'use client'

import { useState, useCallback, useEffect } from 'react'
import { lucidGet, ApiError } from '@/lib/api'
import { StatusDot } from '@/components/shared/status-dot'
import { ErrorBanner } from '@/components/shared/error-banner'
import { JsonViewer } from '@/components/shared/json-viewer'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Dependency {
  name: string
  status: string
  latency?: number
  [key: string]: unknown
}

interface HealthResponse {
  status: string
  version?: string
  dependencies?: Dependency[]
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ConfigSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ConfigPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [healthError, setHealthError] = useState<string | null>(null)

  const [paymentConfig, setPaymentConfig] = useState<Record<string, unknown> | null>(null)
  const [paymentLoading, setPaymentLoading] = useState(true)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  // --- fetch health ---
  const fetchHealth = useCallback(async () => {
    try {
      const data = await lucidGet<HealthResponse>('/health')
      setHealth(data)
      setHealthError(null)
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : 'Failed to load health')
    } finally {
      setHealthLoading(false)
    }
  }, [])

  // --- fetch payment config ---
  const fetchPaymentConfig = useCallback(async () => {
    try {
      const data = await lucidGet<Record<string, unknown>>('/v1/config/payment')
      setPaymentConfig(data)
      setPaymentError(null)
    } catch (err) {
      // Gracefully handle 404
      if (err instanceof ApiError && err.status === 404) {
        setPaymentConfig(null)
        setPaymentError(null)
      } else {
        setPaymentError(err instanceof Error ? err.message : 'Failed to load payment config')
      }
    } finally {
      setPaymentLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    fetchPaymentConfig()
  }, [fetchHealth, fetchPaymentConfig])

  // --- render ---
  if (healthLoading && paymentLoading) return <ConfigSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <h2 className="text-2xl font-bold">Configuration</h2>

      {/* Health error */}
      {healthError && <ErrorBanner message={healthError} onRetry={fetchHealth} />}

      {/* System status card */}
      {health && (
        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status + version */}
            <div className="flex items-center gap-3">
              <StatusDot status={health.status} />
              <span className="text-zinc-200 font-medium">{health.status}</span>
              {health.version && (
                <span className="font-mono text-sm text-zinc-400">
                  v{health.version}
                </span>
              )}
            </div>

            {/* Dependencies */}
            {health.dependencies && health.dependencies.length > 0 && (
              <div className="space-y-2">
                <span className="text-sm text-zinc-500 font-medium">Dependencies</span>
                <div className="space-y-1">
                  {health.dependencies.map((dep) => (
                    <div
                      key={dep.name}
                      className="flex items-center gap-3 rounded-md bg-zinc-900/50 px-3 py-2"
                    >
                      <StatusDot status={dep.status} />
                      <span className="text-sm text-zinc-200">{dep.name}</span>
                      <Badge variant="outline">{dep.status}</Badge>
                      {dep.latency !== undefined && (
                        <span className="text-xs text-zinc-500 ml-auto font-mono">
                          {dep.latency}ms
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment config card */}
      {!paymentError && paymentConfig && (
        <Card>
          <CardHeader>
            <CardTitle>Payment Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonViewer data={paymentConfig} defaultOpen />
          </CardContent>
        </Card>
      )}
      {paymentError && <ErrorBanner message={paymentError} onRetry={fetchPaymentConfig} />}

      {/* Full health response card */}
      {health && (
        <Card>
          <CardHeader>
            <CardTitle>Full Health Response</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonViewer data={health} defaultOpen />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
