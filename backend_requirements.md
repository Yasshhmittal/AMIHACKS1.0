# SentinelAPI — Backend Requirements & Setup

**For: Backend Developer (You — Owner A)**
**Project: AmiHacks · Zero-Trust API Vulnerability Scanner**

---

## 1. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Runtime** | Python 3.11+ | Async-first, network-bound scanner |
| **Framework** | FastAPI + Uvicorn | Async REST + SSE, auto OpenAPI docs |
| **HTTP Client** | httpx (async) | Scanner's HTTP executor |
| **Database** | PostgreSQL 16 | Robust relational DB |
| **ORM** | Prisma (Python client — `prisma-client-py`) | Type-safe, migrations, schema-first |
| **Spec Parsing** | `prance` + `openapi-spec-validator` | Resolves `$ref`, JSON + YAML |
| **AI Orchestration** | LangChain + LangGraph | Structured LLM chains with graph-based workflow |
| **LLM Provider** | Groq (free tier) | Fast inference: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` |
| **Encryption** | Fernet (cryptography) | Token/credential encryption at rest |
| **Containerization** | Docker + Docker Compose | Two services: `sentinel` + `sentinelshop` |
| **CLI** | Click or Typer | `sentinel scan` CLI with exit codes |

---

## 2. API Keys & Environment Variables You Need

> [!IMPORTANT]
> Get these ready BEFORE starting development.

### 2.1 Required API Keys

| Key | Where to Get | Free Tier? | Purpose |
|-----|-------------|------------|---------|
| **`GROQ_API_KEY`** | [console.groq.com](https://console.groq.com) | ✅ Yes (free) | LLM for AI explainer, summarizer, hypothesis generator |

### 2.2 Full `.env` File

```env
# === DATABASE ===
DATABASE_URL="postgresql://sentinel:sentinel_password@localhost:5432/sentinelapi"

# === AI / LLM ===
GROQ_API_KEY="gsk_your_groq_api_key_here"
# Models (Groq free tier)
GROQ_REASONING_MODEL="llama-3.3-70b-versatile"
GROQ_FAST_MODEL="llama-3.1-8b-instant"

# === SECURITY ===
FERNET_KEY=""  # Auto-generated on first run if empty
SENTINEL_ALLOW_PUBLIC="0"  # Set to "1" to allow scanning non-localhost targets

# === ENGINE CONFIG ===
MAX_REQUESTS=500
MAX_CONCURRENT=5
CIRCUIT_BREAKER_ERROR_THRESHOLD=0.30
CIRCUIT_BREAKER_LATENCY_MULTIPLIER=3
REQUEST_TIMEOUT_SECONDS=10
SCAN_DEADLINE_SECONDS=300

# === SENTINEL SHOP (demo target) ===
SENTINELSHOP_PORT=4000
SENTINELSHOP_HOST="0.0.0.0"

