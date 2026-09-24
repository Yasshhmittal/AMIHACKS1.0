# SentinelAPI — Zero-Trust API Vulnerability Scanner

> *We upload an API spec. SentinelAPI refuses to trust it, tests every endpoint
> against every identity, proves one customer can read another's order — shows
> the exact request and response — explains why it's Critical, tells you how to
> fix it, and then verifies the fix worked.*

**AmiHacks · Track C · Problem Statement 3.** The AI explains; the proof is in the HTTP evidence.

```
AI suggests.  The scanner executes.  Evidence verifies.
```

---

## Why it's different

Existing tools either fuzz endpoints and hope for a crash, or ask an LLM whether
something *looks* vulnerable. Neither can **prove** an authorization boundary is
broken. SentinelAPI proves it: for every candidate it runs a control set of real
HTTP probes — including probes whose only job is to falsify the finding — and
reads ownership out of the response body. A `200` is never a finding on its own.

### Five zero-trust axioms
1. **Never trust the spec** — the OpenAPI doc is a claim; spec drift is a finding.
2. **Never trust the status code** — a `200` is not authorization; ownership is proven from the body.
3. **Never trust the identity** — every endpoint is probed with every identity (anon, A, B, admin).
4. **Never trust the model** — AI can only *propose*; only the deterministic engine creates a finding.
5. **Never trust the operator** — allowlist, budget, circuit breaker and redaction live in the engine.

---

## Stack

| Layer | Choice |
|---|---|
| Engine + API | Python 3.11, FastAPI, httpx (async) |
| Persistence | **SQLite via SQLModel** (zero infrastructure, runs offline) |
| Spec parsing | prance + openapi-spec-validator (JSON + YAML, `$ref` resolution) |
| Live updates | SSE with sequence numbers + polling fallback |
| AI | Groq behind a provider interface + **NullProvider** fallback |
| CLI / CI | Typer CLI with exit codes + GitHub Action |
| Packaging | Docker Compose — `sentinel` (engine) + `sentinelshop` (demo target) |

---

## Quick start

### Option A — local (recommended for the demo)
```bash
python -m venv venv
# Windows:  .\venv\Scripts\activate    macOS/Linux:  source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # optional: add GROQ_API_KEY for live AI

# terminal 1 — the vulnerable demo target
uvicorn sentinelshop.app:app --port 4000 --reload
# terminal 2 — the scanner engine (creates sentinel.db on first run)
uvicorn engine.main:app --port 8000 --reload
# terminal 3 (frontend, owned by the UI teammate)
cd web && npm install && npm run dev
```

### Option B — Docker Compose (engine + target, offline)
```bash
docker compose up --build
# engine on :8000, sentinelshop on :4000
```

### One-shot CLI scan (CI gate)
```bash
python cli/sentinel.py scan \
  --spec sentinelshop/openapi.yaml \
  --target http://localhost:4000 \
  --fail-on high --out result.json
# exit 0 clean · 1 findings>=threshold · 2 config error · 3 budget exhausted
```

---

## What it detects (one sweep, six classes)

| Class | OWASP 2023 | How it's proven |
|---|---|---|
| BOLA (hero) | API1 | 6-probe control set; ownership read from response body; repeat confirmation |
| Broken Authentication | API2 | spec says secured, anon gets 2xx with data; malformed-token control |
| Excessive Data Exposure | API3 | undocumented fields + sensitive name/value patterns |
| BFLA | API5 | low-priv gets 2xx on admin endpoint; admin control 2xx; anon denied |
| Missing Rate Limiting | API4 | bounded burst of failed logins, no 429 / RateLimit headers |
| Misconfiguration | API8 | headers, reflected CORS w/ credentials, debug endpoint, version leak |

Every finding carries redacted request/response evidence, a reproducible cURL
PoC, a transparent severity breakdown, and two-state confidence
(`VERIFIED` / `POTENTIAL` — no fake percentages).

---

## Safety (each is enforced in the engine, not the UI)
- Target **allowlist** — localhost / private ranges only, unless `SENTINEL_ALLOW_PUBLIC=1`.
- "I am authorized to test this target" **attestation**, stored with the scan.
- **Request budget** + wall-clock deadline; **circuit breaker** (abort on >30% transport errors or tripled latency).
- Bounded concurrency (max 5); redirects disabled.
- Credentials encrypted at rest (Fernet), never logged, never in PoCs (placeholders only).
- The LLM receives only sanitized spec/finding metadata — never tokens, bodies, or customer data.

See `docs/THREAT_MODEL.md` and `docs/ARCHITECTURE.md`.

---

## Demo loop
`CRITICAL BOLA VERIFIED → Re-verify (still vulnerable) → Apply fix → Re-verify → 403 FIXED`.
Re-verify **re-executes the real request** against the live sandbox — never cached.

## Tests
```bash
pytest engine/tests -q      # comparator, rubric, spec-secured resolution, redaction
```
