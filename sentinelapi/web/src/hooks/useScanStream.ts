import { useEffect, useRef, useState } from 'react'
import { eventsUrl, streamUrl } from '../lib/api'
import type { ScanEvent } from '../types'

export interface StreamState {
  events: ScanEvent[]
  phase: string
  findings: ScanEvent['payload'][]
  counters: { requests: number; endpoints: number; secured: number; objectBearing: number }
  done: boolean
  aborted?: { reason: string; detail?: string }
  completed?: ScanEvent['payload']
}

const EMPTY: StreamState = {
  events: [], phase: '', findings: [],
  counters: { requests: 0, endpoints: 0, secured: 0, objectBearing: 0 }, done: false,
}

/** Live scan stream. Prefers SSE; falls back to polling /events on error. */
export function useScanStream(scanId?: string) {
  const [state, setState] = useState<StreamState>(EMPTY)
  const lastSeq = useRef(0)

  useEffect(() => {
    if (!scanId) return
    setState(EMPTY); lastSeq.current = 0
    let closed = false
    let poll: ReturnType<typeof setInterval> | null = null

    const apply = (ev: ScanEvent) => {
      if (ev.seq <= lastSeq.current) return
      lastSeq.current = ev.seq
      setState(s => {
        const next: StreamState = { ...s, events: [...s.events, ev] }
        const p = ev.payload || {}
        if (ev.type === 'phase.started') next.phase = p.phase
        if (ev.type === 'spec.parsed') next.counters = {
          ...next.counters, endpoints: p.endpoint_count ?? next.counters.endpoints,
          secured: p.secured_count ?? next.counters.secured,
          objectBearing: p.object_bearing_count ?? next.counters.objectBearing,
        }
        if (ev.type === 'probe') next.counters = { ...next.counters, requests: next.counters.requests + 1 }
        if (ev.type === 'finding') next.findings = [...next.findings, p]
        if (ev.type === 'scan.aborted') { next.aborted = { reason: p.reason, detail: p.detail } }
        if (ev.type === 'scan.completed') { next.completed = p; next.counters = { ...next.counters, requests: p.total_requests ?? next.counters.requests } }
        if (ev.type === 'scan.stream.end' || ev.type === 'scan.completed') next.done = true
        return next
      })
    }

    const startPolling = () => {
      if (poll) return
      poll = setInterval(async () => {
        try {
          const r = await fetch(eventsUrl(scanId, lastSeq.current))
          const { events } = await r.json()
          for (const ev of events as ScanEvent[]) apply(ev)
          const isDone = (events as ScanEvent[]).some(e => e.type === 'scan.completed' || e.type === 'scan.stream.end')
          if (isDone && poll) { clearInterval(poll); poll = null }
        } catch { /* keep polling */ }
      }, 700)
    }

    let es: EventSource | null = null
    try {
      es = new EventSource(streamUrl(scanId))
      es.onmessage = e => { try { apply(JSON.parse(e.data)) } catch { /* ignore */ } }
      // named events also arrive as messages of that type
      const handler = (e: MessageEvent) => { try { apply(JSON.parse(e.data)) } catch { /* ignore */ } }
      ;['scan.started', 'phase.started', 'spec.parsed', 'objects.discovered', 'probe', 'signal',
        'candidate', 'confirm.started', 'finding', 'scan.completed', 'scan.aborted', 'scan.stream.end']
        .forEach(t => es!.addEventListener(t, handler as EventListener))
      es.onerror = () => { if (!closed) { es?.close(); startPolling() } }
    } catch {
      startPolling()
    }

    return () => { closed = true; es?.close(); if (poll) clearInterval(poll) }
  }, [scanId])

  return state
}
