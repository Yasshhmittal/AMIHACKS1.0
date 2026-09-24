# SentinelAPI — Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ UI  (React + TS + Vite)  New Scan · Live · Results · Finding    │
│                          Detail · Access Matrix · Report        │
└───────────────┬────────────────────────────────────────────────┘
                │ REST + SSE
┌───────────────▼────────────────────────────────────────────────┐
│ SENTINEL ENGINE (FastAPI)                                       │
│                                                                 │
│ 1 INGEST     prance parser → normalized Endpoint model          │
│ 2 GUARD      allowlist · budget · circuit breaker · no redirect │
│ 3 ★ CORE     httpx executor → Access Matrix sweep (8 phases)    │
│              detectors: BOLA · BFLA · Exposure · BrokenAuth     │
│                         RateLimit · Misconfig                   │
│              response comparator → differential decision        │
│ 4 EVIDENCE   redacted request/response · cURL PoC · fingerprint │
│              risk engine (transparent rubric)                   │
│ 5 PERSIST    SQLite via SQLModel (targets…scans…findings…events)│
│ 6 🤖 HELPER  explainer · summarizer (never decides)             │
│ 7 OUTPUT     dashboard · report · JSON · SARIF · CLI exit code  │
└───────────────┬────────────────────────────────────────────────┘
                │ HTTP — allowlisted targets only
┌───────────────▼────────────────────────────────────────────────┐
│ SENTINELSHOP (vulnerable sandbox, 8 seeded flaws, fix toggles)  │
└────────────────────────────────────────────────────────────────┘
```

## The Access Matrix

Authorization is a property of the `(identity, endpoint, object)` triple. One
systematic sweep produces every finding class from one request budget and one
evidence pipeline.

```
                      anon   userA   userB   admin
GET  /users/me         401    200     200     200   ← exposure check on every 2xx body
GET  /orders/{id}      401    200*    200*    200
GET  /admin/users      401    200!    200!    200
POST /auth/login       200    200     200     200   ← rate-limit probe

* 2xx where returned object's owner ≠ caller      → BOLA
! 2xx where spec restricts to a higher privilege  → BFLA
```

### Sweep phases (`engine/core/sweep.py`)
```
1 INVENTORY  parse spec; classify object_bearing / admin_scoped / spec_secured
2 SEED       each identity calls collection endpoints → learns REAL owned object IDs
3 BASELINE   every readable endpoint × every identity (GET only; no blind writes)
4 CROSS      object-bearing endpoints: caller ≠ owner, using owner's object ID → BOLA
5 ANON       every spec_secured endpoint with no credentials → Broken Auth
6 DERIVE     BFLA (admin endpoints), rate-limit (login), misconfig (headers/CORS/debug)
7 CONFIRM    re-run decisive requests; dedup by fingerprint
8 SCORE+EMIT rubric → evidence → SSE events + persisted result
```

## BOLA — the hero detector (`engine/detectors/bola.py`)

| Probe | Request | Purpose |
|---|---|---|
| P1 victim baseline | userB → GET /orders/{bob} | object exists; capture expected body |
| **P2 attack** | **userA → GET /orders/{bob}** | the test |
| P3 attacker baseline | userA → GET /orders/{alice} | attacker session works |
| P4 anonymous control | anon → GET /orders/{bob} | endpoint is meant to be protected |
| P5 stub control | userA → GET /orders/99999 | API isn't returning the same data for any id |
| P6 repeat | userA → GET /orders/{bob} | reproducible |

**Rule:** a `2xx` alone is never a finding. The owner field in the body must
resolve to the victim. If ownership can't be proven, we report `POTENTIAL`,
never `VERIFIED`. Ownership uses the spec's `x-sentinel-collection-hints`
(`{path, idField, ownerField}`) — a limitation we state plainly, because no
scanner can infer ownership semantics for an arbitrary API without a hint or a
schema-analysis pass.

## Comparator (`engine/core/comparator.py`) — the false-positive killer
`canonicalize` (sort keys, coerce `102`↔`"102"`) · `unwrap_envelope`
(`data`/`items`/`results`) · `learn_volatility` (diff two identical requests →
prune timestamps/request-ids) · `find_owner_field` · `find_sensitive_fields`
(name + bcrypt/JWT value patterns) · `body_equivalent`.

## Severity rubric (`engine/core/risk_engine.py`)
Additive, transparent, shown factor-by-factor in the UI ("Why this severity").
Called *SentinelAPI's internal rubric*, never "CVSS".
`90–100 CRITICAL · 70–89 HIGH · 40–69 MEDIUM · 20–39 LOW · 0–19 INFO`.

## Data model (SQLite / SQLModel — `engine/models/tables.py`)
`Target · Identity · Spec · Endpoint · Scan · MatrixCell · Probe · Finding · ScanEvent`.
Findings are unique per `(scan, fingerprint)`; a fingerprint is
`sha256(target + class + operation_id + param + attacker_role)` and powers dedup
and fix-tracking.

## AI boundary (`engine/ai/`)
`get_ai_provider()` returns Groq when a key is present, else `NullProvider`
(template text). Every scan produces **identical findings** with AI disabled.
The model may only explain, summarize, or propose (validated) extra tests — it
cannot create a finding, change severity/confidence, or add a target, and it
never receives tokens, bodies, or customer data.
