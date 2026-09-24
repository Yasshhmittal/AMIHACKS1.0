# SentinelAPI — Zero-Trust API Vulnerability Scanner

> **AmiHacks · Track C / Problem Statement 3**  
> *"AI suggests. The scanner executes. Evidence verifies."*

---

## Architecture Overview

SentinelAPI is an automated zero-trust security scanner that ingests OpenAPI 3.x specifications, builds an Access Matrix across all endpoints and identity triples `(identity, endpoint, object)`, and proves authorization bypasses (BOLA, BFLA, Broken Auth, Excessive Data Exposure) with reproducible HTTP evidence.

```
┌────────────────────────────────────────────────────────┐
│ UI LAYER (React 18 + TS + Vite + Tailwind)             │
│ Upload · Live Scan (SSE) · Findings · Access Matrix    │
└───────────────────────┬────────────────────────────────┘
                        │ REST + SSE
┌───────────────────────▼────────────────────────────────┐
│ SENTINEL ENGINE (FastAPI + Python 3.11 + Prisma)       │
│ • OpenAPI Ingestion & Classification                   │
│ • Safety Guard & Concurrency-Bounded Executor          │
│ • Access Matrix Sweep (BOLA, BFLA, Exposure, Auth)     │
│ • Response Comparator & Transparent Severity Rubric    │
│ • AI Explainer & Summarizer (Groq / LangChain)         │
└───────────────────────┬────────────────────────────────┘
                        │ Probes
┌───────────────────────▼────────────────────────────────┐
│ SENTINELSHOP (Demo Sandbox Target with 8 Seeded Flaws) │
└────────────────────────────────────────────────────────┘
```

---

## Quickstart (Docker Compose)

The easiest way to run the entire backend stack (PostgreSQL + SentinelShop + Sentinel Engine) in one command:

```bash
cd sentinelapi

# Start all services
docker compose up --build
```

- **Sentinel Engine API:** `http://localhost:8000`
- **SentinelShop Sandbox:** `http://localhost:4000`
- **PostgreSQL Database:** `localhost:5432`

---

## Local Development (Without Docker)

### 1. Python Environment

```bash
cd sentinelapi
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Database Setup

Ensure PostgreSQL is running locally, then initialize Prisma:

```bash
prisma generate
prisma db push
```

### 3. Run SentinelShop (Demo Target)

In terminal 1:
```bash
uvicorn sentinelshop.app:app --port 4000 --reload
```

### 4. Run Sentinel Engine

In terminal 2:
```bash
uvicorn engine.main:app --port 8000 --reload
```

---

## Running Automated Scans via CLI

SentinelAPI provides a standalone CLI with CI/CD exit codes:

```bash
python -m cli.sentinel scan --spec sentinelshop/openapi.yaml --target http://localhost:4000 --fail-on high --out scan-results.json
```

- **Exit 0:** Clean (no findings at or above threshold)
- **Exit 1:** Security gate failed (findings >= threshold detected)
- **Exit 2:** Configuration or spec error
- **Exit 3:** Safety guard violation (budget or circuit breaker tripped)

---

## Running Unit Tests

Run the test suite verifying pure functions (comparator, rule engine, redaction pipeline):

```bash
pytest engine/tests/ -v
```

---

## Frontend Teammate Handoff

The frontend specification and API contract are documented in:
- **Handoff Guide:** `frontend_handoff.md`
- **Sample Fixture JSON:** `web/src/fixtures/scan-result.sample.json`
