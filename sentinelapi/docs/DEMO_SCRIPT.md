# SentinelAPI — 4-Minute Demo Script

**Two presenters. A drives the browser, B narrates.**

### Pre-demo checklist (every time)
- `POST /api/demo/reset` (or the "Reset sandbox" button) — fix toggles all `false`.
- Fresh browser profile · notifications off · backup video open.
- `docker compose up` (or the two uvicorn processes) verified green.

---

**0:00–0:20 · Problem (B).**
"An API can pass every functional test and still hand one customer another
customer's data. Signature scanners can't see that — nothing is 'broken'.
SentinelAPI finds it, proves it, and verifies the fix."

**0:20–0:45 · Ingest.**
Upload `sentinelshop/openapi.yaml` → "N endpoints · N secured · N object-bearing".
"Sandbox-only, explicitly authorized — the engine refuses anything else."

**0:45–1:20 · Live scan.**
"We don't trust the spec, the status code, or the identity — every endpoint
against every identity. Every line on this screen is a real engine event over SSE."

**1:20–2:00 · The finding.**
Open the Critical BOLA. "userA asked for order 102; it belongs to userB. We
don't call it a vulnerability because of the 200 — we call it one because the
owner field in the body is userB (`owner=2`), six probes ran, four of them exist
to prove ourselves wrong, and the decisive request reproduced." Show the "Why
this severity" factors (90 → CRITICAL).

**2:00–2:40 · Proof + fix.**
Copy the PoC and run it live in a terminal → **Re-verify** (still vulnerable) →
**Apply fix** (sandbox) → **Re-verify** → **403, FIXED**. "Re-verify re-executes
the real request — it is never cached."

**2:40–3:10 · Matrix + breadth.**
Access Matrix: "One sweep, six classes — BOLA, broken auth, BFLA, data exposure,
plus rate limiting and misconfiguration."

**3:10–3:40 · AI + CI.**
Click **Explain** → plain-English impact + Django/FastAPI/Express fix. "The
model explains and can propose tests; only the engine decides." Terminal:
`python cli/sentinel.py scan --fail-on high` → exit code 1. "Spec in, proof out,
deploy blocked."

**3:40–4:00 · Close (B).**
"We uploaded an API spec. SentinelAPI refused to trust it, tested every endpoint
against every identity, proved one customer could read another's order, showed
the exact request and response, explained why it's Critical, told us how to fix
it — and then verified the fix worked. The AI explains; the proof is in the
HTTP evidence."

---

### Q&A ammunition
- **False positive?** Ownership proven from the body, six probes incl.
  stub/anonymous/repeat controls, plus a repeat confirmation. Status alone is
  never sufficient. Unprovable ownership → `POTENTIAL`.
- **Just an LLM wrapper?** Every seeded flaw is found with AI disabled. The
  model only explains or proposes; proposals are validated and it cannot create
  a finding.
- **Scanning a site you don't own?** Engine-level allowlist before any socket
  opens, attestation, budget, circuit breaker, redirects off.
- **Crash the target?** Bounded concurrency, timeouts, circuit breaker;
  destructive methods only on scanner-created objects.
