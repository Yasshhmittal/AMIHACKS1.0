# SentinelAPI — Threat Model

A security tool must not itself become an attack vector. This document states
what SentinelAPI may do, what it cannot do, and what an attacker who compromised
it would gain.

## What it may do
- Send bounded, read-first HTTP requests to a target on an **allowlist**
  (localhost, `127.0.0.1`, `sentinelshop`, private IP ranges). Public targets
  require an explicit `SENTINEL_ALLOW_PUBLIC=1` and an authorization attestation.
- Log in as caller-supplied identities and compare what each can reach.
- Store redacted evidence and findings in a local SQLite database.

## What it cannot do (enforced in the engine, not the UI)
- **Scan a target off the allowlist.** The check runs in `core/guard.py` before
  any socket opens, and again when a `Target` is created via the API.
- **Hammer a target.** Bounded concurrency (max 5), per-request timeout, a
  request budget, a wall-clock deadline, and a circuit breaker that aborts on
  >30% transport/5xx errors or tripled latency.
- **Fire destructive requests blindly.** The baseline sweep is GET-only; state-
  changing methods run only where a detector specifically needs them, and the
  destructive BOLA-write check targets only scanner-created objects.
- **Follow redirects** into off-allowlist hosts (`follow_redirects=False`).
- **Leak secrets.** Tokens are encrypted at rest (Fernet), never written to
  logs, never placed in argv or URLs, and replaced with `$USER_A_TOKEN`
  placeholders in PoCs.

## Redaction (`core/redact.py`)
Two passes, applied before anything is streamed, persisted, or shown to the LLM:
- Header values for `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key` → `***redacted***`.
- Sensitive body **values** masked (bcrypt/JWT and sensitive-named fields);
  sensitive **key names** are preserved — the presence of the name is the finding.
- Bodies truncated to 8 KB.

## The AI boundary
The LLM receives only sanitized metadata: method, path, summary, parameter
names, schema field names, declared security, and a finding's expected/actual
strings. It never receives tokens, passwords, cookies, response bodies, or
customer data. It cannot create a finding, change a severity or confidence, or
add a target. With no `GROQ_API_KEY`, the deterministic path is untouched and
findings are identical.

## What an attacker who compromised the tool gains
Disposable sandbox tokens for an allowlisted, non-production target, and a local
SQLite file of redacted evidence. No production credentials are ever handled;
the allowlist and attestation prevent redirection at a real system. In a
production deployment this attestation becomes domain-ownership verification.

## Residual limitations (stated plainly to judges)
- Ownership detection uses an explicit `x-sentinel-collection-hints` field, not
  inference. Next step: infer ownership from schema analysis plus a confirmation pass.
- Coverage is the six classes above; SSRF, mass assignment and multi-step
  agentic chains are future work. A scanner that *proves* a few classes beats
  one that *suspects* many.