# === SERVER ===
SENTINEL_PORT=8000
SENTINEL_HOST="0.0.0.0"
```

### 2.3 How to Get the Groq API Key
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up / Sign in (Google or GitHub)
3. Navigate to **API Keys** in the sidebar
4. Click **Create API Key**
5. Copy the key (starts with `gsk_`)
6. Paste into `.env` as `GROQ_API_KEY`

> [!NOTE]
> The scanner works **fully without AI** using `NullProvider`. The Groq key is only needed for AI explanations, summaries, and hypothesis generation. Every finding is produced by the deterministic engine.

---

## 3. Project Structure

```
sentinelapi/
├── engine/
│   ├── main.py                         # FastAPI app entry point (serves built UI too)
│   ├── config.py                       # Settings from .env
│   ├── api/                            # API route handlers
│   │   ├── __init__.py
│   │   ├── targets.py                  # Target CRUD + allowlist check
│   │   ├── scans.py                    # Scan lifecycle + SSE stream
│   │   ├── findings.py                 # Finding detail + re-verify + explain
│   │   └── demo.py                     # Fix toggles + reset
│   ├── core/                           # Engine internals
│   │   ├── __init__.py
│   │   ├── guard.py                    # Allowlist, budget, circuit breaker, no redirects
│   │   ├── session.py                  # Identity management + Fernet vault
│   │   ├── executor.py                 # Async httpx executor (bounded concurrency)
│   │   ├── comparator.py              # Response canonicalization, diff, ownership
│   │   ├── oracle.py                   # Decision engine (BOLA, BFLA, etc. rules)
│   │   ├── evidence.py                 # Evidence bundle builder
│   │   ├── risk_engine.py              # Severity rubric + score factors
│   │   ├── redact.py                   # Two-pass redaction
│   │   └── sweep.py                    # Access Matrix sweep orchestrator
│   ├── ingest/                         # Spec parsing
│   │   ├── __init__.py
│   │   ├── openapi_parser.py           # prance + normalization
│   │   └── api_model.py               # Normalized Endpoint model
│   ├── detectors/                      # Vulnerability detectors
│   │   ├── __init__.py
│   │   ├── base.py                     # Base detector interface
│   │   ├── bola.py                     # BOLA 6-probe oracle (THE hero detector)
│   │   ├── bfla.py                     # Broken Function Level Auth
│   │   ├── data_exposure.py            # Excessive data exposure
│   │   ├── broken_auth.py              # Broken authentication
│   │   ├── rate_limit.py               # Rate limiting detection
│   │   └── misconfig.py                # Security misconfiguration
│   ├── ai/                             # AI layer (build LAST)
│   │   ├── __init__.py
│   │   ├── provider.py                 # Abstract provider interface
│   │   ├── groq_provider.py            # Groq + LangChain implementation
│   │   ├── null_provider.py            # Fallback: no AI, template text
│   │   ├── chains.py                   # LangChain chains for each AI task
│   │   ├── graphs.py                   # LangGraph workflow (if needed)
│   │   ├── explainer.py                # Evidence → explanation
│   │   ├── summarizer.py               # Scan → executive summary
│   │   └── hypotheses.py               # Spec → hypothesis test cases
│   ├── reporting/                      # Output formats
│   │   ├── __init__.py
│   │   ├── json_report.py
│   │   ├── html_report.py
│   │   └── sarif.py                    # Stretch goal
│   ├── models/                         # Database + Pydantic
│   │   ├── __init__.py
│   │   └── schemas.py                  # Pydantic request/response models
│   └── tests/                          # Unit tests (pure functions only)
│       ├── test_comparator.py
│       ├── test_oracle.py
│       ├── test_rules.py
│       └── test_redact.py
├── prisma/
│   └── schema.prisma                   # Database schema
├── sentinelshop/                       # Vulnerable demo API (build FIRST)
│   ├── app.py                          # FastAPI entry for demo target
│   ├── routes/
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── orders.py
│   │   ├── admin.py
│   │   ├── invoices.py
│   │   └── debug.py
│   ├── vulnerabilities.py              # Flaw implementations
│   ├── fixes.py                        # Fix toggle logic
│   └── openapi.yaml                    # The spec (documents SECURE contract)
├── cli/
│   └── sentinel.py                     # CLI entry point
├── web/                                # Frontend (teammate's territory)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── THREAT_MODEL.md
│   └── DEMO_SCRIPT.md
├── docker-compose.yml
├── Dockerfile
├── Makefile
├── requirements.txt
├── .env
└── README.md
```

---

## 4. Database Schema (Prisma for PostgreSQL)

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider             = "prisma-client-py"
  interface            = "asyncio"
  recursive_type_depth = 5
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Target {
  id          Int        @id @default(autoincrement())
  baseUrl     String     @map("base_url")
  environment String     @default("sandbox")
  attestedBy  String?    @map("attested_by")
  attestedAt  DateTime?  @map("attested_at")
  createdAt   DateTime   @default(now()) @map("created_at")
  identities  Identity[]
  specs       Spec[]
  scans       Scan[]

  @@map("targets")
}

model Identity {
  id                  Int     @id @default(autoincrement())
  targetId            Int     @map("target_id")
  label               String  // "userA", "userB", "admin", "anonymous"
  role                String  // "user", "admin", "anonymous"
  userId              String? @map("user_id")
  credentialEncrypted String? @map("credential_encrypted") // Fernet-encrypted token
  target              Target  @relation(fields: [targetId], references: [id], onDelete: Cascade)

  @@map("identities")
}

model Spec {
  id              Int        @id @default(autoincrement())
  targetId        Int        @map("target_id")
  rawHash         String     @map("raw_hash")
  parsedJson      Json       @map("parsed_json")
  endpointCount   Int        @map("endpoint_count")
  createdAt       DateTime   @default(now()) @map("created_at")
  target          Target     @relation(fields: [targetId], references: [id], onDelete: Cascade)
  endpoints       Endpoint[]
  scans           Scan[]

  @@map("specs")
}

model Endpoint {
  id              Int          @id @default(autoincrement())
  specId          Int          @map("spec_id")
  method          String       // GET, POST, DELETE, etc.
  path            String       // /orders/{id}
  operationId     String?      @map("operation_id")
  summary         String?
  specSecured     Boolean      @default(false) @map("spec_secured")
  objectBearing   Boolean      @default(false) @map("object_bearing")
  adminScoped     Boolean      @default(false) @map("admin_scoped")
  paramsJson      Json?        @map("params_json")
  responseFields  Json?        @map("response_fields_json")
  spec            Spec         @relation(fields: [specId], references: [id], onDelete: Cascade)
  matrixCells     MatrixCell[]

  @@map("endpoints")
}

model Scan {
  id           Int          @id @default(autoincrement())
  targetId     Int          @map("target_id")
  specId       Int          @map("spec_id")
  status       String       @default("pending") // pending, running, completed, failed, aborted
  phase        String?      // Current phase: INVENTORY, SEED, BASELINE, etc.
  configJson   Json?        @map("config_json")
  requestsUsed Int          @default(0) @map("requests_used")
  durationMs   Int?         @map("duration_ms")
  riskScore    Float?       @map("risk_score")
  startedAt    DateTime?    @map("started_at")
  finishedAt   DateTime?    @map("finished_at")
  createdAt    DateTime     @default(now()) @map("created_at")
  target       Target       @relation(fields: [targetId], references: [id], onDelete: Cascade)
  spec         Spec         @relation(fields: [specId], references: [id], onDelete: Cascade)
  matrixCells  MatrixCell[]
  probes       Probe[]
  findings     Finding[]
  events       ScanEvent[]

  @@map("scans")
}

model MatrixCell {
  id                 Int      @id @default(autoincrement())
  scanId             Int      @map("scan_id")
  endpointId         Int      @map("endpoint_id")
  identity           String   // "anonymous", "userA", "userB", "admin"
  objectId           String?  @map("object_id")
  objectOwner        String?  @map("object_owner")
  status             Int      // HTTP status code
  durationMs         Int?     @map("duration_ms")
  ownershipMismatch  Boolean  @default(false) @map("ownership_mismatch")
  undocumentedFields Json?    @map("undocumented_fields") // string[]
  sensitiveFields    Json?    @map("sensitive_fields")    // string[]
  requestRedacted    Json?    @map("request_redacted")
  responseRedacted   Json?    @map("response_redacted")
  scan               Scan     @relation(fields: [scanId], references: [id], onDelete: Cascade)
  endpoint           Endpoint @relation(fields: [endpointId], references: [id], onDelete: Cascade)

  @@map("matrix_cells")
}

model Probe {
  id                    Int      @id @default(autoincrement())
  scanId                Int      @map("scan_id")
  findingId             Int?     @map("finding_id")
  label                 String   // P1, P2, P3, P4, P5, P6
  identity              String
  requestJsonRedacted   Json     @map("request_json_redacted")
  responseJsonRedacted  Json     @map("response_json_redacted")
  status                Int      // HTTP status
  latencyMs             Int?     @map("latency_ms")
  scan                  Scan     @relation(fields: [scanId], references: [id], onDelete: Cascade)
  finding               Finding? @relation(fields: [findingId], references: [id], onDelete: SetNull)

  @@map("probes")
}

model Finding {
  id               Int      @id @default(autoincrement())
  scanId           Int      @map("scan_id")
  fingerprint      String   // sha256(target + class + operation_id + param + attacker_role)
  class            String   // BOLA, BFLA, EXCESSIVE_DATA_EXPOSURE, etc.
  owaspId          String   @map("owasp_id") // API1, API2, etc.
  severity         String   // CRITICAL, HIGH, MEDIUM, LOW, INFO
  riskScore        Float    @map("risk_score")
  confidence       String   // VERIFIED, POTENTIAL
  title            String
  impact           String?
  remediation      String?
  scoreFactorsJson Json     @map("score_factors_json") // ScoreFactor[]
  expected         String?  // What should have happened
  actual           String?  // What actually happened
  state            String   @default("open") // open, fixed
  aiExplanationMd  String?  @map("ai_explanation_md")
  createdAt        DateTime @default(now()) @map("created_at")
  scan             Scan     @relation(fields: [scanId], references: [id], onDelete: Cascade)
  probes           Probe[]

  @@unique([scanId, fingerprint])
  @@map("findings")
}

model ScanEvent {
  id          Int      @id @default(autoincrement())
  scanId      Int      @map("scan_id")
  seq         Int      // Sequence number for replay
  type        String   // scan.started, phase.started, finding, etc.
  payloadJson Json     @map("payload_json")
  createdAt   DateTime @default(now()) @map("created_at")
  scan        Scan     @relation(fields: [scanId], references: [id], onDelete: Cascade)

  @@unique([scanId, seq])
  @@map("scan_events")
}
```

