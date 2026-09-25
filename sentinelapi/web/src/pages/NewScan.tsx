import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, CircleAlert, Eye, EyeOff, FileJson, KeyRound, Plus, ShieldCheck, Trash2, UserPlus, XCircle } from 'lucide-react'
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

/* ── Password Input with Eye Toggle ── */
function PasswordInput({ value, onChange, disabled, placeholder, ariaLabel }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string; ariaLabel?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative w-full">
      <input
        aria-label={ariaLabel}
        type={visible ? 'text' : 'password'}
        className={input}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        style={{ paddingRight: disabled ? undefined : '40px' }}
      />
      {!disabled && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible(v => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors hover:bg-ink/5"
          style={{ color: 'var(--color-muted)' }}
          title={visible ? 'Hide credential' : 'Show credential'}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      )}
    </div>
  )
}

/* ── Identity Card ── */
function IdentityCard({ identity, note, index, verified, onUpdate, onRemove, isCustom, baseUrl }: {
  identity: Identity; note?: string; index: number; verified: boolean | null; onUpdate: (k: keyof Identity, v: any) => void; onRemove?: () => void; isCustom?: boolean; baseUrl?: string
}) {
  const isAnon = identity.label === 'anonymous'
  const credType = identity.credential_type || 'bearer'
  const roleColors: Record<string, { bg: string; text: string; border: string }> = {
    anonymous: { bg: 'rgba(107,113,120,0.08)', text: '#6B7178', border: 'rgba(107,113,120,0.2)' },
    user: { bg: 'rgba(72,176,247,0.08)', text: '#48B0F7', border: 'rgba(72,176,247,0.2)' },
    admin: { bg: 'rgba(110,86,247,0.08)', text: '#6E56F7', border: 'rgba(110,86,247,0.2)' },
  }
  const roleStyle = roleColors[identity.role] || roleColors.user

  return (
    <div className="rounded-2xl border p-4 transition-all relative group" style={{
      borderColor: verified === true ? 'color-mix(in srgb, var(--color-lime2) 50%, transparent)' : verified === false ? 'color-mix(in srgb, var(--color-sev-critical) 40%, transparent)' : 'var(--color-hair)',
      background: verified === true ? 'color-mix(in srgb, var(--color-lime) 4%, var(--color-paper))' : 'var(--color-paper)',
      boxShadow: '0 2px 8px -4px rgba(0,0,0,0.06)',
    }}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase" style={{ background: roleStyle.bg, color: roleStyle.text, border: `1px solid ${roleStyle.border}` }}>
            {identity.label.charAt(0)}
          </div>
          <div>
            {isCustom ? (
              <input aria-label={`${identity.label} name`} className="text-sm font-bold bg-transparent outline-none border-b border-dashed border-hair focus:border-ink mono w-28" value={identity.label} onChange={e => onUpdate('label', e.target.value)} placeholder="identity name" />
            ) : (
              <p className="mono text-sm font-bold">{identity.label}</p>
            )}
            <p className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{note || identity.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Status badge */}
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            {verified === null ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]" style={{ background: 'var(--color-cream2)', color: 'var(--color-muted)' }}>unchecked</span>
              : verified ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]" style={{ background: 'color-mix(in srgb, var(--color-lime) 20%, transparent)', color: '#3f5f00' }}><CheckCircle2 size={12} /> valid</span>
                : <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]" style={{ background: 'color-mix(in srgb, var(--color-sev-critical) 10%, transparent)', color: 'var(--color-sev-critical)' }}><XCircle size={12} /> failed</span>}
          </span>
          {isCustom && onRemove && (
            <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-50" style={{ color: 'var(--color-sev-critical)' }} title="Remove identity">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Row 1: Role + User ID + Credential Type */}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Role</label>
          <select aria-label={`${identity.label} role`} className={`${input} appearance-none cursor-pointer`}
            value={identity.role} disabled={isAnon} onChange={e => onUpdate('role', e.target.value)}>
            <option value="anonymous">anonymous</option>
            <option value="user">user</option>
            <option value="admin">admin</option>
            <option value="service">service</option>
            <option value="readonly">readonly</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>User ID</label>
          <input aria-label={`${identity.label} id`} className={input} placeholder={isAnon ? '—' : 'e.g. 1, uuid…'} value={identity.user_id || ''} disabled={isAnon} onChange={e => onUpdate('user_id', e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Auth method</label>
          <select aria-label={`${identity.label} auth type`} className={`${input} appearance-none cursor-pointer`}
            value={credType} disabled={isAnon}
            onChange={e => { onUpdate('credential_type', e.target.value); if (e.target.value !== 'password') { onUpdate('login_url', ''); onUpdate('login_body', {}); } }}>
            <option value="bearer">Bearer Token</option>
            <option value="password">Password Login</option>
            <option value="api_key">API Key</option>
          </select>
        </div>
      </div>

      {/* Row 2: Credential fields — varies by type */}
      {!isAnon && (
        <div className="mt-2">
          {credType === 'bearer' && (
            <div>
              <label className="block text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Bearer token</label>
              <PasswordInput ariaLabel={`${identity.label} credential`} placeholder="Paste your JWT or access token here" value={identity.credential ?? ''} onChange={v => onUpdate('credential', v)} />
              <p className="mt-1 text-[10px]" style={{ color: 'var(--color-muted)' }}>Already have a token? Paste it directly.</p>
            </div>
          )}

          {credType === 'password' && (
            <div className="space-y-2 rounded-xl p-3 mt-1" style={{ background: 'color-mix(in srgb, var(--color-sky) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--color-sky) 12%, transparent)' }}>
              <p className="text-[10px] font-medium" style={{ color: 'var(--color-sky)' }}>The engine will POST to your login endpoint to obtain a bearer token automatically.</p>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Login endpoint URL</label>
                <input aria-label={`${identity.label} login url`} className={input}
                  placeholder={baseUrl ? `${baseUrl}/api/auth/login` : 'https://api.example.com/auth/login'}
                  value={identity.login_url || ''}
                  onChange={e => onUpdate('login_url', e.target.value)} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Email / username</label>
                  <input aria-label={`${identity.label} email`} className={input}
                    placeholder="user@example.com"
                    value={(identity.login_body as any)?.email || ''}
                    onChange={e => onUpdate('login_body', { ...(identity.login_body || {}), email: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Password</label>
                  <PasswordInput ariaLabel={`${identity.label} password`} placeholder="••••••••"
                    value={identity.credential ?? ''}
                    onChange={v => {
                      onUpdate('credential', v)
                      onUpdate('login_body', { ...(identity.login_body || {}), password: v })
                    }} />
                </div>
              </div>
            </div>
          )}

          {credType === 'api_key' && (
            <div>
              <label className="block text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>API Key</label>
              <PasswordInput ariaLabel={`${identity.label} credential`} placeholder="Your API key (sent as X-API-Key header)" value={identity.credential ?? ''} onChange={v => onUpdate('credential', v)} />
            </div>
          )}
        </div>
      )}
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
  const setId = (i: number, k: keyof Identity, v: any) => { setIds(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x)); setVerified({}) }
  const addIdentity = () => {
    const n = ids.length + 1
    setIds(p => [...p, { label: `identity${n}`, role: 'user', user_id: '', credential: '' }])
    setVerified({})
  }
  const removeIdentity = (i: number) => { setIds(p => p.filter((_, j) => j !== i)); setVerified({}) }
  const allVerified = ids.every(i => verified[i.label])
  const ready = !!spec && allVerified && attested && checks.length > 0
  const start = () => target && spec && run('start', async () => { const s = await api.startScan({ target_id: target.id, spec_id: spec.spec_id, checks }); nav(`/scan/${s.id}/live`) })

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Reveal>
        <h1 className="font-display text-4xl font-bold tracking-tight">New scan</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink2">Point SentinelAPI at an API you own, prove who each caller is, and it will test whether one user can reach another user's data — with real HTTP evidence for every finding.</p>
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

      {/* ── Identities Section (Redesigned) ── */}
      <Reveal><Panel className={`p-6 ${spec ? '' : 'pointer-events-none opacity-40'}`}>
        <Head n={3} title="Identities" done={allVerified && Object.keys(verified).length > 0} />

        {/* Info banner */}
        <div className="mb-5 rounded-xl p-3 flex items-start gap-3" style={{ background: 'color-mix(in srgb, var(--color-sky) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--color-sky) 20%, transparent)' }}>
          <KeyRound size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--color-sky)' }} />
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--color-ink)' }}>How identities work</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
              Define who accesses your API. SentinelAPI logs in as each identity and compares what resources each can reach.
              Credentials are encrypted server-side and never shown again after verification.
            </p>
          </div>
        </div>

        {/* Identity Cards */}
        <div className="space-y-3">
          {ids.map((identity, n) => {
            const st = identity.label in verified ? verified[identity.label] : null
            const isSandboxDefault = n < SANDBOX_IDS.length
            return (
              <IdentityCard
                key={`${identity.label}-${n}`}
                identity={identity}
                note={NOTE[identity.label]}
                index={n}
                verified={st}
                isCustom={!isSandboxDefault}
                baseUrl={target?.base_url}
                onUpdate={(k, v) => setId(n, k, v)}
                onRemove={!isSandboxDefault ? () => removeIdentity(n) : undefined}
              />
            )
          })}
        </div>

        {/* Add Identity + Verify */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button onClick={addIdentity} className="inline-flex items-center gap-2 rounded-full border border-dashed border-hair bg-paper/50 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-cream2 hover:border-ink2" style={{ color: 'var(--color-ink2)' }}>
            <UserPlus size={15} /> Add identity
          </button>
          <button onClick={verify} disabled={busy === 'verify'} className="inline-flex items-center gap-2 rounded-full border border-hair bg-paper px-5 py-2.5 text-sm font-semibold hover:bg-cream2">
            <ShieldCheck size={15} /> {busy === 'verify' ? 'Verifying…' : 'Verify credentials'}
          </button>
        </div>
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
