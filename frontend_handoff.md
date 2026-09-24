# SentinelAPI — Frontend Handoff Document

**For: Frontend Developer (Owner B)**
**Project: AmiHacks · Zero-Trust API Vulnerability Scanner**
**Stack: React 18 + TypeScript + Vite + Tailwind CSS**

---

> [!IMPORTANT]
> You are building the frontend **independently** from the backend. The backend team will provide a fixture JSON file (`web/src/fixtures/scan-result.sample.json`) at **H03 (contract freeze)**. Build everything against that fixture first, then swap to real API calls during integration at **H11**.

---

## 1. Project Setup

```bash
npx -y create-vite@latest ./ -- --template react-ts
npm install tailwindcss @tailwindcss/vite
# Optional (use if time permits):
npm install recharts react-flow-renderer
```

Your code lives in:
```
web/
├── src/
│   ├── pages/          # 6 pages (see §3)
│   ├── components/     # Shared UI components
│   ├── hooks/          # Custom hooks (useSSE, useScan, etc.)
│   ├── fixtures/       # Mock data (scan-result.sample.json)
│   ├── types/          # TypeScript interfaces matching API
│   ├── api/            # API client functions
│   └── utils/          # Helpers (formatting, colors, etc.)
├── index.html
└── vite.config.ts
```

---

## 2. Design System & Theme

### 2.1 Look & Feel
- **Dark, high-contrast security-console aesthetic**
- Think: Cybersecurity dashboards, terminal-inspired but modern
- Monospace font for all: requests, paths, headers, code blocks, evidence
- Sans-serif for body text and headings

### 2.2 Severity Color Palette (ONLY saturated colors in the UI)

| Severity | Color | Hex |
|----------|-------|-----|
| Critical | Red | `#dc2626` |
| High | Orange | `#ea580c` |
| Medium | Yellow/Amber | `#ca8a04` |
| Low | Blue | `#2563eb` |
| Info | Slate | `#64748b` |

> [!WARNING]
> **Every severity color MUST be paired with a text label.** Never rely on color alone for accessibility.

### 2.3 Confidence Badges
- **VERIFIED** → Solid/filled badge
- **POTENTIAL** → Outlined/border-only badge
- **No fake percentages** (no "98% confident" etc.)

### 2.4 Persistent UI Elements
- **`TARGET MODE: SANDBOX / AUTHORIZED`** badge visible on EVERY scan-related screen
- Navigation between the 6 pages
- Dark mode is the default (and only) mode

---

## 3. The 6 Pages

### Page 1: New Scan (`/scan/new`)

**Purpose:** Upload an OpenAPI spec, configure identities, select checks, and start a scan.

**Sections:**
1. **Spec Upload Area**
   - Drag-and-drop or file picker for `.json` / `.yaml` files
   - On upload, call `POST /api/targets/{id}/spec`
   - **Immediately show parse summary:** "N endpoints · N secured · N object-bearing"
   - Show endpoint inventory list (method + path for each)

2. **Target Configuration**
   - Base URL input (pre-filled with `http://sentinelshop:4000` for sandbox)
   - Call `POST /api/targets` to create target

3. **Identity Configuration**
   - Pre-filled with sandbox identities:
     - `anonymous` — no credentials
     - `userA (alice)` — attacker, role: user
     - `userB (bob)` — victim, role: user  
     - `admin` — role: admin
   - Each identity has: label, role, user_id, credential (token/password)
   - **"Verify Credentials" button** → calls `POST /api/targets/{id}/verify`
   - Show green/red status per identity after verification

4. **Check Selection**
   - Checkboxes for detector classes:
     - ☑ BOLA (API1)
     - ☑ Broken Authentication (API2)
     - ☑ Excessive Data Exposure (API3)
     - ☑ Rate Limiting (API4)
     - ☑ BFLA (API5)
     - ☑ Misconfiguration (API8)

5. **Attestation**
   - ☐ **"I am authorized to test this target"** — checkbox, REQUIRED before scan can start
   - Helper text: "By checking this box, you confirm you have explicit permission to scan this target."

6. **Start Scan Button**
   - Disabled until: spec uploaded + identities verified + attestation checked
   - Calls `POST /api/scans` → navigates to Live Scan page
   - Helper text under every field so a non-security engineer can start a scan

---

### Page 2: Live Scan (`/scan/:scanId/live`)

