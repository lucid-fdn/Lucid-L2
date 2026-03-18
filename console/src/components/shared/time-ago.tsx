'use client'

import { useEffect, useState } from 'react'

function formatTimeAgo(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function TimeAgo({ date }: { date: string | Date }) {
  const [text, setText] = useState(() => formatTimeAgo(date))

  useEffect(() => {
    const interval = setInterval(() => setText(formatTimeAgo(date)), 30000)
    return () => clearInterval(interval)
  }, [date])

  return <span className="text-zinc-500 text-sm" title={new Date(date).toISOString()}>{text}</span>
}
