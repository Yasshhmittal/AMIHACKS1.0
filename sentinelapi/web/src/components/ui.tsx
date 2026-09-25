import type { CSSProperties, ReactNode } from 'react'
import type { Confidence, Severity } from '../types'
import { sevColor } from '../lib/format'

export function Panel({ children, className = '', dark = false, glass = false, style }: { children: ReactNode; className?: string; dark?: boolean; glass?: boolean; style?: CSSProperties }) {
  const base = dark ? 'panel' : glass ? 'glass' : 'glass-card'
  return <div className={`${base} ${className}`} style={style}>{children}</div>
}

export function Btn({ children, onClick, variant = 'lime', disabled, className = '', type = 'button', title, as, href }: {
  children: ReactNode; onClick?: () => void; variant?: 'lime' | 'ink' | 'ghost' | 'outline'; disabled?: boolean; className?: string; type?: 'button' | 'submit'; title?: string; as?: 'a'; href?: string
}) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[.98]'
  const styles: Record<string, string> = {
    lime: 'lime-btn hover:brightness-105',
    ink: 'bg-ink text-cream hover:bg-ink2',
    ghost: 'text-ink/80 hover:bg-ink/5',
    outline: 'text-ink hair bg-paper hover:bg-cream2',
  }
  const cls = `${base} ${styles[variant]} ${className}`
  if (as === 'a') return <a href={href} title={title} className={cls}>{children}</a>
  return <button type={type} title={title} disabled={disabled} onClick={onClick} className={cls}>{children}</button>
}

export function Pill({ children, tone = 'ink' }: { children: ReactNode; tone?: 'ink' | 'lime' | 'muted' }) {
  const map: Record<string, CSSProperties> = {
    ink: { background: 'var(--color-ink)', color: 'var(--color-cream)' },
    lime: { background: 'color-mix(in srgb, var(--color-lime) 30%, transparent)', color: '#33420a' },
    muted: { background: 'var(--color-cream2)', color: 'var(--color-ink2)' },
  }
  return <span className="mono chip px-2.5 py-1 text-[11px] font-medium" style={map[tone]}>{children}</span>
}

export function SeverityChip({ s, small = false }: { s: Severity; small?: boolean }) {
  const c = sevColor[s]
  return (
    <span className={`chip inline-flex items-center gap-1.5 font-bold uppercase tracking-wide ${small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}
      style={{ color: c, background: `color-mix(in srgb, ${c} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 40%, transparent)` }}>
      <span className="size-1.5 rounded-full" style={{ background: c }} />{s}
    </span>
  )
}

export function ConfidenceBadge({ c }: { c: Confidence }) {
  const verified = c === 'VERIFIED'
  return verified
    ? <span className="chip inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold" style={{ color: '#3f5f00', background: 'color-mix(in srgb, var(--color-lime) 28%, transparent)', border: '1px solid color-mix(in srgb, var(--color-lime2) 55%, transparent)' }}>◉ VERIFIED</span>
    : <span className="chip inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-muted" style={{ border: '1px dashed var(--color-hair)' }}>◌ POTENTIAL</span>
}

export function StatTile({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="glass-card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="font-display mt-2 text-3xl font-bold tracking-tight" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) { return <div className={`skeleton ${className}`} /> }
export function Loading({ rows = 4 }: { rows?: number }) { return <div className="space-y-3">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div> }

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-hair px-6 py-12 text-center">
      <p className="font-semibold">{title}</p>{hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
    </div>
  )
}

export function ErrorBox({ msg, retry }: { msg: string; retry?: () => void }) {
  return (
    <div className="rounded-2xl p-5" style={{ border: '1px solid color-mix(in srgb, var(--color-sev-critical) 40%, transparent)', background: 'color-mix(in srgb, var(--color-sev-critical) 6%, transparent)' }}>
      <p className="font-semibold" style={{ color: 'var(--color-sev-critical)' }}>Something went wrong</p>
      <p className="mono mt-1 text-xs text-muted">{msg}</p>
      {retry && <button onClick={retry} className="mt-3 rounded-full bg-ink px-3 py-1.5 text-sm text-cream hover:bg-ink2">Retry</button>}
    </div>
  )
}

export function Code({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <pre className={`scroll mono overflow-auto rounded-xl bg-panel p-3 text-xs leading-relaxed text-oncream ${className}`} style={{ border: '1px solid var(--color-panelhair)' }}>{children}</pre>
}
