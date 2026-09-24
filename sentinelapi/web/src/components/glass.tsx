import type { CSSProperties, ReactNode } from 'react'
import type { Confidence, Severity } from '../types'
import { sevColor } from '../lib/format'

export function Glass({ children, className = '', soft = false, style }: { children: ReactNode; className?: string; soft?: boolean; style?: CSSProperties }) {
  return <div className={`${soft ? 'glass-soft' : 'glass'} ${className}`} style={style}>{children}</div>
}

export function Btn({ children, onClick, variant = 'solid', disabled, className = '', type = 'button', title }: {
  children: ReactNode; onClick?: () => void; variant?: 'solid' | 'ghost' | 'danger'; disabled?: boolean; className?: string; type?: 'button' | 'submit'; title?: string
}) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[.98]'
  const styles: Record<string, string> = {
    solid: 'text-[#04110f] bg-gradient-to-b from-[#5eead4] to-[#22d3ee] hover:brightness-110 shadow-[0_10px_30px_-12px_rgba(45,212,191,.7)]',
    ghost: 'text-ink/90 bg-white/[.04] hair hover:bg-white/[.08]',
    danger: 'text-white bg-[#f43f5e]/90 hover:bg-[#f43f5e]',
  }
  return <button type={type} title={title} disabled={disabled} onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>{children}</button>
}

export function SeverityChip({ s, small = false }: { s: Severity; small?: boolean }) {
  const c = sevColor[s]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wide ${small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}
      style={{ color: c, background: `color-mix(in srgb, ${c} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 45%, transparent)` }}>
      <span className="size-1.5 rounded-full" style={{ background: c }} />{s}
    </span>
  )
}

export function ConfidenceBadge({ c }: { c: Confidence }) {
  const verified = c === 'VERIFIED'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${verified ? 'text-emerald bg-emerald/10' : 'text-dim'}`}
      style={verified
        ? { color: 'var(--color-emerald)', background: 'color-mix(in srgb, var(--color-emerald) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--color-emerald) 40%, transparent)' }
        : { border: '1px dashed color-mix(in srgb, var(--color-dim) 60%, transparent)', color: 'var(--color-dim)' }}>
      {verified ? '◉ VERIFIED' : '◌ POTENTIAL'}
    </span>
  )
}

export function Pill({ children, tone = 'teal' }: { children: ReactNode; tone?: 'teal' | 'dim' }) {
  return <span className="mono rounded-md px-2 py-0.5 text-[11px]" style={{
    color: tone === 'teal' ? 'var(--color-teal)' : 'var(--color-dim)',
    background: tone === 'teal' ? 'color-mix(in srgb, var(--color-teal) 12%, transparent)' : 'rgba(255,255,255,.04)',
  }}>{children}</span>
}

export function StatTile({ label, value, sub, accent, icon }: { label: string; value: ReactNode; sub?: string; accent?: string; icon?: ReactNode }) {
  return (
    <Glass soft className="relative overflow-hidden p-4">
      <div className="flex items-start justify-between">
        <div className="text-xs text-dim">{label}</div>
        {icon && <div className="text-teal/80">{icon}</div>}
      </div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="mt-1 text-xs text-dim">{sub}</div>}
    </Glass>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-3">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
}

export function Empty({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-dim">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-dim">{hint}</p>}
    </div>
  )
}

export function ErrorBox({ msg, retry }: { msg: string; retry?: () => void }) {
  return (
    <div className="rounded-2xl p-5" style={{ border: '1px solid color-mix(in srgb, var(--color-sev-critical) 45%, transparent)', background: 'color-mix(in srgb, var(--color-sev-critical) 8%, transparent)' }}>
      <p className="font-semibold" style={{ color: 'var(--color-sev-critical)' }}>Something went wrong</p>
      <p className="mono mt-1 text-xs text-dim">{msg}</p>
      {retry && <button onClick={retry} className="mt-3 rounded-lg bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10">Retry</button>}
    </div>
  )
}

export function Code({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <pre className={`scroll mono overflow-auto rounded-xl bg-black/40 p-3 text-xs leading-relaxed hair ${className}`}>{children}</pre>
}
