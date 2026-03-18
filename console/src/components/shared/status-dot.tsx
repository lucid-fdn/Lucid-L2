import { cn } from '@/lib/utils'

type Status = 'healthy' | 'degraded' | 'down' | 'running' | 'pending' | 'deploying' | 'stopped' | 'failed' | 'unknown'

const statusColors: Record<Status, string> = {
  healthy: 'bg-emerald-500',
  running: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  pending: 'bg-amber-500',
  deploying: 'bg-amber-500',
  down: 'bg-red-500',
  stopped: 'bg-red-500',
  failed: 'bg-red-500',
  unknown: 'bg-zinc-500',
}

export function StatusDot({ status, className }: { status: string; className?: string }) {
  const color = statusColors[status as Status] || statusColors.unknown
  return (
    <span className={cn('inline-block h-2.5 w-2.5 rounded-full', color, className)} />
  )
}
