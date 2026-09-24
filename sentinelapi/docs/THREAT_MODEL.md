# SentinelAPI — Threat Model & Safety Architecture

## 1. System Mission & Boundaries

SentinelAPI is an automated Zero-Trust API Vulnerability Scanner designed to identify authorization boundaries failures (BOLA, BFLA, Broken Authentication, Sensitive Data Exposure).

### What SentinelAPI May Do
- Issue controlled HTTP requests (`GET`, `POST`, `DELETE`, etc.) against target endpoints explicitly identified in the OpenAPI specification.
- Test endpoint responses with varying identity credentials (`anonymous`, `userA`, `userB`, `admin`).
- Measure latency and error rates to monitor target stability.
- Generate and output reproducible cURL proof-of-concepts with sanitized placeholder credentials.

### What SentinelAPI Cannot Do
- Cannot launch denial-of-service (DoS) floods: strict concurrency ceiling (`max_concurrent = 5`) and total request limits (`max_requests = 500`).
- Cannot scan external arbitrary third-party targets without explicit configuration override (`SENTINEL_ALLOW_PUBLIC=1`).
- Cannot follow arbitrary HTTP redirects (`follow_redirects=False`) to avoid Server-Side Request Forgery (SSRF) bounce attacks.
- Cannot transmit raw customer credentials or response bodies to external LLMs.

---

## 2. Zero-Trust Safety Controls

| Defense Layer | Mechanism | Failure Action |
|---------------|-----------|----------------|
| **Target Allowlist** | Evaluated in `core/guard.py` before any socket opens | Rejects request immediately with HTTP 400 |
| **Attestation Check** | User confirms authorization checkbox | Scan cannot start without verified attestation |
| **Circuit Breaker** | Tracks error rate and response latency | Trips if error rate > 30% or latency triples; aborts scan |
| **Credential Vault** | Fernet symmetric encryption at rest | Tokens decrypted only in-memory at execution boundary |
| **Two-Pass Redaction** | Strips tokens and cookies from headers and bodies | Raw tokens never written to logs, SSE, DB, or report |
| **AI Boundary** | LLM only receives sanitized spec metadata | Tokens and sensitive values never sent to model provider |

---

## 3. Compromise Impact Analysis

*What does an attacker gain if they compromise the SentinelAPI instance?*
- The scanner only possesses test identity credentials for the target sandbox environment (`token-alice-12345`, `token-bob-67890`).
- No production database credentials or root operating system keys are held by the runner.
- All stored credentials in PostgreSQL are encrypted with transient or environment-specified Fernet keys.
