import { useState } from 'react'
import { NavLink, Outlet, useMatch } from 'react-router-dom'
import {
  Activity, FileText, Grid3x3, RadioTower, RotateCcw, ScanLine, Shield, ShieldCheck,
} from 'lucide-react'
import { api } from '../lib/api'
import { Btn } from './glass'

const rail = [
  { to: '/scan/new', icon: ScanLine, label: 'New scan', end: false },
]

function NavItem({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <NavLink to={to} title={label}
      className={({ isActive }) =>
        `group relative flex size-11 items-center justify-center rounded-2xl transition-all ${
          isActive ? 'text-[#04110f] bg-gradient-to-b from-[#5eead4] to-[#22d3ee] glow-teal' : 'text-dim hover:text-ink hover:bg-white/[.06]'
        }`}>
      <Icon size={19} strokeWidth={2} />
      <span className="pointer-events-none absolute left-14 z-20 whitespace-nowrap rounded-lg bg-black/80 px-2 py-1 text-xs text-ink opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">{label}</span>
    </NavLink>
  )
}

export default function Shell() {
  const scanMatch = useMatch('/scan/:scanId/*')
  const scanId = scanMatch?.params.scanId && scanMatch.params.scanId !== 'new' ? scanMatch.params.scanId : undefined
  const [msg, setMsg] = useState('')
  const [resetting, setResetting] = useState(false)

  const reset = async () => {
    if (!confirm('Reset the sandbox to its initial vulnerable state? Applied fixes are undone.')) return
    setResetting(true)
    try { await api.reset(); setMsg('Sandbox reset ✓') } catch (e: any) { setMsg(e.message) }
    setResetting(false); setTimeout(() => setMsg(''), 4000)
  }

  return (
    <div className="relative z-10 flex min-h-screen">
      {/* left icon rail */}
      <aside className="sticky top-0 flex h-screen w-[76px] shrink-0 flex-col items-center gap-2 py-5">
        <div className="mb-3 grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-[#2dd4bf] to-[#22d3ee] text-[#04110f] shadow-[0_10px_30px_-10px_rgba(45,212,191,.8)]">
          <Shield size={22} strokeWidth={2.4} />
        </div>
        <NavItem to="/scan/new" icon={ScanLine} label="New scan" />
        {scanId && <>
          <NavItem to={`/scan/${scanId}/live`} icon={RadioTower} label="Live scan" />
          <NavItem to={`/scan/${scanId}/results`} icon={Activity} label="Results" />
          <NavItem to={`/scan/${scanId}/matrix`} icon={Grid3x3} label="Access matrix" />
          <NavItem to={`/scan/${scanId}/report`} icon={FileText} label="Report" />
        </>}
        <div className="mt-auto text-dim/60"><ShieldCheck size={18} /></div>
      </aside>

      {/* main column */}
      <div className="min-w-0 flex-1 pr-5">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 py-4">
          <div className="glass-soft flex items-center gap-2 rounded-full px-4 py-2">
            <span className="live-dot size-2 rounded-full" style={{ background: 'var(--color-emerald)' }} />
            <span className="mono text-xs font-bold tracking-wide">TARGET MODE: SANDBOX / AUTHORIZED</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-dim" role="status">{msg}</span>
            <Btn variant="ghost" onClick={reset} disabled={resetting}>
              <RotateCcw size={15} /> {resetting ? 'Resetting…' : 'Reset sandbox'}
            </Btn>
          </div>
        </header>
        <main className="pb-16"><Outlet /></main>
      </div>
    </div>
  )
}
