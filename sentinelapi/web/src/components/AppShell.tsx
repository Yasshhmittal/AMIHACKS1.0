import { useState } from 'react'
import { Link, NavLink, Outlet, useMatch } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { api } from '../lib/api'
import { Logo } from './Nav'

export default function AppShell() {
  const scanMatch = useMatch('/scan/:scanId/*')
  const scanId = scanMatch?.params.scanId && scanMatch.params.scanId !== 'new' ? scanMatch.params.scanId : undefined
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const steps: [string, string][] = scanId
    ? [['Live', `/scan/${scanId}/live`], ['Results', `/scan/${scanId}/results`], ['Matrix', `/scan/${scanId}/matrix`], ['Report', `/scan/${scanId}/report`]]
    : [['New scan', '/scan/new']]

  const reset = async () => {
    if (!confirm('Reset the sandbox to its initial vulnerable state? Applied fixes are undone.')) return
    setBusy(true)
    try { await api.reset(); setMsg('Sandbox reset ✓') } catch (e: any) { setMsg(e.message) }
    setBusy(false); setTimeout(() => setMsg(''), 4000)
  }

  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${isActive ? 'bg-ink text-cream' : 'text-ink2 hover:bg-paper hover:text-ink'}`

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-full border border-white/70 bg-paper/70 px-4 py-2.5 backdrop-blur-xl" style={{ boxShadow: '0 20px 40px -30px rgba(20,20,25,.4)' }}>
          <Logo />
          <nav className="flex items-center gap-1 rounded-full bg-cream2/70 p-1">
            {steps.map(([label, to]) => <NavLink key={to} to={to} className={link}>{label}</NavLink>)}
          </nav>
          <div className="flex items-center gap-3">
            <span className="chip hidden items-center gap-1.5 rounded-full bg-cream2 px-3 py-1.5 text-[11px] font-bold text-ink2 sm:inline-flex">
              <span className="live-dot size-1.5 rounded-full" style={{ background: 'var(--color-lime2)' }} />TARGET: SANDBOX
            </span>
            <span className="text-xs text-muted" role="status">{msg}</span>
            <button onClick={reset} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink2 hover:bg-ink/5">
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
