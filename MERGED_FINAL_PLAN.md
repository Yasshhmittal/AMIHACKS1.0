# SentinelAPI — Merged Final Plan

**AmiHacks · Track C / Problem Statement 3 · Zero-Trust API Vulnerability Scanner**
**Team: 2 · Window: 24h · Feature freeze: H19**
**Merges:** `FINAL_IMPLEMENTATION_PLAN.md` (backbone: scope discipline, Access Matrix, zero-trust axioms, gates) + `PLAN.md` (stack, control probes, misconfig checks, circuit breaker, diagrams).

---

## 0. Decisions already made (do not re-debate during the hackathon)

| Decision | Choice | Why |
|---|---|---|
| Engine + backend | **Python 3.11, FastAPI, httpx (async)** | Scanner is network-bound; C++ gives no real speed benefit and is the biggest build risk. Problem statement says stack is open. *(If Owner 1 is strongly fluent in C++ you may keep the C++ engine from the final plan; everything else here still applies.)* |
| Spec parsing | `prance` (+ `openapi-spec-validator`) — resolves `$ref`, JSON + YAML | Solved problem, don't hand-roll |
| Frontend | React 18 + TypeScript + Vite + Tailwind (+ Recharts, React Flow only if time) | From PLAN.md |
| Database | **SQLite** (WAL) via SQLModel | Zero infrastructure; one less service than Postgres |
| Live updates | **SSE** (simpler than WebSocket) with event sequence numbers | Replay-safe, polling fallback is trivial |
| AI | Groq behind a provider interface + **NullProvider** fallback | Scanner works with AI fully off |
| Packaging | **Docker Compose, 2 services:** `sentinel` (API + built UI) and `sentinelshop` (demo target) | Whole stack runs offline on a laptop |
| CI/CD | CLI with exit codes (`--fail-on high`) + a ~15-line GitHub Action YAML | Cheap because the CLI already exists |

### Core principle (non-negotiable)

> **AI suggests. The scanner executes. Evidence verifies.**

```
BAD:   API → LLM → "I think this is vulnerable"          (unfalsifiable)
GOOD:  API → Scanner → Evidence → AI → "Here's why and how to fix it"
```

### The five zero-trust axioms (this is what "Zero-Trust" means in the build)

1. **Never trust the spec** — the OpenAPI doc is a claim. We test what it says (spec drift = finding).
2. **Never trust the status code** — a `200` is not authorization; ownership is proven from the response body.
3. **Never trust the identity** — every endpoint is probed with every identity (anon, A, B, admin).
4. **Never trust the model** — AI can only *propose* extra tests; only the deterministic engine can create a finding.
5. **Never trust the operator** — allowlist, request budget, circuit breaker, and redaction are enforced in the engine, not the UI.

---

## 1. Scope

### 1.1 MUST ship (critical path — stop at the last green item and everything above still demos)

1. **SentinelShop** demo API with 8 seeded flaws, deterministic seed data, fix toggles.
2. OpenAPI 3.x ingestion (JSON + YAML) → normalized endpoint inventory.
3. Endpoint classification: `object_bearing`, `admin_scoped`, `spec_secured`.
4. Identity config: anonymous, userA (attacker), userB (victim), admin.
5. **Access Matrix sweep** (endpoint × identity).
6. **BOLA** with 6-probe control set + ownership proof + repeat confirmation.
7. **Excessive data exposure** (undocumented fields + sensitive-name/value patterns).
8. **Broken Auth** + **BFLA** (derived from the same matrix — nearly free).
9. **Missing rate limiting** on login (20 controlled requests).
10. **Misconfiguration-lite:** security headers, reflected CORS, exposed debug endpoints, version disclosure.
11. Redacted evidence + reproducible cURL PoC for every finding.
12. Transparent severity rubric with visible score factors; two-state confidence.
13. Live scan progress streamed from real engine events (SSE).
14. UI: **6 screens** (see §8).
15. **Report page** (HTML/markdown, print-to-PDF) for non-technical readers.
16. **Re-verify** (re-runs the real test) + **Apply fix in sandbox** (fix toggles).
17. CLI + exit codes; safety guard (allowlist, budget, circuit breaker).

### 1.2 SHOULD ship (only after §1.1 is stable)

18. AI layer: explainer, scan summary, bounded hypothesis generation (§6).
19. SARIF export + GitHub Action YAML.
20. Authorization graph (React Flow) — reuses matrix data.
21. Attack Replay tab (step through probes P1–P6 on the finding page — data already stored).

### 1.3 CUT (write on the whiteboard, line through them)

Chatbot, SSRF, mass assignment, HAR/live-traffic import, agentic multi-step chains, trend dashboards, PDF library (use browser print), 13-screen UI, GraphQL/gRPC/SOAP, Swagger 2.0, scanning any non-sandbox target.

