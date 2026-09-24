import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import { useFetch } from '../hooks/useFetch'
import { Empty, ErrorBox, Glass, Loading } from '../components/glass'
import { classify, IDENTITY_ORDER, statusColor } from '../lib/format'
import type { MatrixCell } from '../types'

const CELL_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  ok: { bg: 'color-mix(in srgb, var(--color-emerald) 18%, transparent)', fg: 'var(--color-emerald)', label: 'authorized' },
  violation: { bg: 'color-mix(in srgb, var(--color-sev-critical) 22%, transparent)', fg: 'var(--color-sev-critical)', label: 'VIOLATION' },
  denied: { bg: 'color-mix(in srgb, var(--color-teal) 14%, transparent)', fg: 'var(--color-teal)', label: 'denied' },
  warn: { bg: 'color-mix(in srgb, var(--color-sev-medium) 18%, transparent)', fg: 'var(--color-sev-medium)', label: 'unexpected' },
  none: { bg: 'rgba(255,255,255,.03)', fg: 'var(--color-dim)', label: '—' },
}

export default function AccessMatrix() {
  const { scanId = '' } = useParams()
  const { data, error, loading, reload } = useFetch(() => api.matrix(scanId), [scanId])
  const [sel, setSel] = useState<MatrixCell | null>(null)

  const { rows, grid } = useMemo(() => {
    const cells = data || []
    const rowKeys: string[] = []
    const grid: Record<string, Record<string, MatrixCell>> = {}
    for (const c of cells) {
      const key = `${c.method} ${c.path}`
      if (!grid[key]) { grid[key] = {}; rowKeys.push(key) }
      // keep the most interesting cell per (endpoint, identity)
      const prev = grid[key][c.identity]
      if (!prev || c.ownership_mismatch) grid[key][c.identity] = c
    }
    return { rows: rowKeys, grid }
  }, [data])

  if (error) return <ErrorBox msg={error} retry={reload} />

  return (
    <div className="space-y-6">
      <div className="rise">
        <h1 className="text-3xl font-extrabold tracking-tight">Access matrix</h1>
        <p className="mt-1 max-w-2xl text-sm text-dim">Endpoint × identity. One sweep, every combination — this is the whole zero-trust thesis on one screen. Click a cell for the raw request and response.</p>
      </div>

      <div className="rise flex flex-wrap gap-4 text-xs">
        {Object.entries(CELL_STYLE).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5 text-dim"><span className="size-3 rounded" style={{ background: v.bg, border: `1px solid ${v.fg}` }} />{v.label}</span>
        ))}
      </div>

      {loading ? <Loading rows={6} />
        : rows.length === 0 ? <Empty title="No matrix cells" hint="The sweep records a cell per (endpoint, identity) pair." />
          : <Glass className="rise overflow-hidden p-0">
            <div className="scroll overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/8">
                    <th className="sticky left-0 z-10 bg-[#070d11] px-4 py-3 text-left text-xs font-medium text-dim">Endpoint</th>
                    {IDENTITY_ORDER.map(id => <th key={id} className="mono px-3 py-3 text-center text-xs font-semibold">{id}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(rk => (
                    <tr key={rk} className="border-b border-white/5">
                      <td className="mono sticky left-0 z-10 bg-[#070d11] px-4 py-2.5 text-xs">{rk}</td>
                      {IDENTITY_ORDER.map(id => {
                        const c = grid[rk][id]
                        if (!c) return <td key={id} className="px-2 py-2 text-center"><span className="text-dim/40">·</span></td>
                        const kind = classify(c.status, false, c.ownership_mismatch)
                        const st = CELL_STYLE[kind]
                        return (
                          <td key={id} className="px-2 py-2 text-center">
                            <button onClick={() => setSel(c)} className="mono w-full rounded-lg px-2 py-1.5 text-xs font-bold transition-transform hover:scale-[1.04]"
                              style={{ background: st.bg, color: st.fg, border: `1px solid color-mix(in srgb, ${st.fg} 45%, transparent)` }}
                              title={`${c.status} · ${st.label}`}>
                              {c.status || '—'}
                              {c.ownership_mismatch && <span className="ml-1">⚠</span>}
                              {c.sensitive_fields.length > 0 && <span className="ml-1" style={{ color: 'var(--color-sev-high)' }}>◈</span>}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Glass>}

      {/* cell detail drawer */}
      {sel && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-sm" onClick={() => setSel(null)}>
          <div className="glass h-full w-full max-w-lg overflow-auto rounded-l-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="mono text-sm font-bold">{sel.method} {sel.path}</p>
                <p className="mono text-xs text-dim">identity: {sel.identity} · status <span style={{ color: statusColor(sel.status) }}>{sel.status}</span></p>
              </div>
              <button onClick={() => setSel(null)} className="rounded-lg bg-white/5 p-1.5 hover:bg-white/10"><X size={16} /></button>
            </div>
            <div className="space-y-3 text-xs">
              {sel.ownership_mismatch && <div className="rounded-lg p-2.5" style={{ background: 'color-mix(in srgb, var(--color-sev-critical) 12%, transparent)', color: 'var(--color-sev-critical)' }}>Ownership mismatch: object #{sel.object_id} owned by {sel.object_owner}, returned to {sel.identity}.</div>}
              {sel.sensitive_fields.length > 0 && <div><p className="mb-1 text-dim">Sensitive fields</p><p className="mono">{sel.sensitive_fields.join(', ')}</p></div>}
              {sel.undocumented_fields.length > 0 && <div><p className="mb-1 text-dim">Undocumented fields</p><p className="mono">{sel.undocumented_fields.join(', ')}</p></div>}
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-dim">Object id</p><p className="mono">{sel.object_id ?? '—'}</p></div>
                <div><p className="text-dim">Latency</p><p className="mono">{sel.duration_ms ?? '—'} ms</p></div>
              </div>
              <p className="text-dim">Open the corresponding finding for the full six-probe evidence and PoC.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
