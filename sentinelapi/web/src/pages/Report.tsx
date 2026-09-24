import { useParams } from 'react-router-dom'
import { Download, Printer } from 'lucide-react'
import { api } from '../lib/api'
import { useFetch } from '../hooks/useFetch'
import { Btn, ErrorBox, Glass, Loading, SeverityChip } from '../components/glass'
import { SeverityBar } from '../components/charts'
import { fmtMs, OWASP_LABEL, sevRank } from '../lib/format'

export default function Report() {
  const { scanId = '' } = useParams()
  const scanQ = useFetch(() => api.scan(scanId), [scanId])
  const findQ = useFetch(() => api.findings(scanId), [scanId])
  const sumQ = useFetch(() => api.summary(scanId), [scanId])

  const findings = (findQ.data || []).slice().sort((a, b) => sevRank[a.severity] - sevRank[b.severity])
  const counts: Record<string, number> = {}
  findings.forEach(f => { counts[f.severity] = (counts[f.severity] || 0) + 1 })

  const download = async (kind: 'json' | 'sarif') => {
    const res = await fetch(`/api/scans/${scanId}/report`, { headers: { Accept: kind === 'sarif' ? 'application/sarif+json' : 'application/json' } })
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `sentinel-scan-${scanId}.${kind === 'sarif' ? 'sarif' : 'json'}`
    a.click(); URL.revokeObjectURL(a.href)
  }

  if (scanQ.error) return <ErrorBox msg={scanQ.error} retry={scanQ.reload} />
  const scan = scanQ.data

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Report</h1>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => window.print()}><Printer size={15} /> Print / PDF</Btn>
          <Btn variant="ghost" onClick={() => download('json')}><Download size={15} /> JSON</Btn>
          <Btn variant="ghost" onClick={() => download('sarif')}><Download size={15} /> SARIF</Btn>
        </div>
      </div>

      <Glass className="space-y-6 p-8 print:shadow-none">
        <header className="flex items-start justify-between border-b border-white/10 pb-5">
          <div>
            <h2 className="text-2xl font-extrabold">SentinelAPI Security Report</h2>
            <p className="mono mt-1 text-sm text-dim">Scan #{scanId} · {scan?.finished_at ? new Date(scan.finished_at).toLocaleString() : '—'}</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-extrabold" style={{ color: 'var(--color-teal)' }}>{Math.round(scan?.risk_score || 0)}</div>
            <div className="text-xs text-dim">overall risk</div>
          </div>
        </header>

        <section>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-dim">Executive summary</h3>
          {sumQ.loading ? <Loading rows={2} /> : <p className="text-sm leading-7">{sumQ.data?.text}</p>}
          <div className="mt-4 grid gap-6 sm:grid-cols-[1fr_1.2fr]">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-dim">Endpoints</p><p className="text-lg font-bold">{sumQ.data?.total_endpoints ?? '—'}</p></div>
              <div><p className="text-dim">Requests</p><p className="text-lg font-bold">{scan?.requests_used ?? '—'}</p></div>
              <div><p className="text-dim">Findings</p><p className="text-lg font-bold">{findings.length}</p></div>
              <div><p className="text-dim">Duration</p><p className="text-lg font-bold">{fmtMs(scan?.duration_ms)}</p></div>
            </div>
            <div><SeverityBar counts={counts} /></div>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-dim">Findings</h3>
          {findQ.loading ? <Loading rows={4} /> : (
            <div className="space-y-4">
              {findings.map(f => (
                <div key={f.id} className="rounded-xl border border-white/10 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <SeverityChip s={f.severity} small />
                    <span className="text-sm font-bold">{f.title}</span>
                    <span className="mono ml-auto text-xs text-dim">{f.owasp_id} · {OWASP_LABEL[f.class] || f.class}</span>
                  </div>
                  <p className="mono mb-1 text-xs" style={{ color: 'var(--color-teal)' }}>{f.endpoint}</p>
                  <p className="text-sm text-ink/85">{f.impact}</p>
                  <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                    <p><span className="text-dim">Expected: </span>{f.expected}</p>
                    <p><span className="text-dim">Actual: </span>{f.actual}</p>
                  </div>
                  <p className="mt-2 text-xs"><span className="text-dim">Fix: </span>{f.remediation}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="border-t border-white/10 pt-4 text-center text-xs text-dim">
          Generated by SentinelAPI · AI explains, the scanner executes, evidence verifies.
        </footer>
      </Glass>
    </div>
  )
}
