import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useFetch } from '../hooks/useFetch'
import { Card, ConfidenceBadge, Empty, ErrorBox, inputCls, Loading, SEV_ORDER, SeverityBadge } from '../components/ui'

export default function Results() {
  const { scanId = '' } = useParams()
  const nav = useNavigate()
  const scan = useFetch(() => api.scan(scanId), [scanId])
  const fnd = useFetch(() => api.findings(scanId), [scanId])
  const sum = useFetch(() => api.summary(scanId), [scanId])
  const [f, setF] = useState({ sev: '', cls: '', conf: '', ep: '' })
  const [sort, setSort] = useState<'severity' | 'class'>('severity')
  const all = fnd.data ?? []

  const rows = useMemo(() => all.filter(x => (!f.sev || x.severity === f.sev) && (!f.cls || x.class === f.cls) && (!f.conf || x.confidence === f.conf) && (!f.ep || x.endpoint?.includes(f.ep)))
    .sort((a, b) => sort === 'class' ? a.class.localeCompare(b.class) : SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity)), [all, f, sort])
  const risky = useMemo(() => {
    const m = new Map<string, { n: number; w: number }>()
    all.forEach(x => { const k = x.endpoint ?? 'unknown'; const c = m.get(k) ?? { n: 0, w: 99 }; m.set(k, { n: c.n + 1, w: Math.min(c.w, SEV_ORDER.indexOf(x.severity)) }) })
    return [...m].sort((a, b) => a[1].w - b[1].w || b[1].n - a[1].n).slice(0, 5)
  }, [all])

  if (scan.error || fnd.error) return <ErrorBox msg={(scan.error || fnd.error)!} retry={() => { scan.reload(); fnd.reload(); sum.reload() }} />
  if (scan.loading || fnd.loading) return <Loading />
  const s = scan.data!
  const stats: [string, string | number][] = [['Endpoints scanned', sum.data?.total_endpoints ?? '—'], ['Requests made', s.requests_used], ['Findings', all.length],
    ['Duration', `${(s.duration_ms / 1000).toFixed(1)}s`], ['Risk score', s.risk_score]]
  const sel = (k: keyof typeof f, label: string, opts: string[]) => <select aria-label={label} className={inputCls + ' w-auto'} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })}>
    <option value="">{label}: all</option>{opts.map(o => <option key={o}>{o}</option>)}</select>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Results · scan #{scanId}</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">{stats.map(([k, v]) => <Card key={k} className="p-4"><p className="text-xs text-dim">{k}</p><p className="mt-1 font-mono text-2xl font-bold">{v}</p></Card>)}</div>
      <div className="flex flex-wrap gap-3">{SEV_ORDER.map(x => <span key={x} className="flex items-center gap-2 font-mono text-xs"><SeverityBadge s={x} />{all.filter(a => a.severity === x).length}</span>)}</div>

      <div className="grid gap-6 lg:grid-cols-[3fr_1fr]">
        <Card className="p-4"><div className="mb-4 flex flex-wrap gap-2">
          {sel('sev', 'Severity', SEV_ORDER)}{sel('cls', 'Class', [...new Set(all.map(a => a.class))])}{sel('conf', 'Confidence', ['VERIFIED', 'POTENTIAL'])}
          <input aria-label="Filter by endpoint" placeholder="Filter endpoint" className={inputCls + ' w-48'} value={f.ep} onChange={e => setF({ ...f, ep: e.target.value })} /></div>
          {rows.length === 0 ? <Empty title="No findings match" hint={all.length ? 'Clear a filter to see more.' : 'This scan completed without any findings.'} /> :
            <table className="w-full text-left text-sm"><thead className="text-xs text-dim"><tr>
              <th className="p-2"><button onClick={() => setSort('severity')}>Severity{sort === 'severity' && ' ↓'}</button></th>
              <th><button onClick={() => setSort('class')}>Class{sort === 'class' && ' ↓'}</button></th><th>Endpoint</th><th>Confidence</th><th>OWASP</th><th>Title</th></tr></thead>
              <tbody>{rows.map(r => <tr key={r.id} tabIndex={0} onClick={() => nav(`/finding/${r.id}`)} onKeyDown={e => e.key === 'Enter' && nav(`/finding/${r.id}`)}
                className="cursor-pointer border-t border-line hover:bg-white/5"><td className="p-2"><SeverityBadge s={r.severity} /></td>
                <td className="font-mono text-xs">{r.class}</td><td className="font-mono text-xs">{r.endpoint}</td><td><ConfidenceBadge c={r.confidence} /></td>
                <td className="font-mono text-xs">{r.owasp_id}</td><td>{r.title}</td></tr>)}</tbody></table>}</Card>
        <div className="space-y-4"><Card className="p-4"><h2 className="mb-3 text-sm font-bold">Riskiest endpoints</h2>
          {risky.length === 0 ? <p className="text-xs text-dim">No endpoints with findings.</p> : <ul className="space-y-2 font-mono text-xs">{risky.map(([ep, v]) => <li key={ep} className="flex justify-between gap-2"><span className="break-all">{ep}</span><span className="text-dim">{v.n}</span></li>)}</ul>}</Card>
          <Card className="p-4 font-mono text-xs leading-6"><h2 className="mb-2 font-sans text-sm font-bold">Scan metadata</h2>
            <p>status: {s.status}</p><p>target: #{s.target_id}</p><p>spec: #{s.spec_id}</p><p>started: {s.started_at}</p><p>finished: {s.finished_at ?? '—'}</p>
            <Link className="mt-2 block underline" to={`/scan/${scanId}/live`}>Replay event log</Link></Card></div>
      </div>
    </div>
  )
}
