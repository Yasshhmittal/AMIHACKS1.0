import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useFetch } from '../hooks/useFetch'
import { Btn, Card, Code, ConfidenceBadge, Empty, ErrorBox, Loading, SeverityBadge } from '../components/ui'
import type { Probe } from '../types'

const OWNER = /user_?id|owner|account_?id/i
// Pretty-print JSON and mark the owner field so the ownership mismatch is visible at a glance
const Json = ({ v }: { v: unknown }) => <Code>{JSON.stringify(v, null, 2)?.split('\n').map((l, i) =>
  <div key={i} className={OWNER.test(l) ? 'bg-sev-critical/20 text-sev-critical' : ''}>{l}</div>)}</Code>

function ProbeRow({ p }: { p: Probe }) {
  const [open, setOpen] = useState(false)
  const rq = p.request_json_redacted, rs = p.response_json_redacted
  return <li className="border-t border-line first:border-0">
    <button className="flex w-full items-center gap-4 px-4 py-3 text-left font-mono text-xs hover:bg-white/5" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="w-8 font-bold">{p.label}</span><span className="w-20 text-dim">{p.identity}</span>
      <span className="flex-1 truncate">{rq.method} {rq.url}</span><span className="font-bold">{p.status}</span><span className="text-dim">{p.latency_ms}ms</span></button>
    {open && <div className="grid gap-3 px-4 pb-4 md:grid-cols-2"><div><p className="mb-1 text-xs text-dim">Request</p><Json v={rq} /></div><div><p className="mb-1 text-xs text-dim">Response</p><Json v={rs} /></div></div>}</li>
}

