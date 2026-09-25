export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
export type Confidence = 'VERIFIED' | 'POTENTIAL'

export interface Target {
  id: number
  base_url: string
  environment: string
  attested_by?: string | null
  attested_at?: string | null
}

export interface Identity {
  label: string
  role: string
  user_id?: string
  credential?: string
  credential_type?: 'bearer' | 'password' | 'api_key'
  login_url?: string
  login_body?: Record<string, any>
}

export interface Endpoint {
  id: number
  spec_id: number
  method: string
  path: string
  operation_id?: string | null
  summary?: string | null
  spec_secured: boolean
  object_bearing: boolean
  admin_scoped: boolean
}

export interface SpecUpload {
  spec_id: number
  endpoint_count: number
  secured_count: number
  object_bearing_count: number
  admin_count: number
  endpoints: Endpoint[]
}

export interface Scan {
  id: number
  target_id: number
  spec_id: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted'
  phase?: string | null
  requests_used: number
  duration_ms?: number | null
  risk_score?: number | null
  started_at?: string | null
  finished_at?: string | null
  total_findings: number
  findings_by_severity: Record<string, number>
}

export interface ScoreFactor { description: string; weight: number; applied: boolean }

export interface Probe {
  id: number
  label: string
  identity: string
  status: number
  latency_ms?: number | null
  request_json_redacted: { method: string; url: string; headers: Record<string, string>; body?: unknown }
  response_json_redacted: { status: number; headers: Record<string, string>; body: unknown }
}

export interface Finding {
  id: number
  scan_id: number
  fingerprint: string
  class: string
  owasp_id: string
  severity: Severity
  risk_score: number
  confidence: Confidence
  title: string
  impact?: string | null
  remediation?: string | null
  score_factors: ScoreFactor[]
  expected?: string | null
  actual?: string | null
  endpoint?: string | null
  vuln_id?: string | null
  state: 'open' | 'fixed'
  ai_explanation_md?: string | null
  probes?: Probe[]
}

export interface MatrixCell {
  id: number
  scan_id: number
  endpoint_id?: number | null
  method: string
  path: string
  identity: string
  object_id?: string | null
  object_owner?: string | null
  status: number
  duration_ms?: number | null
  ownership_mismatch: boolean
  undocumented_fields: string[]
  sensitive_fields: string[]
}

export interface ScanEvent { seq: number; type: string; payload: Record<string, any> }

export interface Summary {
  scan_id: number
  text: string
  provider: string
  total_endpoints: number
  total_requests: number
  findings_by_severity: Record<string, number>
  findings_by_class: Record<string, number>
  risk_score: number
}
