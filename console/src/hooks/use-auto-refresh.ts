import { useEffect, useRef, useCallback, useState } from 'react'

export function useAutoRefresh(fetchFn: () => Promise<void>, intervalMs: number = 10000) {
  const [enabled, setEnabled] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try { await fetchFn() } finally { setRefreshing(false) }
  }, [fetchFn])

  useEffect(() => {
    if (enabled) {
      intervalRef.current = setInterval(refresh, intervalMs)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [enabled, intervalMs, refresh])

  return { enabled, setEnabled, refresh, refreshing }
}
