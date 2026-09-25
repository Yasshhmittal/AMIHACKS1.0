import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, ArrowUpRight, Boxes, Eye, Fingerprint, Gauge, KeyRound,
  Radar, ScanLine, ShieldCheck, Sparkles, Terminal, type LucideIcon,
} from 'lucide-react'
import HeroStory from '../components/HeroStory'
import { Reveal, Stagger, Item } from '../components/motion'

interface Detector { icon: LucideIcon; name: string; owasp: string; hero?: boolean; desc: string }
const DETECTORS: Detector[] = [
  { icon: Fingerprint, name: 'BOLA', owasp: 'API1', hero: true, desc: 'Proves one user can read another user’s objects — ownership read from the response body, not the status code.' },
  { icon: KeyRound, name: 'Broken Auth', owasp: 'API2', desc: 'Secured endpoints that answer an anonymous or malformed-token request with real data.' },
  { icon: Eye, name: 'Excessive Exposure', owasp: 'API3', desc: 'Responses leaking password hashes, internal notes, or undocumented fields.' },
  { icon: Gauge, name: 'Rate Limiting', owasp: 'API4', desc: 'Auth endpoints with no throttling — a burst of failed logins that never gets a 429.' },
  { icon: ShieldCheck, name: 'BFLA', owasp: 'API5', desc: 'Low-privilege identities reaching admin-only functions.' },
  { icon: Boxes, name: 'Misconfiguration', owasp: 'API8', desc: 'Missing headers, reflected CORS with credentials, exposed debug endpoints, version leaks.' },
]

const STEPS = [
  { n: '01', t: 'Ingest the spec', d: 'Upload an OpenAPI file. We classify every endpoint — which carry objects, which claim to require auth.' },
  { n: '02', t: 'Sweep every identity', d: 'Anonymous, two users, and an admin probe every endpoint. Authorization is a property of who asks for what.' },
  { n: '03', t: 'Prove the boundary', d: 'For each candidate, a six-probe control set runs — four probes exist only to prove us wrong.' },
  { n: '04', t: 'Explain & verify', d: 'Plain-English impact, a copy-paste PoC, and a re-verify button that re-runs the real request against your API.' },
]

function TabCard({ index, hero, children }: { index: number; hero: boolean; children: ReactNode }) {
  const bg = hero ? '#d4f55a' : '#1b2028'
  return (
    <div className="group relative h-full pt-8 transition-transform duration-300 hover:-translate-y-1.5">
      <div className="mono absolute left-0 top-0 flex h-8 w-[68px] items-center rounded-t-[14px] pl-3.5 text-[11px]" style={{ background: bg, color: hero ? '#1d2a05' : '#9aa3ad' }}>/ {String(index + 1).padStart(2, '0')}</div>
      <span aria-hidden className="absolute left-[68px] top-[10px] size-[22px]" style={{ background: `radial-gradient(circle at 100% 0, transparent 21.5px, ${bg} 22px)` }} />
      <div className="relative h-full min-h-[280px] rounded-[18px] rounded-tl-none p-6" style={{ background: bg }}>{children}</div>
    </div>
  )
}

function GlossyIcon({ icon: Icon, accent }: { icon: LucideIcon; accent: string }) {
  return (
    <div className="relative mt-3 grid size-24 place-items-center transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-105">
      <div className="absolute inset-0 rounded-[28px]" style={{ background: 'linear-gradient(145deg,#f6f7f9 0%,#cdd2da 45%,#8b93a0 100%)', boxShadow: 'inset 0 2px 6px rgba(255,255,255,.9), inset 0 -8px 16px rgba(40,45,55,.45), 0 20px 34px -14px rgba(0,0,0,.8)' }} />
      <div className="absolute inset-[19%] rounded-[18px]" style={{ background: `linear-gradient(145deg, ${accent}, color-mix(in srgb, ${accent} 70%, #000))`, boxShadow: 'inset 0 2px 4px rgba(255,255,255,.55), inset 0 -4px 8px rgba(0,0,0,.25)' }} />
      <Icon size={26} strokeWidth={2.2} className="relative text-[#12151a]" />
    </div>
  )
}

