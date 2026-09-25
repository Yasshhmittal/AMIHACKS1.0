import type { Severity } from '../types'

export const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']

export const sevColor: Record<Severity, string> = {
  CRITICAL: 'var(--color-sev-critical)',
  HIGH: 'var(--color-sev-high)',
  MEDIUM: 'var(--color-sev-medium)',
  LOW: 'var(--color-sev-low)',
  INFO: 'var(--color-sev-info)',
}

export const sevRank: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 }

export const OWASP_LABEL: Record<string, string> = {
  BOLA: 'Broken Object Level Authorization',
  BFLA: 'Broken Function Level Authorization',
  EXCESSIVE_DATA_EXPOSURE: 'Excessive Data Exposure',
  BROKEN_AUTH: 'Broken Authentication',
  RATE_LIMITING: 'Unrestricted Resource Consumption',
  MISCONFIGURATION: 'Security Misconfiguration',
  SPEC_DRIFT: 'Improper Inventory Management',
}

export const CHECK_DEFS = [
  { id: 'bola', label: 'BOLA', owasp: 'API1', help: 'One user reading another user’s objects' },
  { id: 'broken_auth', label: 'Broken Authentication', owasp: 'API2', help: 'Secured endpoints reachable without a valid token' },
  { id: 'data_exposure', label: 'Excessive Data Exposure', owasp: 'API3', help: 'Responses leaking sensitive or undocumented fields' },
  { id: 'rate_limit', label: 'Rate Limiting', owasp: 'API4', help: 'Auth endpoints with no throttling' },
  { id: 'bfla', label: 'BFLA', owasp: 'API5', help: 'Low-privilege users reaching admin functions' },
  { id: 'misconfig', label: 'Misconfiguration', owasp: 'API8', help: 'Headers, CORS, debug endpoints, version leaks' },
]

export const IDENTITY_ORDER = ['anonymous', 'userA', 'userB', 'admin']

export function statusColor(status: number): string {
  if (status === 0) return 'var(--color-muted)'
  if (status >= 200 && status < 300) return 'var(--color-lime2)'
  if (status === 401 || status === 403) return 'var(--color-ink2)'
  if (status === 404) return 'var(--color-muted)'
  if (status >= 500) return 'var(--color-sev-critical)'
  return 'var(--color-sev-medium)'
}

export function fmtMs(ms?: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

export function classify(status: number, _secured: boolean, mismatch: boolean): 'ok' | 'violation' | 'denied' | 'warn' | 'none' {
  if (status === 0) return 'none'
  if (mismatch) return 'violation'
  if (status === 401 || status === 403) return 'denied'
  if (status >= 200 && status < 300) return 'ok'
  if (status === 404) return 'none'
  return 'warn'
}