> **Governing rule:** never trade a verified, evidence-backed BOLA demo for another feature. A scanner that proves a few things beats one that suspects many (the problem statement says the same).

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ UI LAYER   React + TS + Vite   Upload · Live Scan · Findings │
│            Matrix · Finding Detail · Report                  │
└───────────────┬──────────────────────────────────────────────┘
                │ REST + SSE
┌───────────────▼──────────────────────────────────────────────┐
│ SENTINEL ENGINE (FastAPI)                                    │
│                                                              │
│ 1 INGEST     prance parser → normalized Endpoint model       │
│ 2 PLAN       test matrix (endpoint × detector × identity)    │
│              🤖 AI priority/hypotheses (optional, validated) │
│ 3 GUARD      allowlist · budget · circuit breaker · no redir │
│ 4 ★ CORE     HTTP executor → Access Matrix sweep             │
│              detectors: BOLA · BFLA · Exposure · BrokenAuth  │
│                         RateLimit · Misconfig                │
│              Response comparator → Differential Oracle       │
│              → VULNERABLE / SAFE / SKIP / INCONCLUSIVE       │
│ 5 EVIDENCE   request/response bundles · PoC · redaction      │
│              Risk engine (rubric) · fingerprints             │
│ 6 🤖 HELPER  explainer · summarizer (never decides)          │
│ 7 OUTPUT     dashboard · report · JSON · SARIF · CLI exit    │
└───────────────┬──────────────────────────────────────────────┘
                │ HTTP — allowlisted targets only
┌───────────────▼──────────────────────────────────────────────┐
│ SENTINELSHOP (vulnerable sandbox, ~14 endpoints, fix toggles)│
└──────────────────────────────────────────────────────────────┘
```

---

## 3. The Access Matrix (core engine concept)

Authorization is a property of the **(identity, endpoint, object)** triple. One systematic sweep produces every finding class from one request budget and one evidence pipeline.

```
                      anon   userA   userB   admin
GET  /users/me         401    200     200     200   ← exposure check on every 2xx body
GET  /users/{id}       401    200*    200*    200
GET  /orders/{id}      401    200*    200*    200
GET  /admin/users      401    200!    403     200
POST /auth/login       200    200     200     200

* 2xx where returned object's owner ≠ caller      → BOLA
! 2xx where spec restricts to a higher privilege  → BFLA
```

### 3.1 Sweep phases

```
1 INVENTORY   parse spec; classify object_bearing / admin_scoped / spec_secured
2 SEED        each identity calls collection endpoints → learns REAL owned object IDs
3 BASELINE    every endpoint × every identity, using that identity's OWN object
4 CROSS       object-bearing endpoints: caller ≠ owner, using owner's object ID
5 ANON        every spec_secured endpoint with no credentials
6 DERIVE      apply decision rules → candidate findings
7 CONFIRM     re-run each candidate's decisive request → VERIFIED or POTENTIAL
8 SCORE+EMIT  rubric → evidence → SSE events + scan-result.json
```

Budget sanity: demo sandbox ≈ 60 requests; default `max_requests = 500`.

### 3.2 BOLA — the hero detector (FINAL's ownership proof + PLAN's control probes)

| Probe | Request | Purpose |
|---|---|---|
| P1 Victim baseline | userB → `GET /orders/{bob_id}` | Object exists; capture expected body |
| **P2 Attack** | **userA → `GET /orders/{bob_id}`** | **The test** |
| P3 Attacker baseline | userA → `GET /orders/{alice_id}` | Attacker session works |
| P4 Anonymous control | anon → `GET /orders/{bob_id}` | Not a public endpoint |
| P5 Stub control | userA → `GET /orders/99999` | API doesn't return data for any ID |
| P6 Repeat | userA → `GET /orders/{bob_id}` | Reproducible |

```python
def evaluate_bola(p1, p2, p3, p4, p5, p6, ep, alice, bob):
    if p1.status != 200:  return SKIP("victim baseline failed")
    if p3.status != 200:  return SKIP("attacker session invalid")
    if p4.ok and not ep.spec_secured: return INFO("public by design")
    if p2.status in (401, 403, 404):  return SAFE("authorization enforced")
    if p5.ok and body_equivalent(p2, p5): return SAFE("stub: same data for any ID")
    owner = find_owner_field(p2.body, hint=ep.owner_hint)   # from collectionHints
    if owner == alice.id: return SAFE("attacker viewing own data")
    if owner != bob.id:   return INCONCLUSIVE("ownership could not be proven")
    if not body_equivalent(p2, p6): return INCONCLUSIVE("not reproducible")
    return VULNERABLE("BOLA", confidence="VERIFIED", evidence=[p1,p2,p3,p4,p5,p6])
