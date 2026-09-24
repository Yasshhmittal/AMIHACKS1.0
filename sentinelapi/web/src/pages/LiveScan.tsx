import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Pause, Play } from 'lucide-react'
import { useScanStream } from '../hooks/useScanStream'
import { Btn, Glass, SeverityChip } from '../components/glass'
import type { Severity } from '../types'

const PHASES = ['INVENTORY', 'SEED', 'BASELINE', 'CROSS', 'ANON', 'DERIVE', 'CONFIRM', 'SCORE']

const EVENT_COLOR: Record<string, string> = {
  'scan.started': 'var(--color-cyan)', 'phase.started': 'var(--color-teal)',
  'spec.parsed': 'var(--color-cyan)', 'objects.discovered': 'var(--color-cyan)',
  probe: 'var(--color-dim)', signal: 'var(--color-sev-medium)',
  finding: 'var(--color-sev-critical)', 'confirm.started': 'var(--color-teal)',
  'scan.completed': 'var(--color-emerald)', 'scan.aborted': 'var(--color-sev-critical)',
}

function line(ev: { type: string; payload: any }): string {
  const p = ev.payload || {}
  switch (ev.type) {
    case 'scan.started': return `scan started → ${p.target} (${p.endpoint_count} endpoints)`
    case 'phase.started': return `── phase ${p.phase}`
    case 'spec.parsed': return `spec parsed: ${p.endpoint_count} endpoints · ${p.secured_count} secured · ${p.object_bearing_count} object-bearing`
    case 'objects.discovered': return `${p.identity} owns objects [${(p.objects || []).join(', ')}]`
    case 'probe': return `${p.identity} → ${p.endpoint}  → ${p.status} (${p.latency_ms}ms)`
    case 'signal': return `signal @ ${p.endpoint}: ${p.signal}`
    case 'finding': return `FINDING · ${p.severity} · ${p.class} @ ${p.endpoint}`
    case 'confirm.started': return `confirming ${p.finding_count} candidate(s)…`
    case 'scan.completed': return `scan complete — ${p.total_findings} findings · ${p.total_requests} requests · risk ${Math.round(p.risk_score || 0)}`
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

  useEffect(() => {
    if (!paused && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [s.events.length, paused])

  const phaseIdx = PHASES.indexOf(s.phase)
  const sevCounts = useMemo(() => {
    const m: Record<string, number> = {}
    s.findings.forEach(f => { m[f.severity] = (m[f.severity] || 0) + 1 })
    return m
  }, [s.findings])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rise">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Live scan</h1>
          <p className="mt-1 text-sm text-dim">Every line below is a real engine event over SSE — no simulated progress.</p>
        </div>
        {s.done && <Btn onClick={() => nav(`/scan/${scanId}/results`)}>View results <ArrowRight size={16} /></Btn>}
      </div>

      {s.aborted && (
        <Glass className="rise flex items-center gap-3 p-4" style={{ borderColor: 'color-mix(in srgb, var(--color-sev-critical) 50%, transparent)' }}>
          <AlertTriangle style={{ color: 'var(--color-sev-critical)' }} />
          <div><p className="font-semibold" style={{ color: 'var(--color-sev-critical)' }}>Scan aborted by the safety guard: {s.aborted.reason}</p>
            <p className="text-xs text-dim">{s.aborted.detail}</p></div>
        </Glass>
      )}

      {/* phase checklist */}
      <Glass className="rise p-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
          {PHASES.map((ph, i) => {
            const done = s.done ? true : i < phaseIdx
            const active = !s.done && i === phaseIdx
            return (
              <div key={ph} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${active ? 'glow-teal' : ''}`}
                  style={{
                    background: done ? 'color-mix(in srgb, var(--color-emerald) 15%, transparent)' : active ? 'color-mix(in srgb, var(--color-teal) 15%, transparent)' : 'rgba(255,255,255,.03)',
                    color: done ? 'var(--color-emerald)' : active ? 'var(--color-teal)' : 'var(--color-dim)',
                    border: '1px solid ' + (done ? 'color-mix(in srgb, var(--color-emerald) 40%, transparent)' : active ? 'color-mix(in srgb, var(--color-teal) 45%, transparent)' : 'rgba(255,255,255,.06)'),
                  }}>
                  {done ? '✓' : active ? <span className="live-dot">●</span> : '○'} {ph}
                </div>
                {i < PHASES.length - 1 && <span className="h-px w-3" style={{ background: 'rgba(255,255,255,.1)' }} />}
              </div>
            )
          })}
        </div>
      </Glass>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* live log */}
        <Glass className="rise overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-3">
            <h2 className="text-sm font-bold">Live event log</h2>
            <button onClick={() => setPaused(p => !p)} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1 text-xs text-dim hover:text-ink">
              {paused ? <><Play size={12} /> Resume scroll</> : <><Pause size={12} /> Pause scroll</>}
            </button>
          </div>
          <div ref={logRef} className="scroll mono h-[420px] overflow-auto px-5 py-3 text-xs leading-relaxed">
            {s.events.length === 0 && <p className="text-dim">Waiting for the first engine event…</p>}
            {s.events.map((ev, i) => (
              <div key={i} className="flex gap-3 py-0.5">
                <span className="w-8 shrink-0 text-right text-faint">{ev.seq}</span>
                <span style={{ color: EVENT_COLOR[ev.type] || 'var(--color-dim)' }}>{line(ev)}</span>
              </div>
            ))}
          </div>
        </Glass>

        {/* counters + findings preview */}
        <div className="space-y-6">
          <Glass className="rise p-5">
            <h2 className="mb-4 text-sm font-bold">Counters</h2>
            <div className="grid grid-cols-2 gap-3 text-center">
              {[['Requests', s.counters.requests], ['Endpoints', s.counters.endpoints], ['Secured', s.counters.secured], ['Object-bearing', s.counters.objectBearing]].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-white/[.03] p-3 hair">
                  <div className="text-2xl font-extrabold" style={{ color: 'var(--color-teal)' }}>{v as number}</div>
                  <div className="text-[11px] text-dim">{k as string}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Severity[]).filter(x => sevCounts[x]).map(x => (
                <span key={x} className="flex items-center gap-1.5 text-xs"><SeverityChip s={x} small /> {sevCounts[x]}</span>
              ))}
            </div>
          </Glass>

          <Glass className="rise p-5">
            <h2 className="mb-3 text-sm font-bold">Findings as they land</h2>
            {s.findings.length === 0 ? <p className="text-xs text-dim">None yet. Confirmed findings appear here the instant the engine proves them.</p>
              : <div className="space-y-2">
                {s.findings.slice().reverse().map((f, i) => (
                  <div key={i} className="rise rounded-xl bg-white/[.03] p-3 hair">
                    <div className="mb-1 flex items-center justify-between">
                      <SeverityChip s={f.severity} small />
                      <span className="mono text-[10px] text-dim">{f.class}</span>
                    </div>
                    <p className="mono text-xs">{f.endpoint}</p>
                  </div>
                ))}
              </div>}
          </Glass>
        </div>
      </div>
    </div>
  )
}