export default function Landing() {
  return (
    <div className="relative z-10">
      <HeroStory />

      {/* ---------------- MARQUEE ---------------- */}
      <section className="mx-auto mt-10 max-w-6xl px-4">
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
      <section id="product" className="scroll-mt-28 mx-auto mt-6 max-w-6xl px-4">
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

      {/* ---------------- DETECTORS (numbered tab cards) ---------------- */}
      <section id="detectors" className="scroll-mt-28 mx-auto mt-16 max-w-6xl px-4">
        <div className="panel p-6 sm:p-10">
          <Reveal>
            <div className="grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
              <div>
                <p className="mono text-xs text-lime">/ detectors</p>
                <h2 className="font-display mt-4 text-[clamp(2.3rem,4.4vw,3.9rem)] font-normal leading-[1.04] tracking-[-0.035em] text-cream">
                  Six things SentinelAPI <span className="relative whitespace-nowrap text-lime">proves<svg aria-hidden viewBox="0 0 200 12" className="absolute -bottom-2 left-0 w-full" preserveAspectRatio="none"><path d="M2 8 C 50 2, 150 2, 198 7" stroke="#cdfb47" strokeWidth="3" fill="none" strokeLinecap="round" /></svg></span> —<br className="hidden sm:block" /> not guesses.
                </h2>
              </div>
              <div className="lg:pb-2">
                <p className="max-w-md text-sm leading-6 text-oncream/65">One Access-Matrix sweep tests every endpoint against every identity and turns each suspicion into evidence — six OWASP API classes from a single request budget.</p>
                <a href="#how" className="mt-5 inline-flex items-center gap-2 text-sm text-cream transition-colors hover:text-lime"><span className="grid size-5 place-items-center rounded-full bg-cream text-ink"><ArrowRight size={11} /></span>How it works</a>
              </div>
            </div>
          </Reveal>
          <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {DETECTORS.map((d, i) => (
              <Item key={d.name} className="h-full">
                <TabCard index={i} hero={!!d.hero}>
                  {d.hero ? (
                    <div className="flex h-full flex-col">
                      <span className="mono text-[11px] text-[#3c4f07]">{d.owasp} · the hero detector</span>
                      <h3 className="font-display mt-2 text-2xl font-normal text-[#1d2a05]">{d.name}</h3>
                      <p className="mt-2 text-[14px] leading-6 text-[#1d2a05]">{d.desc}</p>
                      <p className="mt-2 text-[12.5px] leading-5 text-[#3c4f07]">Six probes run — victim baseline, attack, attacker baseline, anonymous, stub and repeat. Four exist only to prove us wrong.</p>
                      <Link to="/scan/new" className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-medium text-[#1d2a05]"><span className="grid size-5 place-items-center rounded-full bg-[#1d2a05] text-lime"><ArrowRight size={11} /></span>Run it</Link>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-between gap-5 text-center">
                      <GlossyIcon icon={d.icon} accent={i % 2 ? '#ff8a2b' : '#b9e33a'} />
                      <div>
                        <h3 className="font-display text-xl font-normal leading-tight text-cream">{d.name}</h3>
                        <p className="mt-2 text-[12.5px] leading-5 text-oncream/55">{d.desc}</p>
                        <span className="mono mt-3 inline-block text-[10px] text-oncream/40">{d.owasp}</span>
                      </div>
                    </div>
                  )}
                </TabCard>
              </Item>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ---------------- HOW IT WORKS ---------------- */}
      <section id="how" className="scroll-mt-28 mx-auto mt-16 max-w-6xl px-4">
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
      <section id="proof" className="scroll-mt-28 mx-auto mt-16 max-w-6xl px-4">
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
