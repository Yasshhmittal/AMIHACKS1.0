import { useMemo, useState } from 'react'
import type { Finding, Severity } from '../types'
import { sevColor } from '../lib/format'

const IDENTS = [
  { id: 'anonymous', label: 'anon', role: 'no creds' },
  { id: 'userA', label: 'userA', role: 'attacker' },
  { id: 'userB', label: 'userB', role: 'victim' },
  { id: 'admin', label: 'admin', role: 'privileged' },
]

// which identity is the "actor" that crossed the boundary, per finding class
function actorFor(f: Finding): string {
  if (f.class === 'BROKEN_AUTH' || f.class === 'RATE_LIMITING' || f.class === 'MISCONFIGURATION') return 'anonymous'
  return 'userA'
}

interface Node { id: string; x: number; y: number; label: string; sub?: string }

export function AuthGraph({ findings }: { findings: Finding[] }) {
  const [hover, setHover] = useState<string | null>(null)

  const { idNodes, resNodes, edges } = useMemo(() => {
    const W = 760, H = 360
    const idNodes: Node[] = IDENTS.map((d, i) => ({
      id: d.id, x: 120, y: 70 + i * ((H - 120) / (IDENTS.length - 1)), label: d.label, sub: d.role,
    }))
    const resources = Array.from(new Set(findings.map(f => f.endpoint || f.class)))
    const resNodes: Node[] = resources.map((r, i) => ({
      id: r, x: W - 140, y: resources.length === 1 ? H / 2 : 60 + i * ((H - 110) / Math.max(1, resources.length - 1)),
      label: (r.split(' ')[1] || r).replace(/^\//, '/'), sub: r.split(' ')[0],
    }))
    const edges = findings.map(f => ({
      key: `${f.id}`, from: actorFor(f), to: f.endpoint || f.class,
      color: sevColor[f.severity as Severity], sev: f.severity, cls: f.class, fixed: f.state === 'fixed',
    }))
    return { idNodes, resNodes, edges }
  }, [findings])

  const nodeById = (id: string) => [...idNodes, ...resNodes].find(n => n.id === id)

  return (
    <div className="relative">
      <svg viewBox="0 0 760 360" className="w-full">
        <defs>
          <filter id="soft"><feGaussianBlur stdDeviation="2.4" /></filter>
          <radialGradient id="idFill"><stop offset="0" stopColor="#0b1a1e" /><stop offset="1" stopColor="#081215" /></radialGradient>
        </defs>

        {/* edges */}
        {edges.map(e => {
          const a = nodeById(e.from), b = nodeById(e.to)
          if (!a || !b) return null
          const mx = (a.x + b.x) / 2
          const d = `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`
          const active = hover === e.key || hover === null
          return (
            <g key={e.key} opacity={active ? 1 : 0.25}>
              <path d={d} fill="none" stroke={e.fixed ? 'var(--color-emerald)' : e.color} strokeWidth={hover === e.key ? 3 : 2}
                strokeOpacity={e.fixed ? 0.7 : 0.9} className={e.fixed ? '' : 'edge-flow'} filter="url(#soft)"
                onMouseEnter={() => setHover(e.key)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }} />
            </g>
          )
        })}

        {/* identity nodes */}
        {idNodes.map(n => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r="26" fill="url(#idFill)" stroke="rgba(45,212,191,.5)" strokeWidth="1.5" />
            <text x={n.x} y={n.y - 1} textAnchor="middle" className="mono" fontSize="11" fontWeight="700" fill="#e8f0f2">{n.label}</text>
            <text x={n.x} y={n.y + 11} textAnchor="middle" fontSize="8" fill="#7f96a1">{n.sub}</text>
          </g>
        ))}

        {/* resource nodes */}
        {resNodes.map(n => (
          <g key={n.id}>
            <rect x={n.x - 66} y={n.y - 16} width="132" height="32" rx="9" fill="#0a1417" stroke="rgba(255,255,255,.12)" />
            <text x={n.x} y={n.y - 1} textAnchor="middle" className="mono" fontSize="9.5" fill="#e8f0f2">{n.label.length > 18 ? n.label.slice(0, 17) + '…' : n.label}</text>
            <text x={n.x} y={n.y + 10} textAnchor="middle" className="mono" fontSize="7.5" fill="#7f96a1">{n.sub}</text>
          </g>
        ))}
      </svg>

      <div className="pointer-events-none absolute right-3 top-3 flex gap-4 text-[11px]">
        <span className="flex items-center gap-1.5 text-dim"><span className="h-0.5 w-4 rounded" style={{ background: 'var(--color-sev-critical)' }} />Attack path</span>
        <span className="flex items-center gap-1.5 text-dim"><span className="h-0.5 w-4 rounded" style={{ background: 'var(--color-emerald)' }} />Fixed</span>
      </div>
    </div>
  )
}
