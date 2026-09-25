import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpRight, ListFilter } from 'lucide-react'
import { api } from '../lib/api'
import { useFetch } from '../hooks/useFetch'
import { Panel, Loading, ErrorBox, Empty, SeverityChip, ConfidenceBadge, StatTile, Pill } from '../components/ui'
import { RiskGauge, SeverityBar } from '../components/charts'
import { AuthGraph } from '../components/AuthGraph'
import { Reveal } from '../components/motion'
import { fmtMs, sevRank, SEVERITIES } from '../lib/format'
import type { Finding, Severity } from '../types'

export default function Results() {
  const { scanId = '' } = useParams()
  const scanQ = useFetch(() => api.scan(scanId), [scanId])
  const findQ = useFetch(() => api.findings(scanId), [scanId])
  const sumQ = useFetch(() => api.summary(scanId), [scanId])
  const [sev, setSev] = useState<Severity | 'ALL'>('ALL')

  const findings = findQ.data || []
  const counts = useMemo(() => { const m: Record<string, number> = {}; findings.forEach(f => { m[f.severity] = (m[f.severity] || 0) + 1 }); return m }, [findings])
  const riskiest = useMemo(() => {
    const by: Record<string, { ep: string; n: number; worst: number }> = {}
    findings.forEach(f => { const k = f.endpoint || f.class; by[k] = by[k] || { ep: k, n: 0, worst: 9 }; by[k].n++; by[k].worst = Math.min(by[k].worst, sevRank[f.severity]) })
    return Object.values(by).sort((a, b) => a.worst - b.worst || b.n - a.n).slice(0, 6)
  }, [findings])
  const shown = (sev === 'ALL' ? findings : findings.filter(f => f.severity === sev)).slice().sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.risk_score - a.risk_score)

  if (scanQ.error) return <ErrorBox msg={scanQ.error} retry={scanQ.reload} />
  const scan = scanQ.data

  return (
    <div className="space-y-6">
      <Reveal><div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="font-display text-4xl font-bold tracking-tight">Results</h1><p className="mt-1 text-sm text-ink2">Every number here comes from a real scan — nothing is hardcoded.</p></div>
        <div className="flex gap-2">
          <Link to={`/scan/${scanId}/matrix`} className="rounded-full border border-hair bg-paper px-4 py-2 text-sm font-semibold hover:bg-cream2">Access matrix</Link>
          <Link to={`/scan/${scanId}/report`} className="rounded-full border border-hair bg-paper px-4 py-2 text-sm font-semibold hover:bg-cream2">Report</Link>
        </div>
      </div></Reveal>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Reveal><Panel className="flex h-full flex-col items-center justify-center p-6">{scan ? <RiskGauge value={scan.risk_score || 0} /> : <Loading rows={1} />}<div className="mt-3 text-center text-xs text-muted">Highest single-finding risk</div></Panel></Reveal>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Findings" value={findings.length} accent="var(--color-ink)" />
            <StatTile label="Endpoints" value={sumQ.data?.total_endpoints ?? '—'} />
            <StatTile label="Requests" value={scan?.requests_used ?? '—'} />
            <StatTile label="Duration" value={fmtMs(scan?.duration_ms)} />
          </div>
          <Reveal><Panel className="p-5"><h2 className="font-display mb-3 text-sm font-bold">Severity distribution</h2><SeverityBar counts={counts} /></Panel></Reveal>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Reveal><Panel className="p-5">
          <div className="mb-1 flex items-center justify-between"><h2 className="font-display text-sm font-bold">Authorization graph</h2><span className="text-xs text-muted">identities → resources</span></div>
          <p className="mb-2 text-xs text-muted">Each red path is a boundary the engine proved could be crossed.</p>
          {findings.length ? <AuthGraph findings={findings} /> : <Empty title="No violations to graph" hint="Proven boundary crossings appear here as attack paths." />}
        </Panel></Reveal>
        <Reveal delay={0.05}><Panel className="p-5">
          <h2 className="font-display mb-3 text-sm font-bold">Executive summary</h2>
          {sumQ.loading ? <Loading rows={3} /> : sumQ.error ? <ErrorBox msg={sumQ.error} retry={sumQ.reload} /> : <><p className="text-sm leading-6 text-ink2">{sumQ.data?.text}</p><p className="mt-3 text-xs text-muted">Source: {sumQ.data?.provider === 'groq' ? 'Groq LLM' : 'deterministic template'}</p></>}
        </Panel></Reveal>
      </div>

      {riskiest.length > 0 && <Reveal><Panel className="p-5">
        <h2 className="font-display mb-3 text-sm font-bold">Riskiest endpoints</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{riskiest.map(r => <div key={r.ep} className="flex items-center justify-between rounded-xl border border-hair bg-paper px-3 py-2"><span className="mono truncate text-xs">{r.ep}</span><SeverityChip s={SEVERITIES[r.worst] as Severity} small /></div>)}</div>
      </Panel></Reveal>}

      <Reveal><Panel className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-5 py-3">
          <h2 className="font-display flex items-center gap-2 text-sm font-bold"><ListFilter size={15} /> Findings</h2>
          <div className="flex flex-wrap gap-1.5">{(['ALL', ...SEVERITIES] as const).map(x => <button key={x} onClick={() => setSev(x as any)} className={`chip rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${sev === x ? 'bg-ink text-cream' : 'text-muted hover:text-ink'}`}>{x === 'ALL' ? 'All' : x[0] + x.slice(1).toLowerCase()}{x !== 'ALL' && counts[x] ? ` (${counts[x]})` : ''}</button>)}</div>
        </div>
        {findQ.loading ? <div className="p-5"><Loading rows={5} /></div> : findQ.error ? <div className="p-5"><ErrorBox msg={findQ.error} retry={findQ.reload} /></div> : shown.length === 0 ? <div className="p-5"><Empty title="No findings" hint="Nothing matched this filter." /></div>
          : <div className="scroll overflow-auto"><table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr className="border-b border-hair"><th className="px-5 py-2.5 font-medium">Severity</th><th className="px-3 py-2.5 font-medium">Class</th><th className="px-3 py-2.5 font-medium">Endpoint</th><th className="px-3 py-2.5 font-medium">Confidence</th><th className="px-3 py-2.5 font-medium">OWASP</th><th /></tr></thead>
            <tbody>{shown.map((f: Finding) => (
              <tr key={f.id} className="group border-b border-hair transition-colors hover:bg-cream2/60">
                <td className="px-5 py-3"><SeverityChip s={f.severity} small /></td>
                <td className="px-3 py-3"><span className="mono text-xs">{f.class}</span>{f.state === 'fixed' && <span className="ml-2 text-[10px] font-bold text-lime2">FIXED</span>}</td>
                <td className="px-3 py-3"><span className="mono text-xs">{f.endpoint}</span></td>
                <td className="px-3 py-3"><ConfidenceBadge c={f.confidence} /></td>
                <td className="px-3 py-3"><Pill tone="muted">{f.owasp_id}</Pill></td>
                <td className="px-5 py-3 text-right"><Link to={`/finding/${f.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-ink opacity-0 transition-opacity group-hover:opacity-100">Open <ArrowUpRight size={13} /></Link></td>
              </tr>
            ))}</tbody>
          </table></div>}
      </Panel></Reveal>
    </div>
  )
}
