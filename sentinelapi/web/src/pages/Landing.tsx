import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, ArrowUpRight, Boxes, Eye, Fingerprint, Gauge, KeyRound,
  Radar, ScanLine, ShieldCheck, Sparkles, Terminal, Check, type LucideIcon,
} from 'lucide-react'
import { LandingNav } from '../components/Nav'
import { Reveal, Stagger, Item, motion } from '../components/motion'
import Hero3D from '../three/Hero3D'

interface Detector { icon: LucideIcon; name: string; owasp: string; hero?: boolean; desc: string }
const DETECTORS: Detector[] = [
  { icon: Fingerprint, name: 'BOLA', owasp: 'API1', hero: true, desc: 'Proves one user can read another user’s objects — ownership read from the response body, not the status code.' },
  { icon: KeyRound, name: 'Broken Auth', owasp: 'API2', desc: 'Secured endpoints that answer an anonymous or malformed-token request with real data.' },
  { icon: Eye, name: 'Excessive Exposure', owasp: 'API3', desc: 'Responses leaking password hashes, internal notes, or undocumented fields.' },
  { icon: Gauge, name: 'Rate Limiting', owasp: 'API4', desc: 'Auth endpoints with no throttling — a burst of failed logins that never gets a 429.' },
  { icon: ShieldCheck, name: 'BFLA', owasp: 'API5', desc: 'Low-privilege identities reaching admin-only functions.' },
  { icon: Boxes, name: 'Misconfiguration', owasp: 'API8', desc: 'Missing headers, reflected CORS with credentials, exposed debug endpoints, version leaks.' },
]

const STORY = ['Understand', 'Test', 'Prove', 'Explain', 'Verify']

const STEPS = [
  { n: '01', t: 'Ingest the spec', d: 'Upload an OpenAPI file. We classify every endpoint — which carry objects, which claim to require auth.' },
  { n: '02', t: 'Sweep every identity', d: 'Anonymous, two users, and an admin probe every endpoint. Authorization is a property of who asks for what.' },
  { n: '03', t: 'Prove the boundary', d: 'For each candidate, a six-probe control set runs — four probes exist only to prove us wrong.' },
  { n: '04', t: 'Explain & verify', d: 'Plain-English impact, a copy-paste PoC, and a re-verify button that re-runs the real request against your API.' },
]

function GrainToggle() {
  const [grain, setGrain] = useState(true)
  const toggle = () => { setGrain(g => { document.body.classList.toggle('no-grain', g); return !g }) }
  return (
    <button onClick={toggle} className="chip inline-flex items-center gap-2 rounded-full bg-cream2 px-3 py-1.5 text-[11px] font-semibold text-ink2 hover:bg-paper">
      <span className={`grid size-4 place-items-center rounded-full ${grain ? 'bg-ink text-lime' : 'bg-transparent text-muted'}`}>{grain && <Check size={11} />}</span>
      Grain
    </button>
  )
}

