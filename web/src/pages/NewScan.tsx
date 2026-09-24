import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { Btn, Card, Field, inputCls } from '../components/ui'
import { CHECKS } from '../utils/checks'
import type { Endpoint, Identity, Target } from '../types'

const IDS: Identity[] = [
  { label: 'anonymous', role: 'anonymous', user_id: '' },
  { label: 'userA', role: 'user', user_id: '1', credential: '' },
  { label: 'userB', role: 'user', user_id: '2', credential: '' },
  { label: 'admin', role: 'admin', user_id: '9', credential: '' },
]
const NOTE: Record<string, string> = { anonymous: 'No credentials', userA: 'Attacker (alice)', userB: 'Victim (bob)', admin: 'Admin role' }

export default function NewScan() {
  const nav = useNavigate()
  const [url, setUrl] = useState('http://sentinelshop:4000')
  const [target, setTarget] = useState<Target | null>(null)
  const [eps, setEps] = useState<Endpoint[] | null>(null)
  const [ids, setIds] = useState(IDS)
  const [verified, setVerified] = useState<Record<string, boolean>>({})
  const [checks, setChecks] = useState<string[]>(CHECKS.map(c => c.id))
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const run = async (name: string, fn: () => Promise<void>) => { setBusy(name); setErr(''); try { await fn() } catch (e: any) { setErr(e.message) } setBusy('') }

  const createTarget = () => run('target', async () => setTarget(await api.createTarget({ base_url: url, environment: 'sandbox' })))
  const upload = (f?: File) => f && target && run('spec', async () => setEps((await api.uploadSpec(target.id, f)).endpoints))
  const verify = () => target && run('verify', async () => {
    await api.setIdentities(target.id, ids)
    const r = await api.verify(target.id)
    setVerified(Object.fromEntries(r.results.map(x => [x.identity, x.ok])))
  })
  const allVerified = ids.every(i => verified[i.label])
  const ready = !!eps && allVerified && ok && checks.length > 0
  const start = () => target && run('start', async () => nav(`/scan/${(await api.startScan({ target_id: target.id, checks })).scan_id}/live`))
  const setId = (i: number, k: 'role' | 'user_id' | 'credential', v: string) => { setIds(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x)); setVerified({}) }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold tracking-tight">New scan</h1>
        <p className="mt-1 text-sm text-dim">Point SentinelAPI at an API you own, prove who you are, and it will test whether one user can reach another user's data.</p></div>
      {err && <p role="alert" className="rounded-lg border border-sev-critical/50 p-3 font-mono text-xs text-sev-critical">{err}</p>}

      <Card className="space-y-4 p-6"><h2 className="font-bold">1. Target</h2>
        <Field label="Base URL" help="Where the API is running. The sandbox address is pre-filled."><input className={inputCls} value={url} onChange={e => { setUrl(e.target.value); setTarget(null) }} /></Field>
        <Btn onClick={createTarget} disabled={!url || busy === 'target'}>{target ? `Target #${target.id} ready` : 'Create target'}</Btn></Card>

      <Card className={`space-y-4 p-6 ${target ? '' : 'pointer-events-none opacity-40'}`}><h2 className="font-bold">2. OpenAPI spec</h2>
        <label onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); upload(e.dataTransfer.files[0]) }}
          className="flex cursor-pointer flex-col items-center rounded-lg border border-dashed border-line p-8 text-center hover:border-dim">
          <span className="font-semibold">{busy === 'spec' ? 'Parsing…' : 'Drop a spec here or choose a file'}</span>
          <span className="mt-1 text-xs text-dim">.json or .yaml. The spec tells the scanner which endpoints exist and which should require login.</span>
          <input type="file" accept=".json,.yaml,.yml" className="sr-only" onChange={e => upload(e.target.files?.[0])} /></label>
        {eps && <>
          <p className="font-mono text-sm" role="status">{eps.length} endpoints · {eps.filter(e => e.spec_secured).length} secured · {eps.filter(e => e.object_bearing).length} object-bearing</p>
          <ul className="max-h-48 divide-y divide-line overflow-auto rounded-lg border border-line font-mono text-xs">
            {eps.map(e => <li key={e.id} className="flex gap-3 px-3 py-1.5"><span className="w-14 font-bold">{e.method}</span>{e.path}</li>)}</ul></>}</Card>

      <Card className={`space-y-4 p-6 ${eps ? '' : 'pointer-events-none opacity-40'}`}><h2 className="font-bold">3. Identities</h2>
        <p className="text-xs text-dim">The scanner logs in as each identity and compares what each can reach. Credentials are sent to the backend and never shown again.</p>
        <div className="grid gap-3">{ids.map((i, n) => <div key={i.label} className="grid grid-cols-[9rem_1fr_1fr_1.5fr_5rem] items-center gap-3">
          <div><p className="font-mono text-sm font-bold">{i.label}</p><p className="text-xs text-dim">{NOTE[i.label]}</p></div>
          <input aria-label={`${i.label} role`} className={inputCls} value={i.role} disabled={i.label === 'anonymous'} onChange={e => setId(n, 'role', e.target.value)} />
          <input aria-label={`${i.label} user id`} className={inputCls} placeholder="user id" value={i.user_id} disabled={i.label === 'anonymous'} onChange={e => setId(n, 'user_id', e.target.value)} />
          <input aria-label={`${i.label} credential`} type="password" className={inputCls} placeholder={i.label === 'anonymous' ? 'none' : 'token or password'} value={i.credential ?? ''} disabled={i.label === 'anonymous'} onChange={e => setId(n, 'credential', e.target.value)} />
          <span className={`font-mono text-xs font-bold ${i.label in verified ? (verified[i.label] ? 'text-emerald-400' : 'text-sev-critical') : 'text-dim'}`}>{i.label in verified ? (verified[i.label] ? '✓ VALID' : '✕ FAILED') : 'unchecked'}</span></div>)}</div>
        <Btn variant="ghost" onClick={verify} disabled={busy === 'verify'}>{busy === 'verify' ? 'Verifying…' : 'Verify credentials'}</Btn></Card>

      <Card className="space-y-3 p-6"><h2 className="font-bold">4. Checks</h2>
        <div className="grid gap-2 md:grid-cols-2">{CHECKS.map(c => <label key={c.id} className="flex gap-3 rounded-lg border border-line p-3">
          <input type="checkbox" checked={checks.includes(c.id)} onChange={() => setChecks(p => p.includes(c.id) ? p.filter(x => x !== c.id) : [...p, c.id])} />
          <span><span className="block text-sm font-semibold">{c.label}</span><span className="text-xs text-dim">{c.help}</span></span></label>)}</div></Card>

      <Card className="space-y-4 p-6"><label className="flex gap-3"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} />
        <span><span className="block text-sm font-semibold">I am authorized to test this target</span>
          <span className="text-xs text-dim">By checking this box, you confirm you have explicit permission to scan this target.</span></span></label>
        <Btn onClick={start} disabled={!ready || busy === 'start'}>Start scan</Btn>
        {!ready && <p className="text-xs text-dim">Needs: a parsed spec, all identities verified, at least one check, and your authorization.</p>}</Card>
    </div>
  )
}
