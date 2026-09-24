import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useScanStream } from '../hooks/useScanStream'
import { Btn, Card, Empty, SeverityBadge, ConfidenceBadge, SEV_ORDER } from '../components/ui'
import { PHASES } from '../utils/checks'

const TONE: Record<string, string> = { finding: 'text-sev-high', candidate: 'text-sev-medium', 'scan.completed': 'text-emerald-400', 'phase.started': 'text-ink font-bold' }
const line = (t: string, p: any) => t === 'probe' ? `${p.label ?? ''} ${p.identity} ${p.endpoint} → ${p.status} (${p.latency_ms}ms)` : t === 'finding' ? `${p.severity} ${p.class} ${p.endpoint}: ${p.title}` : t === 'phase.started' ? p.phase : JSON.stringify(p)

export default function LiveScan() {
  const { scanId = '' } = useParams()
  const { events, transport } = useScanStream(scanId)
  const [paused, setPaused] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!paused) end.current?.scrollIntoView({ block: 'end' }) }, [events.length, paused])

  const d = useMemo(() => {
    const probes = events.filter(e => e.type === 'probe')
    const phases = events.filter(e => e.type === 'phase.started').map(e => e.payload.phase as string)
    const done = events.find(e => e.type === 'scan.completed')?.payload
    const recent = probes.slice(-20)
    const bad = recent.filter(e => e.payload.status >= 500 || e.payload.status === 0).length
    return {
      probes: probes.length, done, findings: events.filter(e => e.type === 'finding').map(e => e.payload),
      total: events.find(e => e.type === 'spec.parsed')?.payload.endpoint_count as number | undefined,
      tested: new Set(probes.map(e => e.payload.endpoint)).size, cur: phases.at(-1),
      tripped: recent.length >= 10 && bad / recent.length > 0.3,
    }
  }, [events])
  const idx = d.done ? PHASES.length : PHASES.indexOf(d.cur === 'SCORE+EMIT' ? 'SCORE' : d.cur ?? '')

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between"><div><h1 className="text-2xl font-extrabold tracking-tight">Live scan #{scanId}</h1>
        <p className="mt-1 text-sm text-dim">Every line below is a real event from the scan engine ({transport === 'idle' ? 'connecting…' : transport}).</p></div>
        {d.done && <Link to={`/scan/${scanId}/results`}><Btn>View results</Btn></Link>}</div>
      {d.tripped && <p role="alert" className="rounded-lg border border-sev-high/60 bg-sev-high/10 p-3 text-sm text-sev-high">Circuit breaker warning: more than 30% of recent requests are failing. The target may be struggling or the scan may abort.</p>}

      <Card className="flex flex-wrap gap-2 p-4">{PHASES.map((p, i) => <span key={p} className={`rounded px-3 py-1 font-mono text-xs ${i < idx ? 'text-emerald-400' : i === idx ? 'bg-white/10 font-bold' : 'text-dim'}`}>
        {i < idx ? '✓' : i === idx ? '●' : '○'} {p}</span>)}</Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[['Requests sent', d.probes], ['Endpoints tested', `${d.tested}${d.total ? ` / ${d.total}` : ''}`], ['Findings', d.findings.length],
          ['Status', d.done ? 'Completed' : 'Running']].map(([k, v]) => <Card key={k as string} className="p-4"><p className="text-xs text-dim">{k}</p><p className="mt-1 font-mono text-2xl font-bold">{v}</p></Card>)}
      </div>
      <div className="flex flex-wrap gap-2">{SEV_ORDER.map(s => <span key={s} className="flex items-center gap-2 font-mono text-xs"><SeverityBadge s={s} />{d.findings.filter(f => f.severity === s).length}</span>)}</div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-0"><div className="flex items-center justify-between border-b border-line px-4 py-2"><h2 className="text-sm font-bold">Event log</h2>
          <Btn variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => setPaused(p => !p)}>{paused ? 'Resume scroll' : 'Pause scroll'}</Btn></div>
          <div className="h-96 overflow-auto p-4 font-mono text-xs leading-6" role="log">
            {events.length === 0 ? <Empty title="Waiting for the first event" hint="The scan engine hasn't reported anything yet." /> :
              events.map(e => <div key={e.seq} className={TONE[e.type] ?? 'text-dim'}><span className="text-dim">{e.t ? new Date(e.t).toLocaleTimeString() : `#${e.seq}`}</span> {e.type} {line(e.type, e.payload)}</div>)}
            <div ref={end} /></div></Card>
        <Card className="p-4"><h2 className="mb-3 text-sm font-bold">Findings so far</h2>
          {d.findings.length === 0 ? <Empty title="No findings yet" hint="Findings appear here as soon as they're confirmed." /> :
            <ul className="space-y-2">{d.findings.map(f => <li key={f.id}><Link to={`/finding/${f.id}`} className="block rounded-lg border border-line p-3 hover:bg-white/5">
              <div className="flex gap-2"><SeverityBadge s={f.severity} /><ConfidenceBadge c={f.confidence} /></div>
              <p className="mt-2 text-sm font-semibold">{f.title}</p><p className="font-mono text-xs text-dim">{f.endpoint} · {f.class}</p></Link></li>)}</ul>}</Card>
      </div>
    </div>
  )
}
