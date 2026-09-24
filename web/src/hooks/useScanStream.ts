import { useEffect, useRef, useState } from 'react'
import { api, fixture } from '../api/client'
import type { ScanEvent } from '../types'

// Real events only: SSE first, polling fallback from the last seen seq. No timers faking progress.
export function useScanStream(scanId: string) {
  const [events, setEvents] = useState<ScanEvent[]>([])
  const [transport, setTransport] = useState<'sse' | 'polling' | 'idle'>('idle')
  const last = useRef(0)
  useEffect(() => {
    if (import.meta.env.VITE_USE_FIXTURE === 'true' && fixture) { setEvents(fixture.events); return }
    const add = (e: ScanEvent) => { if (e.seq <= last.current) return; last.current = e.seq; setEvents(p => [...p, { ...e, t: Date.now() }]) }
    let poll: ReturnType<typeof setInterval> | undefined
    const es = new EventSource(`/api/scans/${scanId}/stream`)
    setTransport('sse')
    es.onmessage = m => add(JSON.parse(m.data))
    es.onerror = () => {
      es.close(); setTransport('polling')
      poll = setInterval(() => api.events(scanId, last.current).then(r => r.forEach(add)).catch(() => {}), 2000)
    }
    return () => { es.close(); if (poll) clearInterval(poll) }
  }, [scanId])
  return { events, transport }
}