```

Key rule: **a 2xx alone is never a finding.** The owner field in the body must resolve to the victim. If ownership can't be proven, report `POTENTIAL`, never `VERIFIED`.

`collectionHints` (state this limitation plainly to judges — precision about limits reads as competence):
`[{"path":"/orders","idField":"id","ownerField":"userId"}, ...]`

### 3.3 Decision rules for the other classes

| ID | Class | Rule (exact boolean) | OWASP 2023 |
|---|---|---|---|
| F1 | BOLA | see 3.2 | API1 |
| F2 | Excessive Data Exposure | 2xx JSON contains a field path that is undocumented in the response schema **or** matches a sensitive name/value pattern | API3 |
| F3 | Broken Authentication | spec declares security, anon (or malformed/empty/wrong-scheme token) gets 2xx with non-empty body; valid token control returns 2xx | API2 |
| F4 | BFLA | low-privilege identity gets 2xx on an admin-scoped endpoint; admin control returns 2xx; anon returns 401 | API5 |
| F5 | Rate limiting | 20 sequential failed logins (distinct usernames, no lockout) → no 429, no `Retry-After` / `RateLimit-*` headers | API4 |
| F6 | Misconfiguration | missing HSTS/`X-Content-Type-Options`/`X-Frame-Options`; CORS reflects arbitrary `Origin` with credentials; `/debug`, `/.env`, `/actuator` return 200; `Server`/`X-Powered-By` version leak; stack trace in error body | API8 |
| F7 | Spec drift | documented security requirement not enforced, or undocumented status/fields at scale | API9 |

Sensitive-name patterns (case-insensitive on flattened paths like `items[].sku`, `owner.internalNotes`):
`password, passwordhash, *_hash, salt, secret, token, apikey, privatekey, ssn, aadhaar, cardnumber, cvv, otp, internal, adminflag, refreshtoken, sessionid, credit_score`
Value patterns: bcrypt `^\$2[aby]\$`, JWT `^eyJ`, Luhn-valid card numbers.

**Environment scoping:** on localhost/127.0.0.1, TLS/HSTS checks emit INFO, not findings.

### 3.4 Response comparator (false-positive killer)

`canonicalize()` (sort keys, normalize types) · `unwrap_envelope()` (`data`/`items`/`results`) · `learn_volatility()` (diff two identical requests, prune timestamps/request IDs/ETags) · `find_owner_field()` · `find_sensitive_fields()` · `victim_unique_overlap()` · `body_equivalent()`.

**Gotcha (from final plan):** convert JSON scalars to plain strings before comparing IDs — `str(102)` vs `"102"`; never compare a serialized value that still contains quotes.
**Gotcha:** in OpenAPI, operation-level `security: []` means *explicitly public* and overrides the document default:

```python
def resolve_spec_secured(op, spec):
    if "security" in op:   return len(op["security"]) > 0
    if "security" in spec: return len(spec["security"]) > 0
    return False
```

---

## 4. SentinelShop (demo target) — build FIRST

In-memory seed data, reset via `POST /__reset`. Control-plane routes (`/__reset`, `/__fixes`) are **excluded from `openapi.yaml`**. The spec documents the *intended secure* contract; flaws live only in the implementation.

**Identities:** alice (id 1, user) · bob (id 2, user) · admin (id 9, admin) · anonymous.
**Orders:** 101→alice, 102→bob, 103→alice, 104→bob.

| ID | Endpoint | Flaw | Detector | Expected severity |
|---|---|---|---|---|
| V1 | `GET /orders/{id}` | BOLA read (the hero) | BOLA | Critical |
| V2 | `GET /users/{id}` | BOLA on profile | BOLA | High/Critical |
| V3 | `GET /admin/users` | BFLA (role not checked) | BFLA | High |
| V4 | `GET /users/me` | Leaks `passwordHash`, `internalNotes`, `creditScore` | Exposure | High |
| V5 | `GET /invoices` | Spec says secured, no auth check | Broken Auth | Critical/High |
| V6 | `POST /auth/login` | No rate limiting | Rate limit | Medium |
| V7 | `GET /debug/config` + CORS reflect + missing headers | Misconfiguration | Misconfig | Medium/Low |
| V8 | `DELETE /orders/{id}` | BOLA write *(stretch — only against scanner-created objects)* | BOLA | Critical |

Routes (~14): `POST /auth/login`, `POST /auth/register`, `GET /users/me`, `GET /users/{id}`, `GET /orders`, `POST /orders`, `GET /orders/{id}`, `DELETE /orders/{id}`, `GET /admin/users`, `GET /admin/dashboard`, `GET /invoices`, `GET /debug/config`, `GET /health`, `POST /auth/logout`.

### Fix toggles (powers the closing demo moment)

```js
const fixes = { FIX_BOLA_ORDERS:false, FIX_BOLA_USERS:false, FIX_BFLA_ADMIN:false,
                FIX_EXPOSURE_ME:false, FIX_AUTH_INVOICES:false, FIX_RATELIMIT:false, FIX_MISCONFIG:false };