---

## 5. Docker Compose Configuration

```yaml
# docker-compose.yml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: sentinel
      POSTGRES_PASSWORD: sentinel_password
      POSTGRES_DB: sentinelapi
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sentinel"]
      interval: 5s
      timeout: 5s
      retries: 5

  sentinel:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: "postgresql://sentinel:sentinel_password@postgres:5432/sentinelapi"
      GROQ_API_KEY: "${GROQ_API_KEY}"
      SENTINEL_ALLOW_PUBLIC: "0"
    depends_on:
      postgres:
        condition: service_healthy
      sentinelshop:
        condition: service_started
    volumes:
      - ./engine:/app/engine
      - ./prisma:/app/prisma

  sentinelshop:
    build:
      context: .
      dockerfile: Dockerfile.sentinelshop
    ports:
      - "4000:4000"
    environment:
      SENTINELSHOP_PORT: "4000"

volumes:
  pgdata:
```

---

## 6. Python Dependencies (`requirements.txt`)

```txt
# === Core ===
fastapi==0.115.0
uvicorn[standard]==0.30.0
httpx==0.27.0
pydantic==2.9.0
pydantic-settings==2.5.0
python-multipart==0.0.9

# === Database ===
prisma==0.14.0

# === OpenAPI Parsing ===
prance[osv]==23.6.21.0
openapi-spec-validator==0.7.1
pyyaml==6.0.2

# === AI / LLM ===
langchain==0.3.0
langchain-groq==0.2.0
langgraph==0.2.0

# === Security ===
cryptography==42.0.0

# === CLI ===
typer==0.12.0
rich==13.7.0

# === Testing ===
pytest==8.3.0
pytest-asyncio==0.24.0

# === SSE ===
sse-starlette==2.1.0

# === Utilities ===
python-dotenv==1.0.0
```

