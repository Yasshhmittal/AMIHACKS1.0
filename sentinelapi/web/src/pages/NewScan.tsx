import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, CircleAlert, FileJson, KeyRound, ShieldCheck, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import { CHECK_DEFS } from '../lib/format'
import { Panel, Pill } from '../components/ui'
import { Reveal } from '../components/motion'
import type { Endpoint, Identity, SpecUpload, Target } from '../types'

const SANDBOX_IDS: Identity[] = [
  { label: 'anonymous', role: 'anonymous', user_id: '' },
  { label: 'userA', role: 'user', user_id: '1', credential: 'token-alice-12345' },
  { label: 'userB', role: 'user', user_id: '2', credential: 'token-bob-67890' },
  { label: 'admin', role: 'admin', user_id: '9', credential: 'token-admin-99999' },
]
const NOTE: Record<string, string> = { anonymous: 'No credentials', userA: 'Attacker (alice)', userB: 'Victim (bob)', admin: 'Privileged role' }
const input = 'w-full rounded-xl bg-paper px-3 py-2 text-sm hair outline-none focus:border-ink placeholder:text-muted/60'

function Head({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="grid size-7 place-items-center rounded-full text-xs font-bold" style={done ? { background: 'color-mix(in srgb,var(--color-lime) 30%,transparent)', color: '#3f5f00' } : { background: 'var(--color-cream2)', color: 'var(--color-ink2)' }}>{done ? <CheckCircle2 size={16} /> : n}</span>
      <h2 className="font-display text-base font-bold">{title}</h2>
    </div>
  )
}