// POST /__fixes {"FIX_BOLA_ORDERS":true}  → live patch
```

Demo sequence: `CRITICAL BOLA VERIFIED → Re-verify (still vulnerable) → Apply fix → Re-verify → FIXED (403)`.
`reverify` **must** re-execute against the live sandbox. A cached result makes the product's central claim false.

**Hand-verify every flaw with `curl` before writing any scanner code.**

---

## 5. Severity, confidence, evidence

### 5.1 Severity — additive rubric with visible factors (call it "SentinelAPI's internal rubric", never "CVSS")

```
FACTOR                                              WEIGHT
Authorization boundary crossed                        +40
Cross-identity private data returned                  +30
Administrative function reachable by low-priv user    +20
Credential material in response (hash/secret/token)   +30
Sensitive field names present in response             +20
Exploitable by low-privilege authenticated user       +10
Exploitable with no credentials at all                +15
State-changing method succeeded                       +10
Auth endpoint lacks throttling                        +40
Hardening gap (headers / CORS / debug exposure)       +20
Undocumented behavior only, no data impact             +5
Repeat verification succeeded                         +10
Repeat verification diverged                          -20

90–100 CRITICAL · 70–89 HIGH · 40–69 MEDIUM · 20–39 LOW · 0–19 INFO
```

The UI shows exactly which factors fired ("Why this severity" panel). Tune weights at H12–14 so the seeded flaws land at the severities in §4. Optional stretch: emit CVSS v3.1 vector alongside, clearly labeled.

### 5.2 Confidence — two states only

- `POTENTIAL` — rule matched once (or ownership couldn't be proven).
- `VERIFIED` — rule matched **and** the decisive request re-ran with identical outcome.

Verified = solid badge, Potential = outlined badge. **No fake percentages** (e.g. "98%") — they can't be defended.

### 5.3 Evidence

Per finding: baseline + attack request/response (redacted), expected vs actual, leaked field names, controls passed (P1–P6 checklist), timestamps, and a cURL PoC using placeholders (`$USER_A_TOKEN`). Optional: HTTPie/Python PoC variants.
Redaction: `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key` headers and sensitive body **values** replaced with `***redacted***` (sensitive key **names** are reported — that's the finding). Bodies truncated to 8 KB. Second redaction pass at the API layer before SSE/DB/LLM.
Fingerprint: `sha256(target + class + operation_id + param + attacker_role)` → dedup + fix tracking.

---

## 6. AI layer — strictly bounded (build only after §1.1 is green)

| Feature | What it does | Fallback |
|---|---|---|
| **Explainer** | Evidence bundle → plain-English impact + framework-specific fix snippet (FastAPI/Django/Express) | Template text from the finding class |
| **Summarizer** | Executive scan summary ranked by priority | Template summary |
| **Hypothesis generator** | Reads sanitized endpoint metadata (method, path, summary, param names, schema field names, declared security) → structured hypotheses | Skipped; scan unchanged |

**What the model never receives:** tokens, passwords, cookies, response bodies, customer data. The prompt is built from the parsed spec only.
**What the model never does:** create a finding, change severity/confidence, add a target.
**Validation gate:** a hypothesis is rejected unless it references an existing endpoint, an allowlisted host, only real parameters, a known category, and fits the remaining request budget. Survivors become *extra test cases*; the engine still decides.
Models (Groq free tier): `llama-3.3-70b-versatile` for reasoning, `llama-3.1-8b-instant` for classification.

The line for judges:
> *"The model proposed this test. The engine executed it. The evidence confirmed it. If the model was wrong, there would be no finding — that's the point."*

Every scan must produce identical findings with `NullProvider`.

---

## 7. Safety controls (each is a demo talking point)

| Control | Where |
|---|---|
| Target allowlist (`localhost`, `127.0.0.1`, `sentinelshop`, private ranges); public targets need explicit `SENTINEL_ALLOW_PUBLIC=1` | `core/guard.py`, checked before any socket opens |
| "I am authorized to test this target" attestation checkbox, stored with the scan | UI + `Target` record |
| Request budget + wall-clock deadline | `guard.py` |
| **Circuit breaker:** abort if error rate > 30% or latency triples | `guard.py` (from PLAN.md) |
| Bounded concurrency (max 5) | executor semaphore |
| Redirects disabled (`follow_redirects=False`) | executor |
| Destructive methods only against scanner-created objects | detectors |
| Tokens encrypted at rest (Fernet), never logged, never in argv/URLs, `<TOKEN>` placeholders in PoCs | `core/session.py`, `core/redact.py` |
| LLM receives no runtime data | `ai/` |

Write `docs/THREAT_MODEL.md` (30 min): what it may do, what it cannot do, what an attacker who compromised it gains (disposable sandbox tokens only), why the allowlist lives in the engine.

---

## 8. Frontend — 6 screens (not 13)

Dark, high-contrast security-console look (matches your diagrams). Severity is the only saturated color: Critical `#dc2626` · High `#ea580c` · Medium `#ca8a04` · Low `#2563eb` · Info `#64748b`. Monospace for all requests/paths/headers. Pair color with a text label always. Permanent `TARGET MODE: SANDBOX / AUTHORIZED` badge on every scan screen.