---

## 7. What to Build (in order)

### Phase 1: SentinelShop — Build FIRST (H00–H02)

The vulnerable demo API that the scanner will scan. **Hand-verify every flaw with `curl` before writing any scanner code.**

**Seed Data (in-memory):**
- Users: alice (id=1, user), bob (id=2, user), admin (id=9, admin)
- Orders: 101→alice, 102→bob, 103→alice, 104→bob
- Tokens: JWT or simple bearer tokens per identity

**14 Routes:**
| Route | Flaw |
|-------|------|
| `POST /auth/login` | V6: No rate limiting |
| `POST /auth/register` | Normal |
| `GET /users/me` | V4: Leaks `passwordHash`, `internalNotes`, `creditScore` |
| `GET /users/{id}` | V2: BOLA on profile |
| `GET /orders` | Normal (collection, used for seed discovery) |
| `POST /orders` | Normal |
| `GET /orders/{id}` | V1: BOLA read (THE HERO) |
| `DELETE /orders/{id}` | V8: BOLA write (stretch) |
| `GET /admin/users` | V3: BFLA (role not checked) |
| `GET /admin/dashboard` | Normal (admin only) |
| `GET /invoices` | V5: Spec says secured, no auth check |
| `GET /debug/config` | V7: Misconfiguration |
| `GET /health` | Normal |
| `POST /auth/logout` | Normal |

