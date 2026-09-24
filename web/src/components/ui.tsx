import type { ReactNode, ButtonHTMLAttributes } from 'react'
import type { Severity } from '../types'

export const SEV_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']
const sevVar = (s: string) => `var(--color-sev-${s.toLowerCase()})`

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => <div className={`card ${className}`}>{children}</div>

// Severity is always color + text label (never color alone)
export function SeverityBadge({ s }: { s: Severity }) {
  const c = sevVar(s)
  return <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-xs font-bold"
    style={{ color: c, background: `color-mix(in srgb, ${c} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 45%, transparent)` }}>
    <span className="size-1.5 rounded-full" style={{ background: c }} />{s}</span>
}
// VERIFIED = solid, POTENTIAL = outlined
export const ConfidenceBadge = ({ c }: { c: 'VERIFIED' | 'POTENTIAL' }) =>
  <span className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${c === 'VERIFIED' ? 'bg-ink text-bg' : 'border border-dim text-dim'}`}>{c}</span>

export const Btn = ({ variant = 'solid', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'solid' | 'ghost' }) =>
  <button {...p} className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${variant === 'solid' ? 'bg-ink text-bg hover:bg-white' : 'border border-line text-ink hover:bg-white/5'} ${className}`} />

export const Loading = ({ rows = 4 }: { rows?: number }) =>
  <div role="status" aria-label="Loading" className="space-y-3">{Array.from({ length: rows }, (_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />)}</div>
export const ErrorBox = ({ msg, retry }: { msg: string; retry?: () => void }) =>
  <Card className="border-sev-critical/50 p-6"><p className="font-semibold text-sev-critical">Couldn't load this data</p>
    <p className="mt-1 font-mono text-xs text-dim">{msg}</p>{retry && <Btn variant="ghost" className="mt-4" onClick={retry}>Try again</Btn>}</Card>
export const Empty = ({ title, hint }: { title: string; hint: string }) =>
  <div className="py-12 text-center"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-dim">{hint}</p></div>
export const Field = ({ label, help, children }: { label: string; help: string; children: ReactNode }) =>
  <label className="block"><span className="text-sm font-semibold">{label}</span><div className="mt-1.5">{children}</div><span className="mt-1 block text-xs text-dim">{help}</span></label>
export const inputCls = 'w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-dim'
export const Code = ({ children }: { children: ReactNode }) => <pre className="overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-xs leading-relaxed">{children}</pre>