1. **New Scan** — spec upload (parse summary appears immediately: "N endpoints · N secured · N object-bearing"), pre-filled sandbox identities + Verify button, check selection, attestation checkbox.
2. **Live Scan** — phase checklist, live log, counters, findings appearing in place. **Every line comes from a real engine event — no `setTimeout`, no fake progress.**
3. **Results / Dashboard** — real counts only (endpoints, requests, findings by severity), filterable findings table with class, endpoint, severity, confidence, OWASP label. Riskiest endpoints list.
4. **Finding Detail** *(most polished page)* — severity + confidence + OWASP badges; **Why this severity** factor list; controls-passed checklist (P1–P6); baseline vs attack side by side with owner field highlighted; expected vs actual; copy PoC; remediation (current vs recommended); buttons **Explain 🤖 · Re-verify · Apply fix**; **Attack Replay tab** (step through probes).
5. **Access Matrix** — endpoint × identity grid, color-coded, click a cell for the raw request/response. Communicates the whole thesis in one screen.
6. **Report** — printable HTML/markdown: executive summary, findings, PoC, remediation; JSON download; SARIF if built.

*Stretch:* Authorization graph (React Flow: identities → resources, red dashed edges on violations).

**UI rules:** no hardcoded finding text in `web/` (grep for `"BOLA"` before the demo); real empty/loading/error states everywhere; helper text under every field so a non-security engineer can start a scan.

---

## 9. Data model (SQLite)

```
Target(id, base_url, environment, attested_by, attested_at)
Identity(id, target_id, label, role, user_id, credential_encrypted)
Spec(id, target_id, raw_hash, parsed_json, endpoint_count)
Endpoint(id, spec_id, method, path, operation_id, summary, spec_secured, object_bearing,
         admin_scoped, params_json, response_fields_json)
Scan(id, target_id, spec_id, status, phase, config_json, requests_used, duration_ms, risk_score, started_at, finished_at)
MatrixCell(id, scan_id, endpoint_id, identity, object_id, object_owner, status, duration_ms,
           ownership_mismatch, undocumented_fields, sensitive_fields)
Probe(id, scan_id, finding_id?, label[P1..P6], identity, request_json_redacted, response_json_redacted, status, latency_ms)
Finding(id, scan_id, fingerprint, class, owasp_id, severity, risk_score, confidence, title, impact,
        remediation, score_factors_json, expected, actual, state[open|fixed], ai_explanation_md)
ScanEvent(id, scan_id, seq, type, payload_json)
```

## 10. API contract (freeze at H03)

```
POST /api/targets                      create + allowlist check + attestation
POST /api/targets/{id}/spec            upload spec → parse summary
POST /api/targets/{id}/identities      configure identities
POST /api/targets/{id}/verify          verify all credentials work
POST /api/scans                        start scan → {scan_id}
GET  /api/scans/{id}                   status + counts
GET  /api/scans/{id}/stream            SSE (seq-numbered events)
GET  /api/scans/{id}/events            polling fallback
GET  /api/scans/{id}/matrix            access matrix cells
GET  /api/scans/{id}/findings          filterable list
GET  /api/findings/{id}                full finding + evidence + probes
GET  /api/findings/{id}/poc            curl/httpie/python
POST /api/findings/{id}/verify         re-run REAL test → still-vulnerable | fixed
POST /api/findings/{id}/explain        AI explanation (cached; template fallback)
GET  /api/scans/{id}/summary           AI/template summary
GET  /api/scans/{id}/report            HTML/markdown report  (+ .json, .sarif)
POST /api/demo/fix/{vuln_id}           toggle sandbox fix
POST /api/demo/reset                   reset sandbox
```

SSE event types: `scan.started · spec.parsed · phase.started · objects.discovered · probe · signal · candidate · confirm.started · finding · scan.completed` (never include tokens/header values).

