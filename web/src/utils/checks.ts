// Detector classes offered on New Scan. `id` is what POST /api/scans receives in checks[]; confirm ids with backend.
export const CHECKS = [
  { id: 'BOLA', label: 'Object-level access (API1)', help: 'Can one user read or change another user\'s records?' },
  { id: 'BROKEN_AUTH', label: 'Broken authentication (API2)', help: 'Do endpoints accept missing, weak, or invalid credentials?' },
  { id: 'EXCESSIVE_DATA_EXPOSURE', label: 'Excessive data exposure (API3)', help: 'Do responses include fields the spec never documented?' },
  { id: 'RATE_LIMITING', label: 'Rate limiting (API4)', help: 'Does the API throttle repeated requests?' },
  { id: 'BFLA', label: 'Function-level access (API5)', help: 'Can normal users call admin-only endpoints?' },
  { id: 'MISCONFIGURATION', label: 'Misconfiguration (API8)', help: 'Are headers, CORS, and error messages set safely?' },
]
export const PHASES = ['INVENTORY', 'SEED', 'BASELINE', 'CROSS', 'ANON', 'DERIVE', 'CONFIRM', 'SCORE']