**Control-plane routes (NOT in `openapi.yaml`):**
- `POST /__reset` — reset seed data
- `POST /__fixes` — toggle fixes: `{FIX_BOLA_ORDERS: true, ...}`
- `GET /__fixes` — current fix state

**Fix toggles:** When a fix is enabled, the corresponding flaw is patched at runtime (e.g., BOLA check added, rate limiter enabled). This powers the demo: scan → find → fix → re-verify → fixed.

### Phase 2: Contract Freeze (H02–H03) 🔴 JOINT

Create:
1. Pydantic request/response models for every API endpoint
2. SSE event type definitions
3. Hand-written fixture: `web/src/fixtures/scan-result.sample.json`
4. Give fixture to frontend teammate

### Phase 3: Engine Core (H03–H09)

Build in this order:
1. **`ingest/openapi_parser.py`** — prance parsing → normalized Endpoint inventory
2. **`ingest/api_model.py`** — endpoint classification (`object_bearing`, `admin_scoped`, `spec_secured`)
3. **`core/session.py`** — identity management, Fernet vault for credentials
4. **`core/guard.py`** — allowlist (localhost/127.0.0.1/sentinelshop/private ranges), budget counter, circuit breaker
5. **`core/executor.py`** — async httpx with bounded concurrency (semaphore max 5), timeout, no redirects
6. **`core/comparator.py`** — `canonicalize()`, `unwrap_envelope()`, `learn_volatility()`, `find_owner_field()`, `body_equivalent()`
7. **`core/sweep.py`** — Access Matrix sweep orchestrator (INVENTORY → SEED → BASELINE → CROSS → ANON → DERIVE → CONFIRM → SCORE)
8. **`detectors/bola.py`** — The 6-probe oracle (P1–P6) with ownership proof

> [!IMPORTANT]
> **🎯 H09 MILESTONE: A real BOLA finding in JSON output.** If this doesn't work by H09, everything else is at risk.

### Phase 4: More Detectors (H09–H11)

9. **`detectors/data_exposure.py`** — undocumented fields + sensitive name/value patterns
10. **`detectors/broken_auth.py`** — spec says secured, anon gets 2xx
11. **`detectors/bfla.py`** — low-priv gets 2xx on admin endpoint
12. **`detectors/rate_limit.py`** — 20 sequential failed logins, no 429
13. **`detectors/misconfig.py`** — headers, CORS, debug endpoints, version disclosure

### Phase 5: Evidence & Scoring (H12–H14)

14. **`core/evidence.py`** — evidence bundle builder, PoC generator (cURL with placeholders)
15. **`core/risk_engine.py`** — severity rubric with score factors
16. **`core/redact.py`** — two-pass redaction (Authorization, Cookie, sensitive values → `***redacted***`)
17. **`api/findings.py`** — re-verify endpoint (re-runs real test), `reproduce` command

### Phase 6: Safety & CLI (H14–H16)

18. **`core/guard.py`** enhancements — circuit breaker (>30% error → abort, 3× latency → abort)
19. **`cli/sentinel.py`** — `sentinel scan --spec api.json --target URL --fail-on high --out result.json`
   - Exit codes: `0` clean, `1` findings ≥ threshold, `2` config error, `3` budget exhausted
20. Unit tests for pure functions (comparator, oracle, redact, `resolve_spec_secured`)

### Phase 7: AI Layer (H16–H18) — Build LAST

