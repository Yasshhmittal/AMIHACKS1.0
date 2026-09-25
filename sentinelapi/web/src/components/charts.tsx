import { useEffect, useState } from 'react'
import type { Severity } from '../types'
import { sevColor, SEVERITIES } from '../lib/format'

export function RiskGauge({ value }: { value: number }) {
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
  const pt = (a: number, r = R) => [CX + r * Math.cos(a), CY - r * Math.sin(a)]
  const arc = (from: number, to: number, r = R) => {
    const [x0, y0] = pt(from, r), [x1, y1] = pt(to, r)
    return `M ${x0} ${y0} A ${r} ${r} 0 ${Math.abs(to - from) > Math.PI ? 1 : 0} 1 ${x1} ${y1}`
  }
  const ang = Math.PI + (0 - Math.PI) * (Math.min(100, Math.max(0, shown)) / 100)
  const [hx, hy] = pt(ang)
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 118" className="w-full max-w-[260px]">
        <path d={arc(Math.PI, 0)} fill="none" stroke="#e2ddcf" strokeWidth="12" strokeLinecap="round" />
        <path d={arc(Math.PI, ang)} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
        <circle cx={hx} cy={hy} r="6" fill="#fff" stroke={color} strokeWidth="3" />
      </svg>
      <div className="-mt-9 text-center">
        <div className="font-display text-4xl font-bold tracking-tight" style={{ color }}>{Math.round(shown)}<span className="text-lg text-muted">/100</span></div>
        <div className="mt-0.5 text-xs font-semibold" style={{ color }}>{band}</div>
        <div className="text-[11px] text-muted">Risk score</div>
      </div>
    </div>
  )
}

export function SeverityBar({ counts }: { counts: Record<string, number> }) {
  const total = SEVERITIES.reduce((n, s) => n + (counts[s] || 0), 0) || 1
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-cream2">
        {SEVERITIES.map(s => {
          const w = ((counts[s] || 0) / total) * 100
          return w > 0 ? <div key={s} style={{ width: `${w}%`, background: sevColor[s] }} title={`${s}: ${counts[s]}`} /> : null
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {SEVERITIES.map(s => (
          <div key={s} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-muted"><span className="size-2 rounded-full" style={{ background: sevColor[s] }} />{s[0] + s.slice(1).toLowerCase()}</span>
            <span className="mono font-semibold">{counts[s] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Sparkline({ data, color = 'var(--color-lime2)', height = 46 }: { data: number[]; color?: string; height?: number }) {
  if (!data.length) return <div style={{ height }} />
  const w = 240, h = height, max = Math.max(...data, 1), min = Math.min(...data, 0), span = max - min || 1
  const pts = data.map((v, i) => [(i / (data.length - 1 || 1)) * w, h - ((v - min) / span) * (h - 6) - 3])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs><linearGradient id="spark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L ${w} ${h} L 0 ${h} Z`} fill="url(#spark)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
