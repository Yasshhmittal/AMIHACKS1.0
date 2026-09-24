import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, CircleAlert, FileJson, KeyRound, ShieldCheck, Upload, XCircle,
} from 'lucide-react'
import { api } from '../lib/api'
import { CHECK_DEFS } from '../lib/format'
import { Btn, Glass, Pill } from '../components/glass'
import type { Endpoint, Identity, SpecUpload, Target } from '../types'

const SANDBOX_IDS: Identity[] = [
  { label: 'anonymous', role: 'anonymous', user_id: '' },
  { label: 'userA', role: 'user', user_id: '1', credential: 'token-alice-12345' },
  { label: 'userB', role: 'user', user_id: '2', credential: 'token-bob-67890' },
  { label: 'admin', role: 'admin', user_id: '9', credential: 'token-admin-99999' },
]
const NOTE: Record<string, string> = { anonymous: 'No credentials', userA: 'Attacker (alice)', userB: 'Victim (bob)', admin: 'Privileged role' }

function StepHead({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className={`grid size-7 place-items-center rounded-full text-xs font-bold ${done ? 'bg-emerald/20 text-emerald' : 'bg-white/[.06] text-dim'}`}
        style={done ? { color: 'var(--color-emerald)', background: 'color-mix(in srgb, var(--color-emerald) 18%, transparent)' } : undefined}>
        {done ? <CheckCircle2 size={16} /> : n}
      </span>
      <h2 className="text-base font-bold">{title}</h2>
    </div>
  )
}

const inputCls = 'w-full rounded-xl bg-black/30 px-3 py-2 text-sm hair outline-none focus:border-[color:var(--color-teal)] placeholder:text-dim/60'

