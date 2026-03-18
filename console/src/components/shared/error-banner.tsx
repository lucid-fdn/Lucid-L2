'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-4 flex items-center gap-3">
      <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
      <p className="text-sm text-red-300 flex-1">{message}</p>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-1" /> Retry
        </Button>
      )}
    </div>
  )
}