export default function Landing() {
  return (
    <div className="relative z-10">
      <LandingNav />

      {/* ---------------- HERO ---------------- */}
      <section className="mx-auto max-w-6xl px-4 pt-8">
        <div className="glass-card relative overflow-hidden p-6 sm:p-10">
          {/* soft lime glow */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-lime/30 blur-3xl" />
          <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_.95fr]">
            <div>
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
                className="mb-5 inline-flex items-center gap-2 rounded-full border border-hair bg-paper px-3 py-1.5 text-xs font-medium text-ink2">
                <span className="live-dot size-1.5 rounded-full bg-lime2" /> Zero-Trust API Vulnerability Scanner
              </motion.div>
              <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.05 }}
                className="font-display text-[2.6rem] font-bold leading-[1.02] tracking-tight sm:text-6xl">
                There is a better way<br />to <span className="relative">secure<span className="absolute -bottom-1 left-0 h-3 w-full rounded-full bg-lime/60" /></span> your APIs.
              </motion.h1>
              <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.12 }}
                className="mt-5 max-w-lg text-base leading-7 text-ink2">
                SentinelAPI reads your OpenAPI spec, refuses to trust it, and tests every endpoint against every identity — then <b>proves</b> that one customer can read another’s data with the exact request and response.
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.18 }}
                className="mt-7 flex flex-wrap items-center gap-3">
                <Link to="/scan/new" className="lime-btn inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold hover:brightness-105">
                  <ScanLine size={17} /> Start a scan
                </Link>
                <a href="#how" className="inline-flex items-center gap-2 rounded-full border border-hair bg-paper px-5 py-3 text-sm font-semibold hover:bg-cream2">
                  See how it works <ArrowRight size={15} />
                </a>
                <span className="ml-1 text-xs text-muted">Sandbox-only · authorized targets</span>
              </motion.div>
            </div>

            {/* 3D orb */}
            <div className="relative">
              <div className="mx-auto aspect-square w-full max-w-[460px]">
                <Hero3D />
              </div>
              <div className="absolute bottom-1 right-1"><GrainToggle /></div>
            </div>
          </div>

          {/* five-word story ribbon */}
          <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hair pt-6 text-sm">
            {STORY.map((s, i) => (
              <span key={s} className="flex items-center gap-3">
                <span className="font-display font-semibold">{s}</span>
                {i < STORY.length - 1 && <ArrowRight size={14} className="text-muted" />}
              </span>
            ))}
            <span className="ml-auto text-xs text-muted">The AI explains. The scanner executes. Evidence verifies.</span>
          </div>
        </div>
      </section>

      {/* ---------------- MARQUEE ---------------- */}
      <section className="mx-auto mt-6 max-w-6xl px-4">
        <div className="panel overflow-hidden p-6">
          <p className="mb-4 px-1 text-sm text-oncream/70">Built to catch the logic flaws signature scanners miss — across the OWASP API Top 10.</p>
          <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
            <div className="marquee flex w-max gap-3">
              {[...Array(2)].flatMap((_, k) => ['API1 · BOLA', 'API2 · Broken Auth', 'API3 · Data Exposure', 'API4 · Rate Limiting', 'API5 · BFLA', 'API8 · Misconfiguration', 'API9 · Spec Drift'].map((t, i) => (
                <span key={`${k}-${i}`} className="mono chip rounded-full border border-panelhair bg-panel2 px-4 py-2 text-sm text-oncream/90">{t}</span>
              )))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- PRODUCT (dark, lime accent) ---------------- */}
      <section id="product" className="mx-auto mt-6 max-w-6xl px-4">
        <div className="panel grid gap-6 p-6 sm:p-10 lg:grid-cols-3">
          <Reveal className="lg:col-span-1">
            <p className="mono text-xs text-lime">/ what it does</p>
            <h2 className="font-display mt-3 text-3xl font-bold leading-tight text-cream">A 200 OK is not authorization.</h2>
            <p className="mt-4 text-sm leading-7 text-oncream/70">Most tools fuzz endpoints and hope for a crash, or ask an LLM whether something looks vulnerable. Neither can prove an authorization boundary is broken. SentinelAPI proves it from the response body.</p>
            <Link to="/scan/new" className="lime-btn mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm">Run the demo <ArrowUpRight size={15} /></Link>
          </Reveal>
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            {([
              { t: 'Real HTTP evidence', d: 'Every finding ships the exact request and response, redacted, with a reproducible cURL PoC.', icon: Terminal },
              { t: 'Six-probe proof', d: 'Ownership proven from the body; four control probes exist only to falsify the finding.', icon: Radar },
              { t: 'Transparent severity', d: 'An additive rubric shows exactly which factors fired — no black-box score, no fake percentages.', icon: Gauge },
              { t: 'Fix, then verify', d: 'Apply a fix and re-verify re-runs the real request live — watch Critical flip to Fixed.', icon: Sparkles },
            ] as { t: string; d: string; icon: LucideIcon }[]).map(c => (
              <Item key={c.t} className="rounded-2xl border border-panelhair bg-panel2 p-5">
                <c.icon className="text-lime" size={20} />
                <h3 className="font-display mt-3 text-base font-semibold text-cream">{c.t}</h3>
                <p className="mt-1.5 text-sm leading-6 text-oncream/65">{c.d}</p>
              </Item>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ---------------- DETECTORS ---------------- */}
      <section id="detectors" className="mx-auto mt-16 max-w-6xl px-4">
        <Reveal><div className="flex items-end justify-between">
          <div><p className="mono text-xs text-muted">/ detectors</p><h2 className="font-display mt-2 text-3xl font-bold tracking-tight sm:text-4xl">One sweep. Six classes of proof.</h2></div>
          <span className="hidden text-sm text-muted sm:block">All from one request budget</span>
        </div></Reveal>
        <Stagger className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DETECTORS.map(d => (
            <Item key={d.name}>
              <div className={`group relative h-full overflow-hidden rounded-2xl border p-6 transition-transform hover:-translate-y-1 ${d.hero ? 'border-lime2/50' : 'border-hair'}`}
                style={{ background: d.hero ? 'linear-gradient(180deg,#eef9c8,#f7fadf)' : 'var(--color-paper)' }}>
                <div className="flex items-center justify-between">
                  <span className={`grid size-11 place-items-center rounded-xl ${d.hero ? 'bg-ink text-lime' : 'bg-cream2 text-ink'}`}><d.icon size={20} /></span>
                  <span className="mono text-xs text-muted">{d.owasp}</span>
                </div>
                <h3 className="font-display mt-4 flex items-center gap-2 text-lg font-semibold">{d.name}{d.hero && <span className="chip rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-lime">HERO</span>}</h3>
                <p className="mt-1.5 text-sm leading-6 text-ink2">{d.desc}</p>
              </div>
            </Item>
          ))}
        </Stagger>
      </section>

      {/* ---------------- HOW IT WORKS ---------------- */}
      <section id="how" className="mx-auto mt-16 max-w-6xl px-4">
        <Reveal><p className="mono text-xs text-muted">/ how it works</p><h2 className="font-display mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Spec in. Proof out.</h2></Reveal>
        <Stagger className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(s => (
            <Item key={s.n}>
              <div className="glass-card h-full p-6">
                <div className="font-display text-3xl font-bold text-lime2">{s.n}</div>
                <h3 className="font-display mt-3 text-lg font-semibold">{s.t}</h3>
                <p className="mt-1.5 text-sm leading-6 text-ink2">{s.d}</p>
              </div>
            </Item>
          ))}
        </Stagger>
      </section>

      {/* ---------------- PROOF ---------------- */}
      <section id="proof" className="mx-auto mt-16 max-w-6xl px-4">
        <div className="glass-card grid gap-8 overflow-hidden p-6 sm:p-10 lg:grid-cols-2">
          <Reveal>
            <p className="mono text-xs text-muted">/ the proof</p>
            <h2 className="font-display mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">We don’t call it a bug because of the 200.</h2>
            <p className="mt-4 text-sm leading-7 text-ink2">userA asks for order <b>#102</b>. It belongs to userB. We call it Critical because the owner field in the body resolves to userB, six probes ran, four of them to disprove it, and the decisive request reproduced.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {['P1 victim baseline', 'P2 attack', 'P3 attacker baseline', 'P4 anonymous', 'P5 stub', 'P6 repeat'].map((p, i) => (
                <span key={p} className="chip rounded-full border border-hair bg-paper px-3 py-1.5 text-xs font-medium"><b className="text-lime2">{p.split(' ')[0]}</b> {p.split(' ').slice(1).join(' ')}</span>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="panel overflow-hidden p-5">
              <div className="mb-3 flex items-center justify-between text-xs text-oncream/60"><span className="mono">GET /orders/102</span><span className="chip rounded-full bg-sev-critical/20 px-2 py-0.5 font-bold text-cream" style={{ background: 'color-mix(in srgb,var(--color-sev-critical) 30%,transparent)' }}>CRITICAL</span></div>
              <pre className="mono overflow-x-auto rounded-xl bg-panel2 p-3 text-[11px] leading-relaxed text-oncream/90 border border-panelhair">{`{
  "id": 102,
  "userId": 2,        ← belongs to userB
  "item": "Cyberpunk Hoodie",
  "amount": 89.5,
  "status": "shipped"
}`}</pre>
              <div className="mt-3 flex items-center gap-2 text-xs text-oncream/70"><span className="live-dot size-1.5 rounded-full bg-lime2" /> returned to <b className="text-cream">userA</b> — authorization boundary crossed</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="mx-auto mt-16 max-w-6xl px-4">
        <div className="panel relative overflow-hidden p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-lime/20 blur-3xl" />
          <h2 className="font-display relative text-4xl font-bold tracking-tight text-cream sm:text-5xl">Prove your API is secure.</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-oncream/70">Upload a spec, verify your identities, and watch a real scan find, prove, and verify a fix — in under two minutes.</p>
          <Link to="/scan/new" className="lime-btn relative mt-8 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold hover:brightness-105"><ScanLine size={18} /> Start a scan</Link>
        </div>
      </section>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="mx-auto mt-14 max-w-6xl px-4 pb-12">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-hair pt-8 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted"><ShieldCheck size={16} /> SentinelAPI — AmiHacks · Zero-Trust API Scanner</div>
          <div className="flex items-center gap-5 text-sm text-muted">
            <a href="#detectors" className="hover:text-ink">Detectors</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <Link to="/scan/new" className="hover:text-ink">Start a scan</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