export default function NewScan() {
  const nav = useNavigate()
  const [url, setUrl] = useState('http://localhost:4000')
  const [target, setTarget] = useState<Target | null>(null)
  const [spec, setSpec] = useState<SpecUpload | null>(null)
  const [ids, setIds] = useState(SANDBOX_IDS)
  const [verified, setVerified] = useState<Record<string, boolean>>({})
  const [checks, setChecks] = useState<string[]>(CHECK_DEFS.map(c => c.id))
  const [attested, setAttested] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [drag, setDrag] = useState(false)

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name); setErr('')
    try { await fn() } catch (e: any) { setErr(e.message || String(e)) }
    setBusy('')
  }

  const createTarget = () => run('target', async () => { setTarget(await api.createTarget({ base_url: url, environment: 'sandbox', attested_by: 'demo' })); setSpec(null); setVerified({}) })
  const upload = (f?: File) => f && target && run('spec', async () => { setSpec(await api.uploadSpec(target.id, f)); setVerified({}) })
  const verify = () => target && run('verify', async () => {
    await api.setIdentities(target.id, ids)
    const r = await api.verify(target.id)
    setVerified(Object.fromEntries(r.results.map(x => [x.identity, x.ok])))
  })
  const setId = (i: number, k: 'role' | 'user_id' | 'credential', v: string) => { setIds(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x)); setVerified({}) }

  const allVerified = ids.every(i => verified[i.label])
  const ready = !!spec && allVerified && attested && checks.length > 0
  const start = () => target && spec && run('start', async () => {
    const s = await api.startScan({ target_id: target.id, spec_id: spec.spec_id, checks })
    nav(`/scan/${s.id}/live`)
  })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rise">
        <h1 className="text-3xl font-extrabold tracking-tight">New scan</h1>
        <p className="mt-1 max-w-2xl text-sm text-dim">Point SentinelAPI at an API you own, prove who each caller is, and it will test whether one user can reach another user’s data — with real HTTP evidence for every finding.</p>
      </div>

      {err && <div className="rise rounded-xl px-4 py-3 text-sm" style={{ border: '1px solid color-mix(in srgb, var(--color-sev-critical) 45%, transparent)', color: 'var(--color-sev-critical)', background: 'color-mix(in srgb, var(--color-sev-critical) 8%, transparent)' }}>{err}</div>}

      {/* 1. target */}
      <Glass className="rise p-6">
        <StepHead n={1} title="Target" done={!!target} />
        <label className="mb-1.5 block text-xs text-dim">Base URL <span className="text-faint">— where the API is reachable from the engine</span></label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input className={inputCls} value={url} onChange={e => { setUrl(e.target.value); setTarget(null) }} placeholder="http://localhost:4000" />
          <Btn onClick={createTarget} disabled={!url || busy === 'target'}>{target ? <><CheckCircle2 size={16} /> Target #{target.id}</> : (busy === 'target' ? 'Creating…' : 'Create target')}</Btn>
        </div>
        <p className="mt-2 text-xs text-dim">Sandbox runs locally at <Pill>http://localhost:4000</Pill> · in Docker use <Pill>http://sentinelshop:4000</Pill>. The engine refuses anything off the allowlist.</p>
      </Glass>

      {/* 2. spec */}
      <Glass className={`rise p-6 ${target ? '' : 'pointer-events-none opacity-40'}`}>
        <StepHead n={2} title="OpenAPI spec" done={!!spec} />
        <label onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files[0]) }}
          className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${drag ? 'border-[color:var(--color-teal)] bg-teal/5' : 'border-white/12 hover:border-white/25'}`}>
          <FileJson size={26} className="mb-2 text-teal/80" />
          <span className="font-semibold">{busy === 'spec' ? 'Parsing…' : 'Drop your OpenAPI spec here, or choose a file'}</span>
          <span className="mt-1 text-xs text-dim">.json or .yaml — e.g. sentinelshop/openapi.yaml</span>
          <input type="file" accept=".json,.yaml,.yml" className="sr-only" onChange={e => upload(e.target.files?.[0])} />
        </label>
        {spec && (
          <div className="mt-4 rise">
            <div className="mb-3 flex flex-wrap gap-2 text-sm">
              <Pill>{spec.endpoint_count} endpoints</Pill><Pill>{spec.secured_count} secured</Pill>
              <Pill>{spec.object_bearing_count} object-bearing</Pill><Pill>{spec.admin_count} admin</Pill>
            </div>
            <ul className="scroll max-h-52 divide-y divide-white/5 overflow-auto rounded-xl bg-black/20 hair">
              {spec.endpoints.map((e: Endpoint) => (
                <li key={e.id} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                  <span className="mono w-14 font-bold" style={{ color: 'var(--color-teal)' }}>{e.method}</span>
                  <span className="mono flex-1">{e.path}</span>
                  {e.spec_secured && <Pill tone="dim">secured</Pill>}
                  {e.object_bearing && <Pill tone="dim">object</Pill>}
                  {e.admin_scoped && <Pill tone="dim">admin</Pill>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Glass>

      {/* 3. identities */}
      <Glass className={`rise p-6 ${spec ? '' : 'pointer-events-none opacity-40'}`}>
        <StepHead n={3} title="Identities" done={allVerified && Object.keys(verified).length > 0} />
        <p className="mb-4 flex items-center gap-2 text-xs text-dim"><KeyRound size={14} /> The scanner logs in as each identity and compares what each can reach. Credentials are encrypted server-side and never shown again.</p>
        <div className="space-y-2.5">
          {ids.map((i, n) => {
            const state = i.label in verified ? verified[i.label] : null
            return (
              <div key={i.label} className="grid grid-cols-[8.5rem_1fr] items-center gap-3 sm:grid-cols-[8.5rem_5rem_5rem_1fr_6rem]">
                <div><p className="mono text-sm font-bold">{i.label}</p><p className="text-[11px] text-dim">{NOTE[i.label]}</p></div>
                <input aria-label={`${i.label} role`} className={`${inputCls} hidden sm:block`} value={i.role} disabled={i.label === 'anonymous'} onChange={e => setId(n, 'role', e.target.value)} />
                <input aria-label={`${i.label} user id`} className={`${inputCls} hidden sm:block`} placeholder="id" value={i.user_id} disabled={i.label === 'anonymous'} onChange={e => setId(n, 'user_id', e.target.value)} />
                <input aria-label={`${i.label} credential`} type="password" className={inputCls} placeholder={i.label === 'anonymous' ? 'none' : 'token or password'} value={i.credential ?? ''} disabled={i.label === 'anonymous'} onChange={e => setId(n, 'credential', e.target.value)} />
                <span className="flex items-center justify-end gap-1.5 text-xs font-semibold">
                  {state === null ? <span className="text-dim">unchecked</span>
                    : state ? <span className="flex items-center gap-1" style={{ color: 'var(--color-emerald)' }}><CheckCircle2 size={14} /> valid</span>
                      : <span className="flex items-center gap-1" style={{ color: 'var(--color-sev-critical)' }}><XCircle size={14} /> failed</span>}
                </span>
              </div>
            )
          })}
        </div>
        <Btn variant="ghost" className="mt-4" onClick={verify} disabled={busy === 'verify'}><ShieldCheck size={15} /> {busy === 'verify' ? 'Verifying…' : 'Verify credentials'}</Btn>
      </Glass>

      {/* 4. checks */}
      <Glass className={`rise p-6 ${spec ? '' : 'pointer-events-none opacity-40'}`}>
        <StepHead n={4} title="Checks" />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {CHECK_DEFS.map(c => {
            const on = checks.includes(c.id)
            return (
              <label key={c.id} className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-colors ${on ? 'bg-teal/5 border-[color:var(--color-teal)]/40' : 'bg-white/[.02]'} hair`}>
                <input type="checkbox" className="mt-0.5 accent-[color:var(--color-teal)]" checked={on} onChange={() => setChecks(p => on ? p.filter(x => x !== c.id) : [...p, c.id])} />
                <span><span className="flex items-center gap-2 text-sm font-semibold">{c.label} <span className="mono text-[10px] text-dim">{c.owasp}</span></span><span className="text-xs text-dim">{c.help}</span></span>
              </label>
            )
          })}
        </div>
      </Glass>

      {/* 5. attestation + start */}
      <Glass className="rise p-6" style={{ boxShadow: ready ? '0 0 0 1px rgba(45,212,191,.4), 0 0 40px -14px rgba(45,212,191,.5)' : undefined }}>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 accent-[color:var(--color-teal)]" checked={attested} onChange={e => setAttested(e.target.checked)} />
          <span><span className="flex items-center gap-2 text-sm font-semibold"><CircleAlert size={15} className="text-teal" /> I am authorized to test this target</span>
            <span className="text-xs text-dim">By checking this box you confirm you have explicit permission to scan this target.</span></span>
        </label>
        <div className="mt-5 flex items-center gap-4">
          <Btn onClick={start} disabled={!ready || busy === 'start'} className="px-6">{busy === 'start' ? 'Starting…' : 'Start scan →'}</Btn>
          {!ready && <p className="text-xs text-dim">Needs a parsed spec, all identities verified, at least one check, and your authorization.</p>}
        </div>
      </Glass>
    </div>
  )
}
