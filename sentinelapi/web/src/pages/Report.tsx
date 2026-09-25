import { useParams } from 'react-router-dom'
import { Download, Printer } from 'lucide-react'
import { api } from '../lib/api'
import { useFetch } from '../hooks/useFetch'
import { Panel, ErrorBox, Loading, SeverityChip } from '../components/ui'
import { SeverityBar } from '../components/charts'
import { fmtMs, OWASP_LABEL, sevRank } from '../lib/format'

export default function Report() {
  const { scanId = '' } = useParams()
  const scanQ = useFetch(() => api.scan(scanId), [scanId])
  const findQ = useFetch(() => api.findings(scanId), [scanId])
  const sumQ = useFetch(() => api.summary(scanId), [scanId])
  const findings = (findQ.data || []).slice().sort((a, b) => sevRank[a.severity] - sevRank[b.severity])
  const counts: Record<string, number> = {}; findings.forEach(f => { counts[f.severity] = (counts[f.severity] || 0) + 1 })

  const download = async (kind: 'json' | 'sarif') => {
    const res = await fetch(`/api/scans/${scanId}/report`, { headers: { Accept: kind === 'sarif' ? 'application/sarif+json' : 'application/json' } })
    const blob = await res.blob(); const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `sentinel-scan-${scanId}.${kind === 'sarif' ? 'sarif' : 'json'}`; a.click(); URL.revokeObjectURL(a.href)
  }
  if (scanQ.error) return <ErrorBox msg={scanQ.error} retry={scanQ.reload} />
  const scan = scanQ.data

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-bold tracking-tight">Report</h1>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full border border-hair bg-paper px-4 py-2 text-sm font-semibold hover:bg-cream2"><Printer size={15} /> Print / PDF</button>
          <button onClick={() => download('json')} className="inline-flex items-center gap-2 rounded-full border border-hair bg-paper px-4 py-2 text-sm font-semibold hover:bg-cream2"><Download size={15} /> JSON</button>
          <button onClick={() => download('sarif')} className="inline-flex items-center gap-2 rounded-full border border-hair bg-paper px-4 py-2 text-sm font-semibold hover:bg-cream2"><Download size={15} /> SARIF</button>
        </div>
      </div>

      <Panel className="space-y-6 p-8">
        <header className="flex items-start justify-between border-b border-hair pb-5">
          <div><h2 className="font-display text-2xl font-bold">SentinelAPI Security Report</h2><p className="mono mt-1 text-sm text-muted">Scan #{scanId} · {scan?.finished_at ? new Date(scan.finished_at).toLocaleString() : '—'}</p></div>
          <div className="text-right"><div className="font-display text-4xl font-bold text-ink">{Math.round(scan?.risk_score || 0)}</div><div className="text-xs text-muted">overall risk</div></div>
        </header>
        <section>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Executive summary</h3>
          {sumQ.loading ? <Loading rows={2} /> : <p className="text-sm leading-7">{sumQ.data?.text}</p>}
          <div className="mt-4 grid gap-6 sm:grid-cols-[1fr_1.2fr]">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted">Endpoints</p><p className="text-lg font-bold">{sumQ.data?.total_endpoints ?? '—'}</p></div>
              <div><p className="text-muted">Requests</p><p className="text-lg font-bold">{scan?.requests_used ?? '—'}</p></div>
              <div><p className="text-muted">Findings</p><p className="text-lg font-bold">{findings.length}</p></div>
              <div><p className="text-muted">Duration</p><p className="text-lg font-bold">{fmtMs(scan?.duration_ms)}</p></div>
            </div>
            <div><SeverityBar counts={counts} /></div>
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Findings</h3>
          {findQ.loading ? <Loading rows={4} /> : <div className="space-y-4">{findings.map(f => (
            <div key={f.id} className="rounded-xl border border-hair p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2"><SeverityChip s={f.severity} small /><span className="text-sm font-bold">{f.title}</span><span className="mono ml-auto text-xs text-muted">{f.owasp_id} · {OWASP_LABEL[f.class] || f.class}</span></div>
              <p className="mono mb-1 text-xs text-ink">{f.endpoint}</p>
              <p className="text-sm text-ink2">{f.impact}</p>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2"><p><span className="text-muted">Expected: </span>{f.expected}</p><p><span className="text-muted">Actual: </span>{f.actual}</p></div>
              <p className="mt-2 text-xs"><span className="text-muted">Fix: </span>{f.remediation}</p>
            </div>
          ))}</div>}
        </section>
        <footer className="border-t border-hair pt-4 text-center text-xs text-muted">Generated by SentinelAPI · AI explains, the scanner executes, evidence verifies.</footer>
      </Panel>
    </div>
  )
}
