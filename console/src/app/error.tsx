'use client'

import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
      <h2 className="text-lg font-medium text-zinc-300 mb-2">
        Something went wrong
      </h2>
      <p className="text-sm text-zinc-500 mb-4 max-w-md">{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
