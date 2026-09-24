import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Check, Copy, RefreshCw, Sparkles, Wrench,
} from 'lucide-react'
import { api } from '../lib/api'
import { useFetch } from '../hooks/useFetch'
import { Btn, Code, ConfidenceBadge, Empty, ErrorBox, Glass, Loading, SeverityChip } from '../components/glass'
import { OWASP_LABEL, statusColor } from '../lib/format'
import type { Probe } from '../types'

const OWNER_RE = /user_?id|owner|account_?id/i

function JsonView({ v }: { v: unknown }) {
  const text = JSON.stringify(v, null, 2) || ''
  return (
    <Code>
      {text.split('\n').map((l, i) => (
        <div key={i} style={OWNER_RE.test(l) ? { background: 'color-mix(in srgb, var(--color-sev-critical) 20%, transparent)', color: 'var(--color-sev-critical)', borderRadius: 4 } : undefined}>{l}</div>
      ))}
    </Code>
  )
}

function ProbeRow({ p }: { p: Probe }) {
  const [open, setOpen] = useState(false)
  const rq = p.request_json_redacted, rs = p.response_json_redacted
  return (
    <li className="border-t border-white/6 first:border-0">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="flex w-full items-center gap-4 px-4 py-3 text-left text-xs transition-colors hover:bg-white/[.03]">
        <span className="mono w-8 font-bold" style={{ color: 'var(--color-teal)' }}>{p.label}</span>
        <span className="mono w-20 text-dim">{p.identity}</span>
        <span className="mono flex-1 truncate">{rq.method} {rq.url}</span>
        <span className="mono font-bold" style={{ color: statusColor(p.status) }}>{p.status}</span>
        <span className="mono text-dim">{p.latency_ms ?? '—'}ms</span>
      </button>
      {open && (
        <div className="grid gap-3 px-4 pb-4 md:grid-cols-2">
          <div><p className="mb-1 text-[11px] text-dim">Request</p><JsonView v={rq} /></div>
          <div><p className="mb-1 text-[11px] text-dim">Response</p><JsonView v={rs.body} /></div>
        </div>
      )}
    </li>
  )
}

