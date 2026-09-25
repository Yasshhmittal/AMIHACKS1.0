import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Pause, Play } from 'lucide-react'
import { useScanStream } from '../hooks/useScanStream'
import { Panel, SeverityChip } from '../components/ui'
import { Reveal } from '../components/motion'
import type { Severity } from '../types'

const PHASES = ['INVENTORY', 'SEED', 'BASELINE', 'CROSS', 'ANON', 'DERIVE', 'CONFIRM', 'SCORE']
const COLOR: Record<string, string> = {
  'scan.started': 'var(--color-sky)', 'phase.started': 'var(--color-ink)', 'spec.parsed': 'var(--color-sky)',
  'objects.discovered': 'var(--color-sky)', probe: 'var(--color-muted)', signal: 'var(--color-sev-medium)',
  finding: 'var(--color-sev-critical)', 'confirm.started': 'var(--color-ink)', 'scan.completed': 'var(--color-lime2)', 'scan.aborted': 'var(--color-sev-critical)',
}
function line(ev: { type: string; payload: any }): string {
  const p = ev.payload || {}
  switch (ev.type) {
    case 'scan.started': return `scan started → ${p.target} (${p.endpoint_count} endpoints)`
    case 'phase.started': return `── phase ${p.phase}`
    case 'spec.parsed': return `spec parsed: ${p.endpoint_count} endpoints · ${p.secured_count} secured · ${p.object_bearing_count} object-bearing`
    case 'objects.discovered': return `${p.identity} owns [${(p.objects || []).join(', ')}]`
    case 'probe': return `${p.identity} → ${p.endpoint} → ${p.status} (${p.latency_ms}ms)`
    case 'signal': return `signal @ ${p.endpoint}: ${p.signal}`
    case 'finding': return `FINDING · ${p.severity} · ${p.class} @ ${p.endpoint}`
    case 'confirm.started': return `confirming ${p.finding_count} candidate(s)…`
    case 'scan.completed': return `complete — ${p.total_findings} findings · ${p.total_requests} requests · risk ${Math.round(p.risk_score || 0)}`
    case 'scan.aborted': return `ABORTED (${p.reason}) ${p.detail || ''}`
    default: return ev.type
  }
}

export default function LiveScan() {
  const { scanId } = useParams()
  const nav = useNavigate()
  const s = useScanStream(scanId)
  const [paused, setPaused] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!paused && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.events.length, paused])
  const phaseIdx = PHASES.indexOf(s.phase)
  const sevCounts = useMemo(() => { const m: Record<string, number> = {}; s.findings.forEach(f => { m[f.severity] = (m[f.severity] || 0) + 1 }); return m }, [s.findings])

  return (
    <div className="space-y-6">
      <Reveal><div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="font-display text-4xl font-bold tracking-tight">Live scan</h1><p className="mt-1 text-sm text-ink2">Every line is a real engine event over SSE — no simulated progress.</p></div>
        {s.done && <button onClick={() => nav(`/scan/${scanId}/results`)} className="lime-btn inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm">View results <ArrowRight size={16} /></button>}
      </div></Reveal>

      {s.aborted && <Panel className="flex items-center gap-3 p-4" style={{ borderColor: 'color-mix(in srgb,var(--color-sev-critical) 45%,transparent)' }}>
        <AlertTriangle style={{ color: 'var(--color-sev-critical)' }} />
        <div><p className="font-semibold" style={{ color: 'var(--color-sev-critical)' }}>Aborted by the safety guard: {s.aborted.reason}</p><p className="text-xs text-muted">{s.aborted.detail}</p></div>
      </Panel>}

      <Panel className="p-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
          {PHASES.map((ph, i) => {
            const done = s.done ? true : i < phaseIdx, active = !s.done && i === phaseIdx
            return <div key={ph} className="flex items-center gap-2">
              <div className="chip flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ background: done ? 'color-mix(in srgb,var(--color-lime) 28%,transparent)' : active ? 'var(--color-ink)' : 'var(--color-cream2)', color: done ? '#3f5f00' : active ? 'var(--color-cream)' : 'var(--color-muted)' }}>
                {done ? '✓' : active ? <span className="live-dot">●</span> : '○'} {ph}
              </div>
              {i < PHASES.length - 1 && <span className="h-px w-3 bg-hair" />}
            </div>
          })}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Panel dark className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-panelhair px-5 py-3">
            <h2 className="text-sm font-bold text-cream">Live event log</h2>
            <button onClick={() => setPaused(p => !p)} className="flex items-center gap-1.5 rounded-full bg-panel2 px-2.5 py-1 text-xs text-oncream/70 hover:text-cream">{paused ? <><Play size={12} /> Resume</> : <><Pause size={12} /> Pause</>}</button>
          </div>
          <div ref={logRef} className="scroll mono h-[420px] overflow-auto px-5 py-3 text-xs leading-relaxed">
            {s.events.length === 0 && <p className="text-oncream/50">Waiting for the first engine event…</p>}
            {s.events.map((ev, i) => <div key={i} className="flex gap-3 py-0.5"><span className="w-8 shrink-0 text-right text-oncream/30">{ev.seq}</span><span style={{ color: COLOR[ev.type] || 'var(--color-oncream)' }}>{line(ev)}</span></div>)}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel className="p-5">
            <h2 className="font-display mb-4 text-sm font-bold">Counters</h2>
            <div className="grid grid-cols-2 gap-3 text-center">
              {[['Requests', s.counters.requests], ['Endpoints', s.counters.endpoints], ['Secured', s.counters.secured], ['Object', s.counters.objectBearing]].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-cream2 p-3"><div className="font-display text-2xl font-bold">{v as number}</div><div className="text-[11px] text-muted">{k as string}</div></div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">{(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Severity[]).filter(x => sevCounts[x]).map(x => <span key={x} className="flex items-center gap-1.5 text-xs"><SeverityChip s={x} small /> {sevCounts[x]}</span>)}</div>
          </Panel>
          <Panel className="p-5">
            <h2 className="font-display mb-3 text-sm font-bold">Findings as they land</h2>
            {s.findings.length === 0 ? <p className="text-xs text-muted">None yet. Confirmed findings appear the instant the engine proves them.</p>
              : <div className="space-y-2">{s.findings.slice().reverse().map((f, i) => <div key={i} className="rounded-xl border border-hair bg-paper p-3"><div className="mb-1 flex items-center justify-between"><SeverityChip s={f.severity} small /><span className="mono text-[10px] text-muted">{f.class}</span></div><p className="mono text-xs">{f.endpoint}</p></div>)}</div>}
          </Panel>
        </div>
      </div>
    </div>
  )
}
