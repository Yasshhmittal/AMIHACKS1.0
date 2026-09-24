export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
export interface Target { id: number; base_url: string; environment: 'sandbox' | 'staging' | 'production'; attested_by: string; attested_at: string }
export interface Identity { id?: number; target_id?: number; label: string; role: string; user_id: string; credential?: string }
export interface Endpoint { id: number; spec_id: number; method: string; path: string; operation_id: string; summary: string; spec_secured: boolean; object_bearing: boolean; admin_scoped: boolean }
export interface Scan { id: number; target_id: number; spec_id: number; status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted'; phase: string; requests_used: number; duration_ms: number; risk_score: number; started_at: string; finished_at: string | null }
export interface Probe { id: number; scan_id: number; finding_id: number | null; label: string; identity: string; request_json_redacted: { method: string; url: string; headers: Record<string, string>; body?: unknown }; response_json_redacted: { status: number; headers: Record<string, string>; body: unknown }; status: number; latency_ms: number }
export interface ScoreFactor { description: string; weight: number; applied: boolean }
export interface Finding {
  id: number; scan_id: number; fingerprint: string; class: string; owasp_id: string; severity: Severity; risk_score: number
  confidence: 'VERIFIED' | 'POTENTIAL'; title: string; impact: string; remediation: string; score_factors: ScoreFactor[]
  expected: string; actual: string; state: 'open' | 'fixed'; ai_explanation_md: string | null; probes?: Probe[]
  endpoint?: string; vuln_id?: string // NOT in the handoff interface: ask backend to include
}
export interface ScanEvent { id?: number; scan_id?: number; seq: number; type: string; payload: any; t?: number }
export interface Summary { text: string; total_endpoints: number; total_requests: number; findings_by_severity: Record<string, number>; findings_by_class: Record<string, number>; risk_score: number }
export interface Poc { curl: string; httpie?: string; python?: string }