export default function FindingDetail() {
  const { findingId = '' } = useParams()
  const { data: f, error, loading, reload, setData } = useFetch(() => api.finding(findingId), [findingId])
  const poc = useFetch(() => api.poc(findingId), [findingId])
  const [tab, setTab] = useState<'curl' | 'httpie' | 'python'>('curl')
  const [copied, setCopied] = useState(false)
  const [ai, setAi] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<{ fixed: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  if (error) return <ErrorBox msg={error} retry={reload} />
  if (loading || !f) return <div className="space-y-4"><Loading rows={2} /><Loading rows={6} /></div>

  const applied = f.score_factors.filter(x => x.applied)
  const total = applied.reduce((n, x) => n + x.weight, 0)
  const p1 = f.probes?.find(p => p.label === 'P1')
  const p2 = f.probes?.find(p => p.label === 'P2')
  const snippet = poc.data ? (poc.data as any)[tab] as string : ''

  const act = (name: string, fn: () => Promise<void>) => async () => {
    setBusy(name); setErr('')
    try { await fn() } catch (e: any) { setErr(e.message || String(e)) }
    setBusy('')
  }
  const reverify = async () => {
    const r = await api.reverify(f.id)
    setVerdict({ fixed: r.status === 'fixed', text: r.detail })
    if (r.status === 'fixed') setData({ ...f, state: 'fixed' })
    else setData({ ...f, state: 'open' })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to={`/scan/${f.scan_id}/results`} className="rise inline-flex items-center gap-1.5 text-sm text-dim transition-colors hover:text-ink"><ArrowLeft size={15} /> Back to results</Link>

      {/* header */}
      <Glass className="rise p-6" style={{ boxShadow: `0 0 0 1px color-mix(in srgb, var(--color-sev-${f.severity.toLowerCase()}) 30%, transparent), 0 30px 80px -50px #000` }}>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip s={f.severity} /><ConfidenceBadge c={f.confidence} />
          <span className="mono text-xs text-dim">{f.owasp_id} · {OWASP_LABEL[f.class] || f.class}</span>
          {f.state === 'fixed' && <span className="mono text-xs font-bold" style={{ color: 'var(--color-emerald)' }}>✓ FIXED</span>}
        </div>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{f.title}</h1>
        {f.endpoint && <p className="mono mt-1 text-sm" style={{ color: 'var(--color-teal)' }}>{f.endpoint}</p>}
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/85">{f.impact}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Btn onClick={act('explain', async () => { const r = await api.explain(f.id); setAi(r.explanation_md) })} disabled={!!busy}><Sparkles size={15} /> Explain</Btn>
          <Btn variant="ghost" onClick={act('verify', reverify)} disabled={!!busy}><RefreshCw size={15} className={busy === 'verify' ? 'animate-spin' : ''} /> Re-verify</Btn>
          {f.vuln_id && <Btn variant="ghost" onClick={act('fix', async () => { await api.applyFix(f.vuln_id!); await reverify() })} disabled={!!busy}><Wrench size={15} /> Apply fix (sandbox)</Btn>}
          {busy && <span className="text-xs text-dim" role="status">Running {busy}…</span>}
          {verdict && <span className="mono text-sm font-bold" style={{ color: verdict.fixed ? 'var(--color-emerald)' : 'var(--color-sev-critical)' }}>{verdict.fixed ? 'FIXED ✓' : 'Still vulnerable'}</span>}
        </div>
        {verdict && <p className="mono mt-2 text-xs text-dim">{verdict.text}</p>}
        {err && <p className="mono mt-2 text-xs" style={{ color: 'var(--color-sev-critical)' }}>{err}</p>}
      </Glass>

      {(ai ?? f.ai_explanation_md) && (
        <Glass className="rise whitespace-pre-wrap p-5 text-sm leading-7">{ai ?? f.ai_explanation_md}</Glass>
      )}

      {/* why this severity */}
      <Glass className="rise p-6">
        <h2 className="mb-4 text-sm font-bold">Why this severity</h2>
        {applied.length === 0 ? <Empty title="No scoring factors recorded" />
          : <div className="mono space-y-1.5 text-sm">
            {f.score_factors.map((x, i) => (
              <div key={i} className={`flex justify-between ${x.applied ? '' : 'text-dim/50 line-through'}`}>
                <span>{x.applied ? '✓' : '○'} {x.description}</span>
                <span style={x.applied ? { color: x.weight < 0 ? 'var(--color-sev-critical)' : 'var(--color-emerald)' } : undefined}>{x.weight > 0 ? '+' : ''}{x.weight}</span>
              </div>
            ))}
            <div className="mt-3 flex justify-between border-t border-white/10 pt-3 font-bold">
              <span>Total</span><span>{total} → {f.severity}</span>
            </div>
          </div>}
      </Glass>

      {/* expected vs actual */}
      <div className="grid gap-4 md:grid-cols-2">
        <Glass soft className="rise p-5"><p className="mb-1 text-[11px] text-dim">Expected behaviour</p><p className="text-sm">{f.expected}</p></Glass>
        <Glass soft className="rise p-5" style={{ borderColor: 'color-mix(in srgb, var(--color-sev-critical) 40%, transparent)' }}><p className="mb-1 text-[11px] text-dim">Actual behaviour</p><p className="text-sm">{f.actual}</p></Glass>
      </div>

      {/* evidence baseline vs attack */}
      <Glass className="rise p-6">
        <h2 className="mb-1 text-sm font-bold">Evidence: baseline vs attack</h2>
        <p className="mb-4 text-xs text-dim">The owner field is highlighted — in the attack response it resolves to the victim, which is the proof.</p>
        {p1 && p2 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div><p className="mono mb-1 text-[11px] text-dim">{p1.label} · {p1.identity} · {p1.status} (victim’s own request)</p><JsonView v={p1.response_json_redacted.body} /></div>
            <div><p className="mono mb-1 text-[11px] text-dim">{p2.label} · {p2.identity} · {p2.status} (attacker on victim’s object)</p><JsonView v={p2.response_json_redacted.body} /></div>
          </div>
        ) : <Empty title="No baseline/attack pair" hint="This finding class doesn’t use the P1/P2 probe structure." />}
      </Glass>

      {/* controls checklist */}
      <Glass className="rise overflow-hidden p-0">
        <h2 className="border-b border-white/8 px-6 py-4 text-sm font-bold">Controls checked <span className="font-normal text-dim">— four of six exist to prove us wrong</span></h2>
        {f.probes?.length ? <ul>{f.probes.map(p => <ProbeRow key={p.id} p={p} />)}</ul>
          : <div className="p-5"><Empty title="No probes recorded" /></div>}
      </Glass>

      {/* PoC */}
      <Glass className="rise p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex gap-1.5">
            {(['curl', 'httpie', 'python'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
                className={`mono rounded-lg px-3 py-1 text-xs ${tab === t ? 'bg-white/12 font-bold' : 'text-dim hover:text-ink'}`}>{t}</button>
            ))}
          </div>
          <Btn variant="ghost" className="!py-1 text-xs" disabled={!snippet}
            onClick={() => { navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy PoC</>}
          </Btn>
        </div>
        {poc.loading ? <Loading rows={2} /> : poc.error ? <ErrorBox msg={poc.error} retry={poc.reload} /> : <Code>{snippet || 'No snippet.'}</Code>}
      </Glass>

      {/* remediation */}
      <Glass className="rise p-6">
        <h2 className="mb-3 text-sm font-bold">Remediation</h2>
        <p className="whitespace-pre-wrap text-sm leading-7 text-ink/90">{f.remediation}</p>
      </Glass>
    </div>
  )
}
