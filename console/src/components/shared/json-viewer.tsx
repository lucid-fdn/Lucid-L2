'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'

export function JsonViewer({ data, defaultOpen = false }: { data: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  if (data === null || data === undefined) return <span className="text-zinc-500">null</span>
  if (typeof data !== 'object') return <span className="font-mono text-sm text-zinc-300">{String(data)}</span>

  const entries = Object.entries(data as Record<string, unknown>)

  return (
    <div className="text-sm">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="font-mono">{Array.isArray(data) ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </button>
      {open && (
        <div className="ml-4 border-l border-zinc-800 pl-3 mt-1 space-y-1">
          {entries.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="font-mono text-zinc-500 shrink-0">{key}:</span>
              {typeof value === 'object' && value !== null
                ? <JsonViewer data={value} />
                : <span className="font-mono text-zinc-300 break-all">{JSON.stringify(value)}</span>
              }
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