**Contract freeze deliverable:** Pydantic models for `ScanResult` / `Finding` / `MatrixCell` + a hand-written `web/src/fixtures/scan-result.sample.json`. The frontend is built against the fixture from H03, so both people work fully in parallel.

**CLI** (`sentinel scan --spec api.json --target http://localhost:4000 --config ids.yaml --fail-on high --out result.json`): exit `0` clean · `1` findings ≥ threshold · `2` config/target error · `3` budget/deadline exhausted. Also `sentinel reproduce --finding F-001`.

---

## 11. Repository layout

```
sentinelapi/
├── engine/
│   ├── main.py                     # FastAPI entry (serves built UI too)
│   ├── api/        targets.py scans.py findings.py
│   ├── core/       guard.py session.py executor.py comparator.py oracle.py
│   │               evidence.py risk_engine.py redact.py sweep.py
│   ├── ingest/     openapi_parser.py api_model.py
│   ├── detectors/  base.py bola.py bfla.py data_exposure.py broken_auth.py
│   │               rate_limit.py misconfig.py
│   ├── ai/         provider.py groq_provider.py null_provider.py
│   │               explainer.py summarizer.py hypotheses.py
│   ├── reporting/  json_report.py html_report.py sarif.py
│   ├── models/     db.py schemas.py
│   └── tests/      test_comparator.py test_oracle.py test_rules.py test_redact.py
├── web/            src/{pages,components,hooks,fixtures}
├── sentinelshop/   app.py routes/ vulnerabilities.py fixes.py openapi.yaml
├── cli/            sentinel.py
├── docs/           ARCHITECTURE.md THREAT_MODEL.md DEMO_SCRIPT.md diagrams/
├── .github/workflows/sentinel.yml
├── docker-compose.yml   Dockerfile   Makefile   README.md
```

Write **unit tests for pure functions only** (comparator, oracle decision, `resolve_spec_secured`, scalar→string, field flattening, redaction). 30 minutes, and "we tested the detection rules" is a real answer on code quality.

---

## 12. 24-hour schedule

**Owner A — ENGINE** (`engine/`, `cli/`) · **Owner B — PLATFORM** (`sentinelshop/`, `web/`, Docker, docs)
Three JOINT blocks decide whether this ships: **contract freeze (H02), first integration (H11), clean-room run (H18).**

| Hours | Owner A — Engine | Owner B — Platform |
|---|---|---|
| H00–02 | Repo, FastAPI skeleton, models, guard skeleton, httpx executor | SentinelShop: seed data, login, all 8 flaws, `openapi.yaml`; hand-verify each with `curl` |
| **H02–03** | 🔴 **JOINT: contract freeze** — Pydantic models, SSE events, API list, hand-written fixture | |
| H03–06 | prance ingestion → endpoint inventory + classification; identities + session vault | Vite scaffold, theme, routing, shared components; Results + Finding list against fixture |
| H06–09 | Seed discovery, baseline + cross sweep, comparator, BOLA oracle (P1–P6) — **🎯 H09 MILESTONE: real BOLA finding in JSON** | New Scan page (upload, parse summary, identities); SQLite persistence; SSE plumbing with a stub that replays fixture events |
| H09–11 | Exposure, Broken Auth, BFLA (from matrix), rate-limit probe, misconfig-lite | Live Scan page on the real stream; Report page |
| **H11–12** | 🔴 **JOINT: first integration** — real UI, real engine, real findings persisted | |
| H12–14 | Rubric + score factors, evidence capture + redaction, cURL PoC, `reproduce` / re-verify | Finding Detail: evidence diff, score breakdown, controls checklist |
| H14–16 | Circuit breaker, budget/deadline, CLI + exit codes, unit tests | Fix toggles UI, Re-verify wiring, Access Matrix grid |
| H16–18 | AI: provider + NullProvider, explainer, summarizer, (hypotheses if time) | AI panel, Attack Replay tab, (SARIF + GitHub Action YAML / auth graph if time) |
| **H18** | 🔴 **JOINT: clean-room run** — fresh clone, `docker compose up`, full demo path, no manual steps | |
| **H19** | 🧊 **FEATURE FREEZE** | |
| H19–21 | Bug fixes; loading/empty/error states | `README`, `ARCHITECTURE.md`, `THREAT_MODEL.md`, updated diagrams (see §15) |
| H21–24 | Rehearse demo 5×; record backup video; answer-prep for §14; sleep | |