21. **`ai/provider.py`** — abstract interface
22. **`ai/null_provider.py`** — template fallback (scanner works without AI)
23. **`ai/groq_provider.py`** — Groq + LangChain implementation
24. **`ai/chains.py`** — LangChain chains:
    - `ExplainerChain`: evidence bundle → plain-English impact + framework-specific fix
    - `SummarizerChain`: scan results → executive summary
    - `HypothesisChain`: sanitized spec metadata → structured hypothesis test cases
25. **`ai/graphs.py`** — LangGraph workflow (if hypothesis generation needs multi-step reasoning)

---

## 8. AI Layer Architecture (LangChain + LangGraph)

### 8.1 Provider Interface

```python
# ai/provider.py
from abc import ABC, abstractmethod

class AIProvider(ABC):
    @abstractmethod
    async def explain(self, finding_evidence: dict) -> str:
        """Generate plain-English explanation + fix snippet."""
    
    @abstractmethod
    async def summarize(self, scan_results: dict) -> str:
        """Generate executive scan summary."""
    
    @abstractmethod
    async def generate_hypotheses(self, spec_metadata: dict) -> list[dict]:
        """Generate test case hypotheses from spec."""
```

### 8.2 LangChain Integration

```python
# ai/chains.py
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser, JsonOutputParser

# Models
reasoning_llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)
fast_llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0)

# Explainer chain
explainer_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a security expert. Given vulnerability evidence, explain the impact and provide a fix."),
    ("human", "Finding class: {finding_class}\nEndpoint: {endpoint}\nExpected: {expected}\nActual: {actual}\n\nExplain the impact and provide fixes for FastAPI, Django, and Express.")
])
explainer_chain = explainer_prompt | reasoning_llm | StrOutputParser()
```

### 8.3 What the LLM NEVER Receives
- ❌ Tokens, passwords, cookies
- ❌ Response bodies or customer data
- ❌ Raw request/response content
- ✅ Only: parsed spec metadata (method, path, summary, param names, schema field names, declared security)

### 8.4 What the LLM NEVER Does
- ❌ Create a finding
- ❌ Change severity or confidence
- ❌ Add a target to scan

### 8.5 Hypothesis Validation Gate
Before a hypothesis becomes a test case, it must pass:
- References an existing endpoint
- Host is in the allowlist
- Only uses real parameters
- Category is known
- Fits remaining request budget

---

## 9. Key Implementation Details

### 9.1 Response Comparator (False-Positive Killer)

```python
# core/comparator.py — these are the critical functions

def canonicalize(body: dict) -> dict:
    """Sort keys, normalize types (str(int)), flatten."""

def unwrap_envelope(body: dict) -> Any:
    """Extract data from common envelopes: data, items, results."""

def learn_volatility(response1, response2) -> set[str]:
    """Diff two identical requests → prune timestamps, request IDs, ETags."""

def find_owner_field(body: dict, hint: str) -> Optional[str]:
    """Find owner field value using collectionHints."""

def find_sensitive_fields(body: dict) -> list[str]:
    """Match sensitive name/value patterns."""

def body_equivalent(r1, r2, volatile_fields: set) -> bool:
    """Compare after removing volatile fields."""
```

### 9.2 Critical Gotchas
- **ID comparison:** Convert JSON scalars to plain strings: `str(102)` vs `"102"`. Never compare values that still contain quotes.
- **`security: []`:** In OpenAPI, operation-level `security: []` means *explicitly public* and overrides the document default.
- **Sensitive patterns:** Case-insensitive on flattened paths like `items[].sku`, `owner.internalNotes`.
- **Environment scoping:** On localhost/127.0.0.1, TLS/HSTS checks emit INFO, not findings.

### 9.3 SSE Event Emission

```python
# api/scans.py
from sse_starlette.sse import EventSourceResponse

async def scan_stream(scan_id: int):
    async def event_generator():
        async for event in scan_event_queue(scan_id):
            yield {
                "event": event.type,
                "id": str(event.seq),
                "data": json.dumps(event.payload)
            }
    return EventSourceResponse(event_generator())
```

