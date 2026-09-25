import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Pause, Play, Activity, BarChart3, PieChart } from 'lucide-react'
import { useScanStream } from '../hooks/useScanStream'
import { Panel, SeverityChip } from '../components/ui'
import { Reveal } from '../components/motion'
import type { Severity, ScanEvent } from '../types'

const PHASES = ['INVENTORY', 'SEED', 'BASELINE', 'CROSS', 'ANON', 'DERIVE', 'CONFIRM', 'SCORE']

/* Subtle muted colors for light background — readable but not flashy */
const COLOR: Record<string, string> = {
  'scan.started': '#3d8bc9',
  'phase.started': '#5a6370',
  'spec.parsed': '#3d8bc9',
  'objects.discovered': '#5a8a1e',
  probe: '#6B7178',
  signal: '#b8860b',
  finding: '#c4163a',
  'confirm.started': '#5b44c4',
  'scan.completed': '#3a7a10',
  'scan.aborted': '#c4163a',
}

/* Severity-aware left-dot color */
function sevDot(ev: { type: string; payload: any }): string | null {
  if (ev.type === 'finding') {
    const s = ev.payload?.severity
    if (s === 'CRITICAL') return '#E11D48'
    if (s === 'HIGH') return '#F97316'
    if (s === 'MEDIUM') return '#D97706'
    if (s === 'LOW') return '#2563EB'
  }
  return null
}

