import { useCallback, useEffect, useState } from 'react'

export function useFetch<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    let alive = true
    setLoading(true); setError('')
    fn().then(d => { if (alive) setData(d) })
      .catch(e => { if (alive) setError(e.message || String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(load, [load])
  return { data, error, loading, reload: load, setData }
}
