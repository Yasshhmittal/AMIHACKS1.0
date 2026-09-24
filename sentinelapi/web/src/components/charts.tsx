import { useEffect, useState } from 'react'
import type { Severity } from '../types'
import { sevColor, SEVERITIES } from '../lib/format'

/** Semicircular risk gauge (0-100), coloured by band. Mirrors the reference "health score". */
export function RiskGauge({ value, label = 'Risk score' }: { value: number; label?: string }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    let raf = 0; const start = performance.now(); const from = shown
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 900)
      setShown(from + (value - from) * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const band = value >= 90 ? 'CRITICAL' : value >= 70 ? 'HIGH' : value >= 40 ? 'MEDIUM' : value >= 20 ? 'LOW' : 'INFO'
  const color = sevColor[band as Severity]
  const R = 82, CX = 100, CY = 100
  const a0 = Math.PI, a1 = 0
  const ang = a0 + (a1 - a0) * (Math.min(100, Math.max(0, shown)) / 100)
  const pt = (a: number, r = R) => [CX + r * Math.cos(a), CY - r * Math.sin(a)]
  const arc = (from: number, to: number, r = R) => {
    const [x0, y0] = pt(from, r), [x1, y1] = pt(to, r)
    const large = Math.abs(to - from) > Math.PI ? 1 : 0
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`
  }
  const [hx, hy] = pt(ang)

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 118" className="w-full max-w-[260px]">
        <defs>
          <linearGradient id="gaugeTrack" x1="0" x2="1">
            <stop offset="0" stopColor="#2563eb" /><stop offset=".5" stopColor="#ca8a04" /><stop offset="1" stopColor="#f43f5e" />
          </linearGradient>
          <filter id="gGlow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <path d={arc(a0, a1)} fill="none" stroke="url(#gaugeTrack)" strokeOpacity=".25" strokeWidth="12" strokeLinecap="round" />
        <path d={arc(a0, ang)} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" filter="url(#gGlow)" />
        <circle cx={hx} cy={hy} r="6" fill="#05090c" stroke={color} strokeWidth="3" />
      </svg>
      <div className="-mt-8 text-center">
        <div className="text-4xl font-extrabold tracking-tight" style={{ color }}>{Math.round(shown)}<span className="text-lg text-dim">/100</span></div>
        <div className="mt-0.5 text-xs font-semibold" style={{ color }}>{band}</div>
        <div className="text-[11px] text-dim">{label}</div>
      </div>
    </div>
  )
}

/** Severity distribution as stacked segmented bar + legend. */
export function SeverityBar({ counts }: { counts: Record<string, number> }) {
  const total = SEVERITIES.reduce((n, s) => n + (counts[s] || 0), 0) || 1
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/5">
        {SEVERITIES.map(s => {
          const w = ((counts[s] || 0) / total) * 100
          return w > 0 ? <div key={s} style={{ width: `${w}%`, background: sevColor[s] }} title={`${s}: ${counts[s]}`} /> : null
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {SEVERITIES.map(s => (
          <div key={s} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-dim"><span className="size-2 rounded-full" style={{ background: sevColor[s] }} />{s[0] + s.slice(1).toLowerCase()}</span>
            <span className="mono font-semibold">{counts[s] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Lightweight area sparkline from a numeric series. */
export function Sparkline({ data, color = 'var(--color-teal)', height = 46 }: { data: number[]; color?: string; height?: number }) {
  if (!data.length) return <div style={{ height }} />
  const w = 240, h = height, max = Math.max(...data, 1), min = Math.min(...data, 0)
  const span = max - min || 1
  const pts = data.map((v, i) => [(i / (data.length - 1 || 1)) * w, h - ((v - min) / span) * (h - 6) - 3])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L ${w} ${h} L 0 ${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs><linearGradient id="spark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#spark)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