### 9.4 Redaction Rules
- **Headers:** `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key` → `***redacted***`
- **Body values:** Sensitive values replaced, but sensitive **key names** are preserved (that's the finding)
- **Body truncation:** 8 KB max per body
- **Second pass:** Before SSE/DB/LLM storage

### 9.5 Fingerprint (Dedup + Fix Tracking)
```python
fingerprint = sha256(f"{target_url}:{finding_class}:{operation_id}:{param}:{attacker_role}")
```

---

## 10. Setup Steps (Run Once)

```bash
# 1. Clone and enter the project
cd d:\Amity-Hackathon

# 2. Create virtual environment
python -m venv venv
.\venv\Scripts\activate  # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set up .env file (copy from §2.2 and fill in GROQ_API_KEY)

# 5. Start PostgreSQL (via Docker)
docker compose up postgres -d

# 6. Initialize Prisma
prisma generate
prisma db push  # or: prisma migrate dev --name init

# 7. Start SentinelShop (demo target)
uvicorn sentinelshop.app:app --port 4000 --reload

# 8. Start Sentinel engine
uvicorn engine.main:app --port 8000 --reload

# OR, start everything with Docker Compose:
docker compose up --build
```

---

## 11. Development Timeline (Your Tasks)

| Time | Task | Deliverable |
|------|------|-------------|
| H00–02 | Repo, FastAPI skeleton, Prisma schema, guard skeleton, httpx executor, **SentinelShop with all 8 flaws** | SentinelShop running, hand-verified with curl |
| **H02–03** | 🔴 **JOINT:** Contract freeze — Pydantic models, SSE events, fixture JSON | Fixture file for frontend |
| H03–06 | prance ingestion → endpoint inventory + classification; identities + session vault | Spec parsing works |
| H06–09 | Seed discovery, baseline + cross sweep, comparator, **BOLA oracle** | 🎯 Real BOLA finding in JSON |
| H09–11 | Exposure, Broken Auth, BFLA, rate-limit, misconfig detectors | All 6 detector classes |
| **H11–12** | 🔴 **JOINT:** First integration with frontend | Real findings in UI |
| H12–14 | Rubric + score factors, evidence + redaction, PoC, re-verify | Complete evidence pipeline |
| H14–16 | Circuit breaker, budget/deadline, CLI + exit codes, unit tests | CLI working |
| H16–18 | AI: provider + NullProvider, LangChain chains, explainer, summarizer | AI layer |
| **H18** | 🔴 **JOINT:** Clean-room run | Everything works from fresh clone |
| **H19** | 🧊 FEATURE FREEZE | |
| H19–21 | Bug fixes, docs, ARCHITECTURE.md, THREAT_MODEL.md | |

---

## 12. Gates (If Missed, Take Action)

| Gate | Must Be True | Otherwise |
|------|-------------|-----------|
| H03 | Contract frozen + fixture exists | Stop all feature work until done |
| H09 | One real BOLA finding in JSON | Frontend teammate pauses and pairs with you |
| H11 | UI shows a real engine finding | Cut misconfig, exposure, rate limit; ship BOLA + BFLA + broken auth only |
| H16 | Fix toggle → re-verify flips a finding | Cut AI, graph, SARIF; polish what exists |
| H18 | Full demo path works end to end | Cut Attack Replay + Matrix UI; rehearse what exists |

---

## 13. Summary of What You Need to Provide/Procure

| Item | Status | Action |
|------|--------|--------|
| **Groq API Key** | ❓ Get it | [console.groq.com](https://console.groq.com) — free signup |
| **Docker Desktop** | ❓ Install if not present | For PostgreSQL + deployment |
| **Python 3.11+** | ❓ Verify | `python --version` |
| **Node.js 18+** | ❓ Verify (for frontend teammate) | `node --version` |
| **PostgreSQL** | Via Docker | Handled by `docker-compose.yml` |
| **Git** | ❓ Verify | `git --version` |

> [!TIP]
> **Start with SentinelShop.** The entire project depends on having a working demo target. Build it first, hand-verify every flaw with curl, then build the scanner against it.