export default function NewScan() {
  const nav = useNavigate()
  const [url, setUrl] = useState('http://sentinelshop:4000')
  const [target, setTarget] = useState<Target | null>(null)
  const [spec, setSpec] = useState<SpecUpload | null>(null)
  const [ids, setIds] = useState(SANDBOX_IDS)
  const [verified, setVerified] = useState<Record<string, boolean>>({})
  const [checks, setChecks] = useState<string[]>(CHECK_DEFS.map(c => c.id))
  const [attested, setAttested] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [drag, setDrag] = useState(false)

  const run = async (name: string, fn: () => Promise<void>) => { setBusy(name); setErr(''); try { await fn() } catch (e: any) { setErr(e.message || String(e)) } setBusy('') }
  const createTarget = () => run('target', async () => { setTarget(await api.createTarget({ base_url: url, environment: 'sandbox', attested_by: 'demo' })); setSpec(null); setVerified({}) })
  const upload = (f?: File) => f && target && run('spec', async () => { setSpec(await api.uploadSpec(target.id, f)); setVerified({}) })
  const verify = () => target && run('verify', async () => { await api.setIdentities(target.id, ids); const r = await api.verify(target.id); setVerified(Object.fromEntries(r.results.map(x => [x.identity, x.ok]))) })
  const setId = (i: number, k: 'role' | 'user_id' | 'credential', v: string) => { setIds(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x)); setVerified({}) }
  const allVerified = ids.every(i => verified[i.label])
  const ready = !!spec && allVerified && attested && checks.length > 0
  const start = () => target && spec && run('start', async () => { const s = await api.startScan({ target_id: target.id, spec_id: spec.spec_id, checks }); nav(`/scan/${s.id}/live`) })

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Reveal>
        <h1 className="font-display text-4xl font-bold tracking-tight">New scan</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink2">Point SentinelAPI at an API you own, prove who each caller is, and it will test whether one user can reach another user’s data — with real HTTP evidence for every finding.</p>
      </Reveal>

      {err && <div className="rounded-xl px-4 py-3 text-sm" style={{ border: '1px solid color-mix(in srgb,var(--color-sev-critical) 40%,transparent)', color: 'var(--color-sev-critical)', background: 'color-mix(in srgb,var(--color-sev-critical) 6%,transparent)' }}>{err}</div>}

      <Reveal><Panel className="p-6">
        <Head n={1} title="Target" done={!!target} />
        <label className="mb-1.5 block text-xs text-muted">Base URL — where the API is reachable from the engine</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input className={input} value={url} onChange={e => { setUrl(e.target.value); setTarget(null) }} />
          <button onClick={createTarget} disabled={!url || busy === 'target'} className="lime-btn shrink-0 rounded-full px-5 py-2.5 text-sm disabled:opacity-40">{target ? `Target #${target.id} ✓` : busy === 'target' ? 'Creating…' : 'Create target'}</button>
        </div>
        <p className="mt-2 text-xs text-muted">Docker: <Pill tone="muted">http://sentinelshop:4000</Pill> · local uvicorn: <Pill tone="muted">http://localhost:4000</Pill>. The engine refuses anything off the allowlist.</p>
      </Panel></Reveal>

      <Reveal><Panel className={`p-6 ${target ? '' : 'pointer-events-none opacity-40'}`}>
        <Head n={2} title="OpenAPI spec" done={!!spec} />
        <label onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files[0]) }}
          className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${drag ? 'border-ink bg-lime/10' : 'border-hair hover:border-ink2'}`}>
          <FileJson size={26} className="mb-2 text-ink2" />
          <span className="font-semibold">{busy === 'spec' ? 'Parsing…' : 'Drop your OpenAPI spec here, or choose a file'}</span>
          <span className="mt-1 text-xs text-muted">.json or .yaml — e.g. sentinelshop/openapi.yaml</span>
          <input type="file" accept=".json,.yaml,.yml" className="sr-only" onChange={e => upload(e.target.files?.[0])} />
        </label>
        {spec && <div className="mt-4">
          <div className="mb-3 flex flex-wrap gap-2 text-sm"><Pill>{spec.endpoint_count} endpoints</Pill><Pill tone="muted">{spec.secured_count} secured</Pill><Pill tone="muted">{spec.object_bearing_count} object-bearing</Pill><Pill tone="muted">{spec.admin_count} admin</Pill></div>
          <ul className="scroll max-h-52 divide-y divide-hair overflow-auto rounded-xl border border-hair bg-paper">
            {spec.endpoints.map((e: Endpoint) => <li key={e.id} className="flex items-center gap-3 px-3 py-1.5 text-xs"><span className="mono w-14 font-bold text-ink">{e.method}</span><span className="mono flex-1">{e.path}</span>{e.spec_secured && <Pill tone="muted">secured</Pill>}{e.object_bearing && <Pill tone="muted">object</Pill>}</li>)}
          </ul>
        </div>}
      </Panel></Reveal>

      <Reveal><Panel className={`p-6 ${spec ? '' : 'pointer-events-none opacity-40'}`}>
        <Head n={3} title="Identities" done={allVerified && Object.keys(verified).length > 0} />
        <p className="mb-4 flex items-center gap-2 text-xs text-muted"><KeyRound size={14} /> The scanner logs in as each identity and compares what each can reach. Credentials are encrypted server-side and never shown again.</p>
        <div className="space-y-2.5">
          {ids.map((i, n) => {
            const st = i.label in verified ? verified[i.label] : null
            return (
              <div key={i.label} className="grid grid-cols-[8.5rem_1fr] items-center gap-3 sm:grid-cols-[8.5rem_5rem_5rem_1fr_6rem]">
                <div><p className="mono text-sm font-bold">{i.label}</p><p className="text-[11px] text-muted">{NOTE[i.label]}</p></div>
                <input aria-label={`${i.label} role`} className={`${input} hidden sm:block`} value={i.role} disabled={i.label === 'anonymous'} onChange={e => setId(n, 'role', e.target.value)} />
                <input aria-label={`${i.label} id`} className={`${input} hidden sm:block`} placeholder="id" value={i.user_id} disabled={i.label === 'anonymous'} onChange={e => setId(n, 'user_id', e.target.value)} />
                <input aria-label={`${i.label} credential`} type="password" className={input} placeholder={i.label === 'anonymous' ? 'none' : 'token or password'} value={i.credential ?? ''} disabled={i.label === 'anonymous'} onChange={e => setId(n, 'credential', e.target.value)} />
                <span className="flex items-center justify-end gap-1.5 text-xs font-semibold">
                  {st === null ? <span className="text-muted">unchecked</span> : st ? <span className="flex items-center gap-1 text-lime2"><CheckCircle2 size={14} /> valid</span> : <span className="flex items-center gap-1" style={{ color: 'var(--color-sev-critical)' }}><XCircle size={14} /> failed</span>}
                </span>
              </div>
            )
          })}
        </div>
        <button onClick={verify} disabled={busy === 'verify'} className="mt-4 inline-flex items-center gap-2 rounded-full border border-hair bg-paper px-5 py-2.5 text-sm font-semibold hover:bg-cream2"><ShieldCheck size={15} /> {busy === 'verify' ? 'Verifying…' : 'Verify credentials'}</button>
      </Panel></Reveal>

      <Reveal><Panel className={`p-6 ${spec ? '' : 'pointer-events-none opacity-40'}`}>
        <Head n={4} title="Checks" />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {CHECK_DEFS.map(c => { const on = checks.includes(c.id); return (
            <label key={c.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${on ? 'border-lime2/60 bg-lime/10' : 'border-hair bg-paper'}`}>
              <input type="checkbox" className="mt-0.5 accent-ink" checked={on} onChange={() => setChecks(p => on ? p.filter(x => x !== c.id) : [...p, c.id])} />
              <span><span className="flex items-center gap-2 text-sm font-semibold">{c.label} <span className="mono text-[10px] text-muted">{c.owasp}</span></span><span className="text-xs text-muted">{c.help}</span></span>
            </label>
          )})}
        </div>
      </Panel></Reveal>

      <Reveal><Panel className="p-6" style={ready ? { boxShadow: '0 0 0 2px color-mix(in srgb,var(--color-lime2) 55%,transparent)' } : undefined}>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 accent-ink" checked={attested} onChange={e => setAttested(e.target.checked)} />
          <span><span className="flex items-center gap-2 text-sm font-semibold"><CircleAlert size={15} /> I am authorized to test this target</span><span className="text-xs text-muted">By checking this box you confirm you have explicit permission to scan this target.</span></span>
        </label>
        <div className="mt-5 flex items-center gap-4">
          <button onClick={start} disabled={!ready || busy === 'start'} className="lime-btn rounded-full px-7 py-3 text-sm font-semibold disabled:opacity-40">{busy === 'start' ? 'Starting…' : 'Start scan →'}</button>
          {!ready && <p className="text-xs text-muted">Needs a parsed spec, all identities verified, one check, and your authorization.</p>}
        </div>
      </Panel></Reveal>
    </div>
  )
}
