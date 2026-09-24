import type { Endpoint, Finding, Identity, Poc, Scan, ScanEvent, Summary, Target } from '../types'

// VITE_USE_FIXTURE=true runs on src/fixtures/scan-result.sample.json (backend delivers it at H03)
const fx: any = Object.values(import.meta.glob('../fixtures/scan-result.sample.json', { eager: true }))[0]
export const fixture = fx?.default ?? fx
const useFx = import.meta.env.VITE_USE_FIXTURE === 'true' && !!fixture

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${url} failed (${r.status}): ${(await r.text()).slice(0, 200)}`)
  return r.json()
}
const post = <T>(u: string, b?: unknown) =>
  http<T>(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) })
const fromFx = <T>(v: T) => Promise.resolve(v)

export const api = {
  createTarget: (b: { base_url: string; environment: string }) => post<Target>('/api/targets', b),
  uploadSpec: (id: number, file: File) => { const f = new FormData(); f.append('file', file); return http<{ endpoints: Endpoint[] }>(`/api/targets/${id}/spec`, { method: 'POST', body: f }) },
  setIdentities: (id: number, b: Identity[]) => post(`/api/targets/${id}/identities`, b),
  verify: (id: number) => post<{ results: { identity: string; ok: boolean; status: number }[] }>(`/api/targets/${id}/verify`),
  startScan: (b: { target_id: number; checks: string[] }) => post<{ scan_id: number }>('/api/scans', b),
  scan: (id: string) => useFx ? fromFx<Scan>(fixture.scan) : http<Scan>(`/api/scans/${id}`),
  events: (id: string, after: number) => http<ScanEvent[]>(`/api/scans/${id}/events?after_seq=${after}`),
  findings: (id: string) => useFx ? fromFx<Finding[]>(fixture.findings) : http<Finding[]>(`/api/scans/${id}/findings`),
  summary: (id: string) => useFx ? fromFx<Summary>(fixture.summary) : http<Summary>(`/api/scans/${id}/summary`),
  finding: (id: string) => useFx ? fromFx<Finding>(fixture.findings.find((f: Finding) => String(f.id) === id)) : http<Finding>(`/api/findings/${id}`),
  poc: (id: number) => http<Poc>(`/api/findings/${id}/poc`),
  reverify: (id: number) => post<{ status: 'still-vulnerable' | 'fixed' }>(`/api/findings/${id}/verify`),
  explain: (id: number) => post<{ explanation_md?: string; ai_explanation_md?: string }>(`/api/findings/${id}/explain`),
  applyFix: (vulnId: string) => post(`/api/demo/fix/${vulnId}`, { enabled: true }),
  reset: () => post('/api/demo/reset'),
}