**Purpose:** Real-time scan progress. Every line comes from a real engine event via SSE.

> [!CAUTION]
> **No `setTimeout`, no fake progress bars, no simulated delays.** Every UI update comes from a real SSE event from the backend.

**Sections:**
1. **Phase Checklist** (top)
   - Phases in order: INVENTORY → SEED → BASELINE → CROSS → ANON → DERIVE → CONFIRM → SCORE+EMIT
   - Show: ✓ completed, ● in progress, ○ pending
   - Current phase highlighted

2. **Live Counters**
   - Requests sent / budget
   - Endpoints tested / total
   - Findings so far (by severity)
   - Elapsed time

3. **Live Event Log** (scrolling, newest at bottom)
   - Each line is an SSE event rendered with timestamp + type + message
   - Color-code by event type
   - Auto-scroll to bottom, with "pause scroll" button

4. **Findings Preview** (appear in-place as they are found)
   - Mini finding cards as they arrive via SSE `finding` events
   - Severity badge + endpoint + class + confidence

5. **Circuit Breaker / Error Indicators**
   - If error rate > 30% or latency triples → show warning banner
   - If scan aborts → clear error state with explanation

**SSE Connection:**
```typescript
const eventSource = new EventSource(`/api/scans/${scanId}/stream`);
// Fallback: poll GET /api/scans/${scanId}/events
```

---

### Page 3: Results / Dashboard (`/scan/:scanId/results`)

**Purpose:** Post-scan overview with real counts and filterable findings.

> [!WARNING]
> **No dashboard number that isn't sourced from a real scan.** No hardcoded counts.

**Sections:**
1. **Summary Stats** (cards at top)
   - Total endpoints scanned
   - Total requests made
   - Total findings (with severity breakdown: Critical/High/Medium/Low/Info)
   - Scan duration
   - Overall risk score

2. **Findings Table** (main content)
   - Columns: Severity | Class | Endpoint | Confidence | OWASP ID | Title
   - Filterable by: severity, class, confidence, endpoint
   - Sortable by: severity, class
   - Click a row → navigates to Finding Detail page

3. **Riskiest Endpoints** (sidebar or section)
   - Top 5 endpoints by number/severity of findings
   - Method + path + finding count

4. **Scan Metadata**
   - Target URL, spec file, scan config, timestamps

---

### Page 4: Finding Detail (`/finding/:findingId`) — **MOST POLISHED PAGE**

**Purpose:** Full evidence for a single finding. This is the page judges will scrutinize most.

**Sections:**

1. **Header**
   - Severity badge (Critical/High/Medium/Low/Info with color)
   - Confidence badge (VERIFIED solid / POTENTIAL outlined)
   - OWASP label (e.g., "API1:2023 - Broken Object Level Authorization")
   - Finding title
   - Endpoint: `METHOD /path`

2. **"Why This Severity" Panel** ⭐
   - List of every scoring factor that fired, with its weight
   - Example:
     ```
     ✓ Authorization boundary crossed          +40
     ✓ Cross-identity private data returned     +30
     ✓ Exploitable by low-privilege user        +10
     ✓ Repeat verification succeeded            +10
     ─────────────────────────────────────────
     Total: 90 → CRITICAL
     ```

3. **Controls Passed Checklist** (for BOLA — probes P1–P6)
   - P1 Victim baseline: ✓ 200 OK
   - P2 Attack: ✓ 200 OK (⚠ should have been 403)
   - P3 Attacker baseline: ✓ 200 OK
   - P4 Anonymous control: ✓ 401 (not public)
   - P5 Stub control: ✓ Different data (not same for any ID)
   - P6 Repeat: ✓ Reproducible
   - Each probe is expandable to show raw request/response

