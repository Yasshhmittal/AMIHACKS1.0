import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpRight, ListFilter } from 'lucide-react'
import { api } from '../lib/api'
import { useFetch } from '../hooks/useFetch'
import { Glass, Loading, ErrorBox, Empty, SeverityChip, ConfidenceBadge, StatTile, Pill } from '../components/glass'
import { RiskGauge, SeverityBar } from '../components/charts'
import { AuthGraph } from '../components/AuthGraph'
import { fmtMs, OWASP_LABEL, sevRank, SEVERITIES } from '../lib/format'
import type { Finding, Severity } from '../types'

export default function Results() {
  const { scanId = '' } = useParams()
  const scanQ = useFetch(() => api.scan(scanId), [scanId])
  const findQ = useFetch(() => api.findings(scanId), [scanId])
  const sumQ = useFetch(() => api.summary(scanId), [scanId])
  const [sevFilter, setSevFilter] = useState<Severity | 'ALL'>('ALL')

  const findings = findQ.data || []
  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    findings.forEach(f => { m[f.severity] = (m[f.severity] || 0) + 1 })
    return m
  }, [findings])

  const riskiest = useMemo(() => {
    const by: Record<string, { ep: string; n: number; worst: number }> = {}
    findings.forEach(f => {
      const k = f.endpoint || f.class
      by[k] = by[k] || { ep: k, n: 0, worst: 9 }
      by[k].n++; by[k].worst = Math.min(by[k].worst, sevRank[f.severity])
    })
    return Object.values(by).sort((a, b) => a.worst - b.worst || b.n - a.n).slice(0, 5)
  }, [findings])

  const shown = sevFilter === 'ALL' ? findings : findings.filter(f => f.severity === sevFilter)
  shown.slice().sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.risk_score - a.risk_score)

  if (scanQ.error) return <ErrorBox msg={scanQ.error} retry={scanQ.reload} />
  const scan = scanQ.data

  return (
    <div className="space-y-6">
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Results</h1>
          <p className="mt-1 text-sm text-dim">Every number here comes from a real scan — nothing is hardcoded.</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/scan/${scanId}/matrix`} className="rounded-xl bg-white/5 px-4 py-2 text-sm font-semibold hair hover:bg-white/10">Access matrix</Link>
          <Link to={`/scan/${scanId}/report`} className="rounded-xl bg-white/5 px-4 py-2 text-sm font-semibold hair hover:bg-white/10">Report</Link>
        </div>
      </div>

      {/* top row: gauge + stats + severity */}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Glass className="rise flex flex-col items-center justify-center p-6">
          {scan ? <RiskGauge value={scan.risk_score || 0} /> : <Loading rows={1} />}
          <div className="mt-3 text-center text-xs text-dim">Highest single-finding risk on this scan</div>
        </Glass>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Findings" value={findings.length} accent="var(--color-teal)" />
            <StatTile label="Endpoints" value={sumQ.data?.total_endpoints ?? '—'} />
            <StatTile label="Requests" value={scan?.requests_used ?? '—'} />
            <StatTile label="Duration" value={fmtMs(scan?.duration_ms)} />
          </div>
          <Glass className="rise p-5">
            <h2 className="mb-3 text-sm font-bold">Severity distribution</h2>
            <SeverityBar counts={counts} />
          </Glass>
        </div>
      </div>

      {/* authorization graph + summary */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Glass className="rise p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-bold">Authorization graph</h2>
            <span className="text-xs text-dim">identities → resources</span>
          </div>
          <p className="mb-2 text-xs text-dim">Each red path is a boundary the engine proved could be crossed. Click the matrix for the full grid.</p>
          {findings.length ? <AuthGraph findings={findings} /> : <Empty title="No violations to graph" hint="When the engine proves a boundary crossing, it appears here as an attack path." />}
        </Glass>

        <Glass className="rise p-5">
          <h2 className="mb-3 text-sm font-bold">Executive summary</h2>
          {sumQ.loading ? <Loading rows={3} /> : sumQ.error ? <ErrorBox msg={sumQ.error} retry={sumQ.reload} />
            : <>
              <p className="text-sm leading-6 text-ink/90">{sumQ.data?.text}</p>
              <p className="mt-3 text-xs text-dim">Source: {sumQ.data?.provider === 'groq' ? 'Groq LLM' : 'deterministic template'}</p>
            </>}
        </Glass>
      </div>

      {/* riskiest endpoints */}
      {riskiest.length > 0 && (
        <Glass className="rise p-5">
          <h2 className="mb-3 text-sm font-bold">Riskiest endpoints</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {riskiest.map(r => (
              <div key={r.ep} className="flex items-center justify-between rounded-xl bg-white/[.03] px-3 py-2 hair">
                <span className="mono truncate text-xs">{r.ep}</span>
                <SeverityChip s={SEVERITIES[r.worst] as Severity} small />
              </div>
            ))}
          </div>
        </Glass>
      )}

      {/* findings table */}
      <Glass className="rise overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold"><ListFilter size={15} /> Findings</h2>
          <div className="flex flex-wrap gap-1.5">
            {(['ALL', ...SEVERITIES] as const).map(s => (
              <button key={s} onClick={() => setSevFilter(s as any)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${sevFilter === s ? 'bg-white/12 text-ink' : 'text-dim hover:text-ink'}`}>
                {s === 'ALL' ? 'All' : s[0] + s.slice(1).toLowerCase()}{s !== 'ALL' && counts[s] ? ` (${counts[s]})` : ''}
              </button>
            ))}
          </div>
        </div>
        {findQ.loading ? <div className="p-5"><Loading rows={5} /></div>
          : findQ.error ? <div className="p-5"><ErrorBox msg={findQ.error} retry={findQ.reload} /></div>
            : shown.length === 0 ? <div className="p-5"><Empty title="No findings" hint="Nothing matched this filter." /></div>
              : <div className="scroll overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-dim">
                    <tr className="border-b border-white/8">
                      <th className="px-5 py-2.5 font-medium">Severity</th>
                      <th className="px-3 py-2.5 font-medium">Class</th>
                      <th className="px-3 py-2.5 font-medium">Endpoint</th>
                      <th className="px-3 py-2.5 font-medium">Confidence</th>
                      <th className="px-3 py-2.5 font-medium">OWASP</th>
                      <th className="px-5 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((f: Finding) => (
                      <tr key={f.id} className="group border-b border-white/5 transition-colors hover:bg-white/[.03]">
                        <td className="px-5 py-3"><SeverityChip s={f.severity} small /></td>
                        <td className="px-3 py-3"><span className="mono text-xs">{f.class}</span>{f.state === 'fixed' && <span className="ml-2 text-[10px] font-bold" style={{ color: 'var(--color-emerald)' }}>FIXED</span>}</td>
                        <td className="px-3 py-3"><span className="mono text-xs">{f.endpoint}</span></td>
                        <td className="px-3 py-3"><ConfidenceBadge c={f.confidence} /></td>
                        <td className="px-3 py-3"><Pill tone="dim">{f.owasp_id}</Pill></td>
                        <td className="px-5 py-3 text-right">
                          <Link to={`/finding/${f.id}`} className="inline-flex items-center gap-1 text-xs font-semibold opacity-0 transition-opacity group-hover:opacity-100" style={{ color: 'var(--color-teal)' }}>
                            Open <ArrowUpRight size={13} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
      </Glass>

      <p className="pb-6 text-center text-xs text-dim">Click any finding to see the six-probe proof, the owner-field evidence, and the reproducible PoC.</p>
    </div>
  )
}