export default function FindingDetail() {
  const { findingId = '' } = useParams()
  const { data: f, error, loading, reload, setData } = useFetch(() => api.finding(findingId), [findingId])
  const poc = useFetch(() => api.poc(Number(findingId)), [findingId])
  const [tab, setTab] = useState<'curl' | 'httpie' | 'python'>('curl')
  const [copied, setCopied] = useState(false)
  const [verdict, setVerdict] = useState('')
  const [ai, setAi] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  if (error) return <ErrorBox msg={error} retry={reload} />
  if (loading || !f) return <Loading rows={6} />
  const applied = f.score_factors.filter(x => x.applied)
  const total = applied.reduce((n, x) => n + x.weight, 0)
  const base = f.probes?.find(p => p.label === 'P1'), atk = f.probes?.find(p => p.label === 'P2')
  const act = (name: string, fn: () => Promise<void>) => async () => { setBusy(name); setErr(''); try { await fn() } catch (e: any) { setErr(e.message) } setBusy('') }
  const reverify = async () => { const r = await api.reverify(f.id); setVerdict(r.status === 'fixed' ? 'FIXED ✓' : 'Still vulnerable'); if (r.status === 'fixed') setData({ ...f, state: 'fixed' }) }
  const snippet = poc.data?.[tab]

  return (
    <div className="space-y-6">
      <Link to={`/scan/${f.scan_id}/results`} className="text-sm text-dim hover:text-ink">← Back to results</Link>
      <header className="space-y-3"><div className="flex flex-wrap items-center gap-2"><SeverityBadge s={f.severity} /><ConfidenceBadge c={f.confidence} />
        <span className="font-mono text-xs text-dim">{f.owasp_id} · {f.class}</span>{f.state === 'fixed' && <span className="font-mono text-xs font-bold text-emerald-400">FIXED</span>}</div>
        <h1 className="text-3xl font-extrabold tracking-tight">{f.title}</h1>
        {f.endpoint && <p className="font-mono text-sm">{f.endpoint}</p>}<p className="max-w-3xl text-dim">{f.impact}</p></header>

      <div className="flex flex-wrap items-center gap-3">
        <Btn onClick={act('explain', async () => { const r = await api.explain(f.id); setAi(r.explanation_md ?? r.ai_explanation_md ?? '') })} disabled={!!busy}>Explain</Btn>
        <Btn variant="ghost" onClick={act('verify', reverify)} disabled={!!busy}>Re-verify</Btn>
        <Btn variant="ghost" disabled={!!busy} onClick={act('fix', async () => { await api.applyFix(f.vuln_id ?? f.fingerprint); await reverify() })}>Apply fix (sandbox)</Btn>
        {busy && <span className="text-xs text-dim" role="status">Running {busy}…</span>}
        {verdict && <span role="status" className={`font-mono text-sm font-bold ${verdict.startsWith('FIXED') ? 'text-emerald-400' : 'text-sev-critical'}`}>{verdict}</span>}
      </div>
      {err && <p role="alert" className="font-mono text-xs text-sev-critical">{err}</p>}
      {(ai ?? f.ai_explanation_md) && <Card className="whitespace-pre-wrap p-5 text-sm leading-7">{ai ?? f.ai_explanation_md}</Card>}

      <Card className="p-6"><h2 className="mb-4 font-bold">Why this severity</h2>
        {applied.length === 0 ? <Empty title="No scoring factors recorded" hint="The backend returned no applied factors for this finding." /> :
          <div className="space-y-1.5 font-mono text-sm">{f.score_factors.map((x, i) => <div key={i} className={`flex justify-between ${x.applied ? '' : 'text-dim line-through'}`}>
            <span>{x.applied ? '✓' : '○'} {x.description}</span><span>{x.weight > 0 ? '+' : ''}{x.weight}</span></div>)}
            <div className="mt-3 flex justify-between border-t border-line pt-3 font-bold"><span>Total</span><span>{total} → {f.severity}</span></div></div>}</Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-5"><p className="mb-1 text-xs text-dim">Expected behavior</p><p className="text-sm">{f.expected}</p></Card>
        <Card className="border-sev-critical/40 p-5"><p className="mb-1 text-xs text-dim">Actual behavior</p><p className="text-sm">{f.actual}</p></Card></div>

      <Card className="p-6"><h2 className="mb-4 font-bold">Evidence: baseline vs attack</h2>
        {base && atk ? <div className="grid gap-4 md:grid-cols-2">
          <div><p className="mb-1 font-mono text-xs text-dim">{base.label} · {base.identity} · {base.status}</p><Json v={base.response_json_redacted.body} /></div>
          <div><p className="mb-1 font-mono text-xs text-dim">{atk.label} · {atk.identity} · {atk.status}</p><Json v={atk.response_json_redacted.body} /></div></div>
          : <Empty title="No baseline/attack pair" hint="This finding class doesn't include P1 and P2 probes." />}</Card>

      <Card className="p-0"><h2 className="border-b border-line px-6 py-4 font-bold">Controls checked</h2>
        {f.probes?.length ? <ul>{f.probes.map(p => <ProbeRow key={p.id} p={p} />)}</ul> : <Empty title="No probes recorded" hint="Probe evidence appears here when the scan stores it." />}</Card>

      <Card className="p-6"><div className="mb-3 flex items-center justify-between"><div className="flex gap-2">
        {(['curl', 'httpie', 'python'] as const).map(t => <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className={`rounded px-3 py-1 font-mono text-xs ${tab === t ? 'bg-white/10 font-bold' : 'text-dim'}`}>{t}</button>)}</div>
        <Btn variant="ghost" className="!py-1 text-xs" disabled={!snippet} onClick={() => { navigator.clipboard.writeText(snippet!); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'Copied' : 'Copy PoC'}</Btn></div>
        {poc.loading ? <Loading rows={2} /> : poc.error ? <ErrorBox msg={poc.error} retry={poc.reload} /> : <Code>{snippet ?? 'No snippet for this format.'}</Code>}</Card>

      <Card className="p-6"><h2 className="mb-3 font-bold">Remediation</h2><p className="whitespace-pre-wrap text-sm leading-7">{f.remediation}</p></Card>
    </div>
  )
}
