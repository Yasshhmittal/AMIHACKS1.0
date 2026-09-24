import { NavLink, Outlet, useMatch } from 'react-router-dom'
import { useState } from 'react'
import { api } from '../api/client'
import { Btn } from './ui'

export default function Layout() {
  const scanMatch = useMatch('/scan/:scanId/*')
  const scanId = scanMatch?.params.scanId && scanMatch.params.scanId !== 'new' ? scanMatch.params.scanId : undefined
  const [msg, setMsg] = useState('')
  const link = ({ isActive }: { isActive: boolean }) => `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-white/10 font-semibold' : 'text-dim hover:text-ink'}`
  const reset = async () => {
    if (!confirm('Reset the sandbox to its initial state? Applied fixes will be undone.')) return
    try { await api.reset(); setMsg('Sandbox reset') } catch (e: any) { setMsg(e.message) }
    setTimeout(() => setMsg(''), 4000)
  }
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-side p-4 md:flex">
        <div className="mb-8 px-3 text-lg font-extrabold tracking-tight">SentinelAPI</div>
        <nav className="space-y-1" aria-label="Main">
          <NavLink to="/scan/new" className={link}>New scan</NavLink>
          {scanId && <>
            <NavLink to={`/scan/${scanId}/live`} className={link}>Live scan</NavLink>
            <NavLink to={`/scan/${scanId}/results`} className={link}>Results</NavLink>
            <NavLink to={`/scan/${scanId}/matrix`} className={link}>Access matrix</NavLink>
            <NavLink to={`/scan/${scanId}/report`} className={link}>Report</NavLink>
          </>}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-line px-8 py-3">
          <span className="inline-flex items-center gap-2 rounded border border-line px-3 py-1 font-mono text-xs font-bold">
            <span className="live-dot size-2 rounded-full bg-ink" />TARGET MODE: SANDBOX / AUTHORIZED</span>
          <div className="flex items-center gap-3"><span className="text-xs text-dim" role="status">{msg}</span><Btn variant="ghost" onClick={reset}>Reset sandbox</Btn></div>
        </header>
        <main className="mx-auto max-w-6xl p-8"><Outlet /></main>
      </div>
    </div>
  )
}