*Public deployment is optional* (the problem statement doesn't require it). If you want it, do it at H16 not H22, on any Dockerfile host; local Docker Compose remains the primary demo path.

### Gates — if missed, take the action immediately

| Gate | Must be true | Otherwise |
|---|---|---|
| H03 | Contract frozen + fixture exists | Stop all feature work until done |
| H09 | One real BOLA finding in JSON | Owner B pauses UI and pairs on the engine |
| H11 | UI shows a real engine finding | Cut misconfig, exposure, rate limit; ship BOLA + BFLA + broken auth only |
| H16 | Fix toggle → re-verify flips a finding | Cut AI, graph, SARIF; polish what exists |
| H18 | Full demo path works end to end | Cut Attack Replay + Matrix UI; rehearse what exists |

Working agreements: commit to `main` every 30 min; don't edit the other owner's directory without saying so; blocked >15 min → say it out loud; take a real break around H12; if something breaks after H20, revert to last good commit.

---

## 13. Demo script (4 minutes, two presenters)

**A drives the browser, B narrates.**

- **0:00–0:20 Problem (B):** "An API can pass every functional test and still hand one customer another customer's data. Signature scanners can't see that — nothing is 'broken'. SentinelAPI finds it, proves it, and verifies the fix."
- **0:20–0:45 Ingest:** upload `openapi.yaml` → "N endpoints · N secured · N object-bearing". "Sandbox-only, explicitly authorized — the engine refuses anything else."
- **0:45–1:20 Live scan:** "We don't trust the spec, the status code, or the identity — every endpoint against every identity. Every line is a real engine event."
- **1:20–2:00 The finding:** open Critical BOLA. "userA asked for order 102; it belongs to userB. We don't call it a vulnerability because of the 200 — we call it one because the owner field in the body is userB, six probes ran, four of them exist to prove ourselves wrong, and the decisive request reproduced." Show the score factors.
- **2:00–2:40 Proof + fix:** Attack Replay → copy PoC and run it live → **Re-verify** (still vulnerable) → **Apply fix** → **Re-verify** → 403, FIXED.
- **2:40–3:10 Matrix + breadth:** Access Matrix: "One sweep, five classes — BOLA, broken auth, BFLA, data exposure, plus rate limiting and misconfiguration checks."
- **3:10–3:40 AI + CI:** click Explain → plain-English impact + Django/FastAPI fix. "The model explains and can propose tests; only the engine decides." Terminal: `sentinel scan --fail-on high` → exit code 1. "Spec in, proof out, deploy blocked."
- **3:40–4:00 Close:** the two-sentence pitch from §16.

**Pre-demo checklist (every time):** reset sandbox · fix toggles all `false` · fresh browser profile · `docker compose up` verified · backup video open · notifications off.

---

## 14. Q&A ammunition

- **How do you know it's not a false positive?** Ownership proven from the response body, six probes including stub/anonymous/repeat controls, and a repeat confirmation. Status code alone is never sufficient. Unprovable ownership → `POTENTIAL`, never `VERIFIED`.
- **Isn't it just an LLM wrapper?** The engine finds every seeded flaw with AI fully disabled. The model only explains or proposes tests; every proposal is validated before execution and it cannot create a finding.
- **What stops someone scanning a site they don't own?** Engine-level allowlist before any socket opens, attestation checkbox, request budget, circuit breaker, redirects off. In production this becomes domain-ownership verification.
- **Does it work on any API?** Any OpenAPI 3 doc parses and inventories. Ownership detection currently uses a small explicit hint for the ID/owner fields, because no scanner can reliably infer ownership semantics for an arbitrary API. Next step: infer from schema analysis plus a confirmation pass. *(Say this plainly.)*
- **Scale to hundreds of endpoints?** Async HTTP with bounded concurrency, a request budget, high-risk endpoints first, stateless per-scan engine, indexed tables.
- **Will it crash the target?** Bounded concurrency, timeouts, and a circuit breaker that aborts on >30% errors or tripled latency; destructive methods only on scanner-created objects.
- **What next?** Mass assignment, SSRF via canary listener, HAR/live-traffic ingestion, ownership-field inference, multi-step agentic chains, trend dashboards.

---

## 15. Update your existing diagrams (fast edits, not a redraw)

**Architecture image:** fix typo "severity seering" → "severity scoring"; remove the stray connector from the legend box to SentinelShop; change the scanning layer to show the **Access Matrix sweep** + "Circuit breaker" in the Safety Guard box; remove SSRF from the detector row and add "Rate Limit" + "Misconfig" only; drop the "AI Chatbot" box (replace with "AI Hypotheses (validated)"); change "10 seeded bugs" → "8 seeded flaws".
**Workflow image:** fix "or quen" → "or provide an API URL"; complete the truncated "7 st:" → "6 detector classes"; change 27 endpoints → the real count from `openapi.yaml`; add the "Access Matrix" step between "Generate Test Plan" and "Execute Probes"; keep the Fix & Verify loop and CI/CD gate (both survive in this plan).

---

## 16. Positioning — the pitch

> Existing scanners either fuzz endpoints and hope for crashes, or ask an AI whether something looks vulnerable. Neither can *prove* an authorization boundary is broken. SentinelAPI reads your OpenAPI spec, refuses to trust it, tests every endpoint against every identity, proves that one customer can read another's data with the exact request and response, explains why it rates Critical, tells you how to fix it — and then verifies the fix worked. The AI explains; the proof is in the HTTP evidence.

**Five-layer story:** Understand → Test → Prove → Explain → Verify.

---

## 17. Problem statement crosswalk

| PS §5 capability | Where it's met |
|---|---|
| Ingest OpenAPI (or traffic) | prance parser (OpenAPI 3.x JSON/YAML); live traffic listed as next step |
| Auth flaws via identifier manipulation across sessions | Access Matrix + BOLA 6-probe oracle |
| Excessive data exposure | Schema diff + sensitive name/value patterns + cross-identity check |
| Weak rate limiting / auth misconfig | Rate-limit probe, broken-auth token tests, headers/CORS/debug misconfig |
| Severity-ranked, explainable findings | Rubric with visible score factors + AI/template explanation |
| Reproducible PoC per finding | cURL PoC + `reproduce` + Re-verify |
| Dashboard/report for engineers and non-technical readers | 6-screen console + printable report |
| Optional CI/CD | CLI exit codes + GitHub Action YAML |

| PS §7 constraint | Mechanism |
|---|---|
| Ethics / scope | Engine allowlist + attestation + sandbox-only |
| Tool itself not an attack vector | Fernet vault, redaction, no secrets in argv/LLM |
| False positives | Control probes + ownership proof + repeat + two-state confidence |
| Explainability | Score factors, evidence diff, PoC |
| Reliability of target | Bounded concurrency, budget, circuit breaker |
| Scalability | Async, budgeted, prioritized sweep |
| Accessibility | Helper text, plain-English AI/template explanations, OWASP labels |

*Note: the problem statement publishes no judging weights or deliverable list — confirm both with the organizers, and confirm whether a sandbox target is provided or must be self-built.*

---

## 18. Risk register

| Risk | Mitigation | Fallback |
|---|---|---|
| Over-scoping (**very high**) | §1.3 cut list, H19 freeze, gates | Re-read §1.1 aloud, stop at last green item |
| BOLA false positives | Ownership proof + controls + repeat | Report as `POTENTIAL` |
| Spec-parsing rabbit hole | `prance` at the boundary | Ship with SentinelShop's flat spec; state limitation |
| Sandbox nondeterminism | In-memory seed, `/__reset`, hand-verified at H02 | Reset before every run |
| Frontend unfinished | Fixture-first from H03 | Ship 4 polished screens |
| Groq slow/offline | NullProvider, cached explanations | Hide AI panel; deterministic path untouched |
| Venue wifi dies | Everything on localhost via Compose | Demo offline + backup video |
| Docker fails on stage | Pre-built images, clean-room run at H18 | Run `uvicorn` + `npm run dev` directly |
| Tokens expire mid-demo | `/verify` before scan; login recipe mints fresh tokens | Re-verify identities |
| Exhaustion bugs | Break at H12, commit every 30 min | Revert to last known-good |

---

## 19. Definition of Done

**Engine:** runs from a fresh clone · ingests OpenAPI 3 JSON + YAML · inventory generated dynamically from the uploaded spec · allowlist checked before the first request · all four identities supported · full matrix populated · BOLA with ownership proof + controls + repeat · exposure, broken auth, BFLA, rate limit, misconfig detected · every finding has redacted evidence, PoC, and visible score factors · budget, timeouts, circuit breaker enforced · CLI exits non-zero on threshold · re-verify re-executes against the live target.

**Console:** real spec upload with instant parse summary · progress streamed from real events · evidence side by side · score breakdown visible · Access Matrix clickable · Re-verify and Apply fix work · report renders for non-technical readers · zero hardcoded finding strings · no dashboard number that isn't sourced from a scan.

**Sandbox:** deterministic seed · every flaw reproducible by hand in <2 minutes · `/__reset` works · spec documents the secure contract · control-plane routes not in spec · fix toggles work.

**Delivery:** `docker compose up` runs everything · clean-room run completed · README + ARCHITECTURE + THREAT_MODEL exist · diagrams updated · demo rehearsed 5× · backup video recorded.

---

## 20. The one thing to remember

Everything in this document exists to make this literally true on stage:

> We uploaded an API spec. SentinelAPI refused to trust it, tested every endpoint against every identity, proved one customer could read another's order, showed the exact request and response, explained why it's Critical, told us how to fix it — and then verified the fix worked.
