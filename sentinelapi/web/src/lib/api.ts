import type {
  Endpoint, Finding, Identity, MatrixCell, Scan, SpecUpload, Summary, Target,
} from '../types'

const BASE = '/api'

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText
    try { const b = await res.json(); detail = b.detail || JSON.stringify(b) } catch { /* ignore */ }
    throw new Error(`${res.status} · ${detail}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  createTarget: (body: { base_url: string; environment: string; attested_by?: string }) =>
    fetch(`${BASE}/targets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j<Target>),

  uploadSpec: (targetId: number, file: File) => {
    const fd = new FormData(); fd.append('file', file)
    return fetch(`${BASE}/targets/${targetId}/spec`, { method: 'POST', body: fd }).then(j<SpecUpload>)
  },

  setIdentities: (targetId: number, ids: Identity[]) =>
    fetch(`${BASE}/targets/${targetId}/identities`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids) }).then(j<{ status: string; count: number }>),

  verify: (targetId: number) =>
    fetch(`${BASE}/targets/${targetId}/verify`, { method: 'POST' }).then(j<{ results: { identity: string; ok: boolean; status: number }[] }>),

  startScan: (body: { target_id: number; spec_id: number; checks: string[] }) =>
    fetch(`${BASE}/scans`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j<Scan>),

  scan: (id: number | string) => fetch(`${BASE}/scans/${id}`).then(j<Scan>),
  matrix: (id: number | string) => fetch(`${BASE}/scans/${id}/matrix`).then(j<MatrixCell[]>),
  findings: (id: number | string) => fetch(`${BASE}/scans/${id}/findings`).then(j<Finding[]>),
  summary: (id: number | string) => fetch(`${BASE}/scans/${id}/summary`).then(j<Summary>),

  finding: (id: number | string) => fetch(`${BASE}/findings/${id}`).then(j<Finding>),
  poc: (id: number | string) => fetch(`${BASE}/findings/${id}/poc`).then(j<{ finding_id: number; curl: string; httpie: string; python: string }>),
  explain: (id: number | string) => fetch(`${BASE}/findings/${id}/explain`, { method: 'POST' }).then(j<{ explanation_md: string; provider: string }>),
  reverify: (id: number | string) => fetch(`${BASE}/findings/${id}/verify`, { method: 'POST' }).then(j<{ status: 'still-vulnerable' | 'fixed'; detail: string }>),

  applyFix: (vulnId: string) => fetch(`${BASE}/demo/fix/${vulnId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) }).then(j<{ status: string; detail?: string }>),
  reset: () => fetch(`${BASE}/demo/reset`, { method: 'POST' }).then(j<{ status: string }>),

  reportUrl: (id: number | string, kind: 'json' | 'sarif' = 'json') => `${BASE}/scans/${id}/report?fmt=${kind}`,
}

export const streamUrl = (id: number | string) => `${BASE}/scans/${id}/stream`
export const eventsUrl = (id: number | string, afterSeq = 0) => `${BASE}/scans/${id}/events?after_seq=${afterSeq}`
