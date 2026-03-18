'use client'

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RefreshButtonProps {
  onRefresh: () => void
  refreshing: boolean
  autoEnabled: boolean
  onToggleAuto: (enabled: boolean) => void
}

export function RefreshButton({ onRefresh, refreshing, autoEnabled, onToggleAuto }: RefreshButtonProps) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
      </Button>
      <button
        onClick={() => onToggleAuto(!autoEnabled)}
        className={cn(
          'text-xs px-2 py-1 rounded',
          autoEnabled ? 'bg-emerald-900/50 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
        )}
      >
        {autoEnabled ? 'Auto' : 'Manual'}
      </button>
    </div>
  )
}