4. **Evidence: Baseline vs Attack** (side-by-side diff)
   - Left: Expected / Baseline response (victim's own request)
   - Right: Attack response (attacker accessing victim's resource)
   - **Owner field highlighted** in both (e.g., `"userId": 2` highlighted)
   - Show: Expected behavior vs Actual behavior

5. **Reproducible PoC** (copy button)
   - cURL command with `$USER_A_TOKEN` placeholders
   - Copy-to-clipboard button
   - Optional: HTTPie / Python variants as tabs

6. **Remediation**
   - Current (vulnerable) code pattern
   - Recommended (secure) code pattern
   - Framework-specific if AI explanation is available

7. **Action Buttons**
   - **🤖 Explain** → calls `POST /api/findings/{id}/explain` → shows AI explanation (or template fallback) in a panel
   - **🔄 Re-verify** → calls `POST /api/findings/{id}/verify` → shows result: "Still Vulnerable" or "FIXED ✓"
   - **🔧 Apply Fix** (sandbox only) → calls `POST /api/demo/fix/{vuln_id}` → then auto-triggers re-verify

8. **Attack Replay Tab** (stretch goal)
   - Step through probes P1 → P2 → P3 → P4 → P5 → P6
   - Each step shows: request sent, response received, what was checked, pass/fail
   - Navigation: Previous / Next buttons

---

### Page 5: Access Matrix (`/scan/:scanId/matrix`)

**Purpose:** Endpoint × Identity grid — communicates the zero-trust thesis in one screen.

**Layout:**
- **Rows:** Endpoints (METHOD + path)
- **Columns:** Identities (anonymous, userA, userB, admin)
- **Cells:** Color-coded by status:
  - Green (200 OK, authorized) → expected access
  - Red (200 OK, unauthorized) → VIOLATION (BOLA/BFLA)
  - Gray (401/403) → correctly denied
  - Yellow (unexpected status)
- **Cell click** → modal/drawer showing the raw request and response for that (endpoint, identity) pair
- Show ownership mismatch, undocumented fields, sensitive fields indicators in cells

**Data source:** `GET /api/scans/{id}/matrix`

---

### Page 6: Report (`/scan/:scanId/report`)

**Purpose:** Printable report for non-technical stakeholders.

**Format:** HTML page designed for `Ctrl+P` / browser print-to-PDF

**Sections:**
1. **Executive Summary**
   - Target, scan date, overall risk score
   - Finding counts by severity
   - AI/template summary paragraph

2. **Findings List**
   - Each finding: severity, title, endpoint, impact, evidence summary
   - Ordered by severity (Critical first)

3. **Remediation Roadmap**
   - Grouped recommendations

4. **PoC Commands**
   - cURL commands for each finding

5. **Download Options**
   - JSON download → `GET /api/scans/{id}/report` with `Accept: application/json`
   - SARIF download (if built) → `GET /api/scans/{id}/report` with `Accept: application/sarif+json`

---

## 4. Complete API Contract

### 4.1 REST Endpoints

```
POST   /api/targets                    → Create target (body: {base_url, environment})
POST   /api/targets/{id}/spec          → Upload OpenAPI spec (multipart file)
POST   /api/targets/{id}/identities    → Configure identities (body: [{label, role, user_id, credential}])
POST   /api/targets/{id}/verify        → Verify all credentials work → {results: [{identity, ok, status}]}

POST   /api/scans                      → Start scan (body: {target_id, checks[]}) → {scan_id}
GET    /api/scans/{id}                 → Scan status + counts
GET    /api/scans/{id}/stream          → SSE stream (event sequence numbers)
GET    /api/scans/{id}/events          → Polling fallback for SSE
GET    /api/scans/{id}/matrix          → Access matrix cells
GET    /api/scans/{id}/findings        → Filterable findings list (?severity=&class=&confidence=)

GET    /api/findings/{id}              → Full finding + evidence + probes
GET    /api/findings/{id}/poc          → PoC in curl/httpie/python format
POST   /api/findings/{id}/verify       → Re-run REAL test → {status: "still-vulnerable" | "fixed"}
POST   /api/findings/{id}/explain      → AI explanation (cached; template fallback)

GET    /api/scans/{id}/summary         → AI/template executive summary
GET    /api/scans/{id}/report          → HTML/markdown report (Accept header for JSON/SARIF)

POST   /api/demo/fix/{vuln_id}         → Toggle sandbox fix (body: {enabled: true})
POST   /api/demo/reset                 → Reset sandbox to initial state
```

### 4.2 SSE Event Types (`GET /api/scans/{id}/stream`)

Each event has a sequence number (`seq`) for replay.

```typescript
type SSEEventType =
  | "scan.started"        // {scan_id, target, config}
  | "spec.parsed"         // {endpoint_count, secured_count, object_bearing_count}
  | "phase.started"       // {phase: "INVENTORY"|"SEED"|"BASELINE"|"CROSS"|"ANON"|"DERIVE"|"CONFIRM"|"SCORE"}
  | "objects.discovered"  // {identity, objects: [{endpoint, ids: [...]}]}
  | "probe"               // {endpoint, identity, status, latency_ms, label?}
  | "signal"              // {endpoint, identity, signal: "ownership_mismatch"|"undocumented_fields"|...}
  | "candidate"           // {class, endpoint, identity, reason}
  | "confirm.started"     // {finding_count}
  | "finding"             // {id, class, severity, confidence, endpoint, title}
  | "scan.completed"      // {total_findings, total_requests, duration_ms, risk_score}
```

**Implementation:**
```typescript
// hooks/useSSE.ts
function useScanStream(scanId: string) {
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [phase, setPhase] = useState<string>("");
  const [findings, setFindings] = useState<Finding[]>([]);
  
  useEffect(() => {
    const es = new EventSource(`/api/scans/${scanId}/stream`);
    es.onmessage = (e) => {
      const event = JSON.parse(e.data);
      setEvents(prev => [...prev, event]);
      
      if (event.type === "phase.started") setPhase(event.payload.phase);
      if (event.type === "finding") setFindings(prev => [...prev, event.payload]);
    };
    es.onerror = () => {
      // Fallback to polling
      es.close();
      // Start polling GET /api/scans/${scanId}/events?after_seq=${lastSeq}
    };
    return () => es.close();
  }, [scanId]);
  
  return { events, phase, findings };
}
```

---

## 5. TypeScript Interfaces (Match Backend Pydantic Models)

```typescript
// types/index.ts

interface Target {
  id: number;
  base_url: string;
  environment: "sandbox" | "staging" | "production";
  attested_by: string;
  attested_at: string; // ISO datetime
}

interface Identity {
  id: number;
  target_id: number;
  label: string;       // "userA", "userB", "admin", "anonymous"
  role: string;        // "user", "admin", "anonymous"
  user_id: string;     // "1", "2", "9", etc.
  // credential is never sent to frontend
}

interface Endpoint {
  id: number;
  spec_id: number;
  method: string;      // "GET", "POST", "DELETE", etc.
  path: string;        // "/orders/{id}"
  operation_id: string;
  summary: string;
  spec_secured: boolean;
  object_bearing: boolean;
  admin_scoped: boolean;
}

interface Scan {
  id: number;
  target_id: number;
  spec_id: number;
  status: "pending" | "running" | "completed" | "failed" | "aborted";
  phase: string;
  requests_used: number;
  duration_ms: number;
  risk_score: number;
  started_at: string;
  finished_at: string | null;
}

interface MatrixCell {
  id: number;
  scan_id: number;
  endpoint_id: number;
  identity: string;          // "anonymous" | "userA" | "userB" | "admin"
  object_id: string | null;
  object_owner: string | null;
  status: number;            // HTTP status code
  duration_ms: number;
  ownership_mismatch: boolean;
  undocumented_fields: string[];   // field paths
  sensitive_fields: string[];      // field paths
}

interface Probe {
  id: number;
  scan_id: number;
  finding_id: number | null;
  label: "P1" | "P2" | "P3" | "P4" | "P5" | "P6";
  identity: string;
  request_json_redacted: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
  };
  response_json_redacted: {
    status: number;
    headers: Record<string, string>;
    body: any;
  };
  status: number;
  latency_ms: number;
}

interface ScoreFactor {
  description: string;
  weight: number;
  applied: boolean;
}

interface Finding {
  id: number;
  scan_id: number;
  fingerprint: string;
  class: "BOLA" | "BFLA" | "EXCESSIVE_DATA_EXPOSURE" | "BROKEN_AUTH" | "RATE_LIMITING" | "MISCONFIGURATION" | "SPEC_DRIFT";
  owasp_id: string;       // "API1", "API2", etc.
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  risk_score: number;
  confidence: "VERIFIED" | "POTENTIAL";
  title: string;
  impact: string;
  remediation: string;
  score_factors: ScoreFactor[];
  expected: string;        // What should have happened
  actual: string;          // What actually happened
  state: "open" | "fixed";
  ai_explanation_md: string | null;
  probes?: Probe[];        // Included in detail endpoint
}

interface ScanEvent {
  id: number;
  scan_id: number;
  seq: number;
  type: string;    // SSE event type
  payload: any;
}
```

---

## 6. Fixture Data (Build Against This First)

The backend team will provide `web/src/fixtures/scan-result.sample.json` at H03. Until then, here's the structure you should expect:

```typescript
// Expected fixture structure
interface ScanFixture {
  scan: Scan;
  target: Target;
  endpoints: Endpoint[];
  matrix: MatrixCell[];
  findings: Finding[];
  events: ScanEvent[];
  summary: {
    text: string;
    total_endpoints: number;
    total_requests: number;
    findings_by_severity: Record<string, number>;
    findings_by_class: Record<string, number>;
    risk_score: number;
  };
}
```

**Build all pages against this fixture.** When the real API is ready, you only need to swap the data source in your hooks.

---

## 7. UI Rules (Non-Negotiable)

1. **No hardcoded finding text.** Do NOT hardcode strings like `"BOLA"` or `"Broken Object Level Authorization"` in JSX. All finding data comes from the API/fixture. Run `grep -r "BOLA" web/src/` before demo — it should find nothing.

2. **Real empty/loading/error states everywhere.**
   - Loading: skeleton loaders or spinners
   - Empty: helpful message ("No findings found" with context)
   - Error: clear error message with retry option

3. **Helper text under every field** so a non-security engineer can start a scan without documentation.

4. **No fake data in production.** Every number on the dashboard must come from a real scan result.

5. **Responsive design** — should work on laptop screens (1366px+). Mobile is not required.

---

## 8. Key Interactions to Wire Up

| User Action | API Call | UI Update |
|-------------|----------|-----------|
| Upload spec file | `POST /api/targets/{id}/spec` | Show parse summary instantly |
| Click "Verify Credentials" | `POST /api/targets/{id}/verify` | Green/red per identity |
| Click "Start Scan" | `POST /api/scans` | Navigate to Live Scan, open SSE |
| Click finding row | Navigate | Go to `/finding/{id}` |
| Click "Explain 🤖" | `POST /api/findings/{id}/explain` | Show AI/template explanation in panel |
| Click "Re-verify" | `POST /api/findings/{id}/verify` | Show "Still Vulnerable" or "FIXED ✓" |
| Click "Apply Fix" | `POST /api/demo/fix/{vuln_id}` | Show success, then auto re-verify |
| Click matrix cell | `GET` cell detail | Show request/response modal |
| Click "Reset Sandbox" | `POST /api/demo/reset` | Show confirmation, refresh state |
| Click "Copy PoC" | `GET /api/findings/{id}/poc` | Copy to clipboard |
| Click "Download JSON" | `GET /api/scans/{id}/report` | Download file |

---

## 9. What NOT to Build

- ❌ Chatbot / conversational AI interface
- ❌ Trend dashboards / historical comparisons
- ❌ Mobile-responsive design
- ❌ User authentication / login for the console itself
- ❌ PDF generation library (use browser print)
- ❌ GraphQL/gRPC/SOAP support UI
- ❌ More than 6 pages

---

## 10. Stretch Goals (Only After Core Is Done)

1. **Authorization Graph** (React Flow) — Nodes: identities + resources. Red dashed edges on violations.
2. **Attack Replay Tab** on Finding Detail — step through probes P1–P6 with animation.
3. **SARIF download** button on Report page.

---

## 11. Development Timeline for Frontend

| Time Block | Task |
|------------|------|
| H03–06 | Vite scaffold, theme, routing, shared components; Results + Finding list against fixture |
| H06–09 | New Scan page (upload, parse summary, identities); SSE plumbing with stub |
| H09–11 | Live Scan page; Report page |
| **H11–12** | 🔴 **INTEGRATION with real backend** |
| H12–14 | Finding Detail: evidence diff, score breakdown, controls checklist |
| H14–16 | Fix toggles UI, Re-verify wiring, Access Matrix grid |
| H16–18 | AI panel, Attack Replay tab |
| H19+ | Polish, bug fixes, loading/error states |

---

## 12. Design Inspiration & Notes

- Think: **Burp Suite dashboard meets Vercel's design language**
- Dark background (`#0a0a0f` or similar very dark navy/black)
- Subtle glow effects on cards
- Monospace everywhere for technical content
- Smooth transitions between pages
- The Finding Detail page should feel like reading a forensic report
- The Access Matrix should be immediately understandable at a glance
- Use subtle animations for scan progress — but only driven by real events

---

> [!TIP]
> **The single most important page is Finding Detail.** If only one page looks incredible, make it this one. The judges will spend the most time here during the demo. The "Why This Severity" panel and the side-by-side evidence diff are the money shots.