function line(ev: { type: string; payload: any }): string {
  const p = ev.payload || {}
  switch (ev.type) {
    case 'scan.started': return `scan started → ${p.target} (${p.endpoint_count} endpoints)`
    case 'phase.started': return `phase ${p.phase}`
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

/* ── Mini Donut (light theme) ── */
function SeverityDonut({ counts }: { counts: Record<string, number> }) {
  const sevs = [
    { label: 'Critical', color: '#E11D48', count: counts['CRITICAL'] || 0 },
    { label: 'High', color: '#F97316', count: counts['HIGH'] || 0 },
    { label: 'Medium', color: '#D97706', count: counts['MEDIUM'] || 0 },
    { label: 'Low', color: '#2563EB', count: counts['LOW'] || 0 },
  ]
  const total = sevs.reduce((s, x) => s + x.count, 0) || 1
  const R = 38, CX = 50, CY = 50, STROKE = 9
  let cum = 0
  const arcs = sevs.filter(s => s.count > 0).map(s => {
    const frac = s.count / total
    const dashLen = 2 * Math.PI * R * frac
    const dashGap = 2 * Math.PI * R * (1 - frac)
    const offset = -2 * Math.PI * R * cum + 2 * Math.PI * R * 0.25
    cum += frac
    return { ...s, dashLen, dashGap, offset }
  })
  const realTotal = sevs.reduce((s, x) => s + x.count, 0)
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: 96, height: 96 }}>
        <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--color-cream2)" strokeWidth={STROKE} />
          {arcs.map((a, i) => (
            <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={a.color} strokeWidth={STROKE}
              strokeDasharray={`${a.dashLen} ${a.dashGap}`} strokeDashoffset={a.offset}
              style={{ transition: 'stroke-dasharray 0.8s ease, stroke-dashoffset 0.8s ease' }} />
          ))}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center flex-col">
          <span className="font-display text-xl font-bold" style={{ color: 'var(--color-ink)' }}>{realTotal}</span>
          <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>total</span>
        </div>
      </div>
      <div className="space-y-1.5 flex-1">
        {sevs.map(s => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
            <span style={{ color: 'var(--color-ink2)' }}>{s.label}</span>
            <span className="ml-auto mono font-semibold" style={{ color: 'var(--color-ink)' }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Latency Bars (light theme) ── */
function LatencyBars({ events }: { events: ScanEvent[] }) {
  const buckets = useMemo(() => {
    const b = { '<50ms': 0, '50–100ms': 0, '100–200ms': 0, '200–500ms': 0, '>500ms': 0 }
    events.forEach(ev => {
      if (ev.type !== 'probe') return
      const ms = ev.payload?.latency_ms || 0
      if (ms < 50) b['<50ms']++
      else if (ms < 100) b['50–100ms']++
      else if (ms < 200) b['100–200ms']++
      else if (ms < 500) b['200–500ms']++
      else b['>500ms']++
    })
    return b
  }, [events])
  const max = Math.max(...Object.values(buckets), 1)
  const colors = ['#5a8a1e', '#3d8bc9', '#5b44c4', '#b8860b', '#c4163a']
  return (
    <div className="space-y-2.5">
      {Object.entries(buckets).map(([label, count], i) => (
        <div key={label} className="flex items-center gap-3">
          <span className="mono text-[10px] w-16 text-right shrink-0" style={{ color: 'var(--color-muted)' }}>{label}</span>
          <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--color-cream2)' }}>
            <div className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${(count / max) * 100}%`, background: colors[i], opacity: 0.7, minWidth: count > 0 ? '4px' : 0 }} />
          </div>
          <span className="mono text-[10px] font-semibold w-6" style={{ color: 'var(--color-ink2)' }}>{count}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Request sparkline (light theme) ── */
function RequestSparkline({ events }: { events: ScanEvent[] }) {
  const data = useMemo(() => {
    const probes = events.filter(e => e.type === 'probe')
    if (probes.length < 2) return []
    const windowSize = Math.max(1, Math.floor(probes.length / 20))
    const buckets: number[] = []
    for (let i = 0; i < probes.length; i += windowSize) {
      buckets.push(Math.min(probes.length, i + windowSize) - i)
    }
    return buckets.slice(-24)
  }, [events])

  if (data.length < 2) return <div className="flex items-center justify-center h-14 text-[11px]" style={{ color: 'var(--color-muted)' }}>Waiting for requests…</div>
  const w = 200, h = 48, max = Math.max(...data, 1)
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - (v / max) * (h - 8) - 4])
  const linePath = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const area = `${linePath} L ${w} ${h} L 0 ${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: h }}>
      <defs>
        <linearGradient id="sparkArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a8a1e" stopOpacity="0.15" />
          <stop offset="1" stopColor="#5a8a1e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkArea)" />
      <path d={linePath} fill="none" stroke="#5a8a1e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      {pts.length > 0 && <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2.5" fill="#5a8a1e" opacity="0.7" />}
    </svg>
  )
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

      {/* Phase tracker */}
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

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] items-start lg:items-stretch">

        {/* ── Light Glass Log Panel ── */}
        <Panel glass className="overflow-hidden p-0 flex flex-col self-start lg:self-stretch" style={{ minHeight: 300 }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--color-hair)' }}>
            <h2 className="font-display text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-ink)' }}>
              <span className="live-dot" style={{ color: '#5a8a1e', fontSize: '9px' }}>●</span>
              Live event log
            </h2>
            <button onClick={() => setPaused(p => !p)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors hover:bg-ink/5"
              style={{ color: 'var(--color-muted)', border: '1px solid var(--color-hair)' }}>
              {paused ? <><Play size={12} /> Resume</> : <><Pause size={12} /> Pause</>}
            </button>
          </div>

          {/* Log body */}
          <div ref={logRef} className="scroll flex-1 overflow-auto" style={{ maxHeight: '70vh' }}>
            {s.events.length === 0 && (
              <p className="px-5 py-8 text-sm" style={{ color: 'var(--color-muted)' }}>Waiting for the first engine event…</p>
            )}
            {s.events.map((ev, i) => {
              const isPhase = ev.type === 'phase.started'
              const isFinding = ev.type === 'finding'
              const isComplete = ev.type === 'scan.completed'
              const isAborted = ev.type === 'scan.aborted'
              const dot = sevDot(ev)
              return (
                <div key={i}
                  className="flex items-start gap-3 px-5 transition-colors hover:bg-ink/[0.02]"
                  style={{
                    paddingTop: isPhase ? '10px' : '4px',
                    paddingBottom: isPhase ? '4px' : '4px',
                    borderBottom: '1px solid color-mix(in srgb, var(--color-hair) 50%, transparent)',
                  }}>
                  {/* Line number */}
                  <span className="mono w-7 shrink-0 text-right tabular-nums select-none" style={{ fontSize: '11px', color: 'var(--color-muted)', opacity: 0.45, paddingTop: '1px' }}>
                    {ev.seq}
                  </span>

                  {/* Dot indicator */}
                  <span className="shrink-0 mt-[6px]">
                    {dot ? (
                      <span className="block w-2 h-2 rounded-full" style={{ background: dot }} />
                    ) : isComplete ? (
                      <span className="block w-2 h-2 rounded-full" style={{ background: '#3a7a10' }} />
                    ) : isAborted ? (
                      <span className="block w-2 h-2 rounded-full" style={{ background: '#c4163a' }} />
                    ) : isPhase ? (
                      <span className="block w-1 h-1 rounded-full mt-0.5" style={{ background: 'var(--color-ink2)' }} />
                    ) : (
                      <span className="block w-1 h-1 rounded-full mt-0.5" style={{ background: 'var(--color-muted)', opacity: 0.4 }} />
                    )}
                  </span>

                  {/* Log text */}
                  <span
                    className="mono flex-1"
                    style={{
                      fontSize: isPhase ? '12px' : '12px',
                      lineHeight: '1.6',
                      color: COLOR[ev.type] || 'var(--color-ink2)',
                      fontWeight: isFinding || isComplete || isAborted || isPhase ? 600 : 400,
                      letterSpacing: isPhase ? '0.03em' : undefined,
                    }}>
                    {line(ev)}
                  </span>
                </div>
              )
            })}
          </div>
        </Panel>

        {/* ── Right Side ── */}
        <div className="space-y-5">
          {/* Counters */}
          <Panel className="p-5">
            <h2 className="font-display mb-4 text-sm font-bold">Counters</h2>
            <div className="grid grid-cols-2 gap-3 text-center">
              {[['Requests', s.counters.requests], ['Endpoints', s.counters.endpoints], ['Secured', s.counters.secured], ['Object', s.counters.objectBearing]].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-cream2 p-3">
                  <div className="font-display text-2xl font-bold">{v as number}</div>
                  <div className="text-[11px] text-muted">{k as string}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">{(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Severity[]).filter(x => sevCounts[x]).map(x => <span key={x} className="flex items-center gap-1.5 text-xs"><SeverityChip s={x} small /> {sevCounts[x]}</span>)}</div>
          </Panel>

          {/* Request Rate */}
          <Panel className="p-5">
            <h3 className="font-display text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: 'var(--color-muted)' }}>
              <Activity size={13} style={{ color: '#5a8a1e' }} /> Request rate
            </h3>
            <RequestSparkline events={s.events} />
          </Panel>

          {/* Severity Distribution */}
          <Panel className="p-5">
            <h3 className="font-display text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: 'var(--color-muted)' }}>
              <PieChart size={13} style={{ color: '#c4163a' }} /> Severity
            </h3>
            <SeverityDonut counts={sevCounts} />
          </Panel>

          {/* Latency */}
          <Panel className="p-5">
            <h3 className="font-display text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: 'var(--color-muted)' }}>
              <BarChart3 size={13} style={{ color: '#3d8bc9' }} /> Latency
            </h3>
            <LatencyBars events={s.events} />
          </Panel>

          {/* Findings */}
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
