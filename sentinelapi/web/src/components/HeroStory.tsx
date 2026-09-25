import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, ScanLine, Shield } from 'lucide-react'
import ScannerStage, { type StoryState } from '../three/ScannerStage'
import { LAYERS, T, clamp01, easeInOut, seg } from '../lib/story'

const FRAME = '#131417'
const CREAM = '#f3efe6'

/** Inline icon between "There is a" and "Better Way" — a mini stack of layers. */
function LayerIcon({ className = '' }: { className?: string }) {
  const plate = 'M24 29 L42 20 L24 11 L6 20 Z'
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <g stroke="#0E1116" strokeWidth="1.8" strokeLinejoin="round">
        <path d={plate} fill="#ffffff" transform="translate(0 12)" />
        <path d={plate} fill="#ff7a1a" transform="translate(0 6)" />
        <path d={plate} fill="#ffffff" />
      </g>
      <ellipse cx="24" cy="20" rx="5" ry="2.6" fill="none" stroke="#0E1116" strokeWidth="1.6" />
      <circle cx="24" cy="20" r="1.4" fill="#0E1116" />
    </svg>
  )
}

/** Concave corner that blends a notch into the card (the FYNSEC cut-out look). */
function Fillet({ className, at, color }: { className: string; at: string; color: string }) {
  return <span aria-hidden className={`pointer-events-none absolute size-[22px] ${className}`}
    style={{ background: `radial-gradient(circle at ${at}, transparent 21.5px, ${color} 22px)` }} />
}

/** Static illustration if WebGL is unavailable. */
function StackFallback() {
  const colors = ['#d9dde3', '#2c3038', '#cdfb47', '#f3f2ee', '#ff7a1a', '#aab1bc']
  return (
    <svg viewBox="0 0 400 420" className="absolute right-[6%] top-1/2 h-[70%] -translate-y-1/2" aria-hidden>
      {colors.map((c, i) => (
        <path key={i} d="M200 250 L360 175 L200 100 L40 175 Z" fill={c} stroke="#0E1116" strokeOpacity=".25" transform={`translate(0 ${i * 26})`} />
      ))}
      <ellipse cx="200" cy="120" rx="58" ry="26" fill="#e6e8ec" stroke="#0E1116" strokeOpacity=".3" />
      <ellipse cx="200" cy="112" rx="40" ry="17" fill="#1a2b8a" />
    </svg>
  )
}

class StageBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onFail() }
  render() { return this.state.failed ? null : this.props.children }
}

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}

export default function HeroStory() {
  const wrapRef = useRef<HTMLElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const scanRef = useRef<HTMLDivElement>(null)
  const finalRef = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)
  const miniNavRef = useRef<HTMLDivElement>(null)
  const chapterRefs = useRef<(HTMLSpanElement | null)[]>([])
  const labelRefs = useRef<(HTMLDivElement | null)[]>([])
  const statusRefs = useRef<(HTMLSpanElement | null)[]>([])
  const story = useRef<StoryState>({ progress: 0, crazy: false, has3D: false })

  const [crazy, setCrazy] = useState(false)
  const [threeFailed, setThreeFailed] = useState(() => typeof window !== 'undefined' && !webglOK())
  const onFail = useCallback(() => setThreeFailed(true), [])
  useEffect(() => { story.current.crazy = crazy }, [crazy])

  // Scroll -> smoothed progress -> overlays. Runs even without WebGL.
  useEffect(() => {
    let raf = 0
    let sp = 0
    let last = performance.now()
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const lastStatus: string[] = []

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const wrap = wrapRef.current
      if (!wrap) return
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const r = wrap.getBoundingClientRect()
      const total = r.height - window.innerHeight
      const p = total > 0 ? clamp01(-r.top / total) : 0
      // time-based easing: same glide at 60/120/144 Hz
      sp += (p - sp) * (reduce ? 1 : 1 - Math.exp(-dt * 5.5))
      if (Math.abs(p - sp) < 0.0003) sp = p
      story.current.progress = sp

      // mini nav once the hero has scrolled away
      const past = r.bottom < 90
      if (miniNavRef.current) {
        miniNavRef.current.style.opacity = past ? '1' : '0'
        miniNavRef.current.style.transform = `translate(-50%, ${past ? 0 : -24}px)`
        miniNavRef.current.style.pointerEvents = past ? 'auto' : 'none'
      }

      const out = easeInOut(seg(sp, T.heroOut))
      if (heroRef.current) {
        heroRef.current.style.opacity = String(1 - out)
        heroRef.current.style.transform = `translateY(calc(-50% - ${out * 70}px))`
        heroRef.current.style.pointerEvents = out > 0.5 ? 'none' : 'auto'
      }
      const scanIn = seg(sp, T.scanTitle) * (1 - seg(sp, [0.83, 0.88]))
      if (scanRef.current) {
        scanRef.current.style.opacity = String(scanIn)
        scanRef.current.style.transform = `translateY(calc(-50% + ${(1 - scanIn) * 40}px))`
      }
      const scanP = seg(sp, T.scan)
      if (barRef.current) barRef.current.style.width = `${(scanP * 100).toFixed(1)}%`
      if (pctRef.current) pctRef.current.textContent = `${Math.round(scanP * 100)}%`
      const fin = seg(sp, T.final)
      if (finalRef.current) {
        finalRef.current.style.opacity = String(fin)
        finalRef.current.style.transform = `translateY(calc(-50% + ${(1 - fin) * 40}px))`
        finalRef.current.style.pointerEvents = fin > 0.5 ? 'auto' : 'none'
      }
      if (cueRef.current) cueRef.current.style.opacity = String(1 - seg(sp, [0.005, 0.05]))

      const chapter = sp < 0.3 ? 0 : sp < 0.84 ? 1 : 2
      chapterRefs.current.forEach((el, i) => { if (el) el.dataset.active = String(i === chapter) })

      // layer labels: reveal as the sweep reaches them, status queued -> scanning -> proven
      const labelsOn = seg(sp, [0.3, 0.4]) * (1 - seg(sp, [0.83, 0.88]))
      const card = cardRef.current
      const cw = card?.clientWidth ?? 1000, ch = card?.clientHeight ?? 700
      LAYERS.forEach((_, i) => {
        const el = labelRefs.current[i]
        if (!el) return
        const reveal = labelsOn * clamp01((scanP - i / LAYERS.length + 0.06) / 0.08)
        el.style.opacity = String(reveal)
        if (!story.current.has3D) el.style.transform = `translate3d(${cw * 0.56}px, ${ch * (0.2 + i * 0.11)}px, 0) translateY(-50%)`
        const status = scanP >= (i + 1) / LAYERS.length ? 'proven' : scanP >= i / LAYERS.length && scanP > 0 ? 'scanning' : 'queued'
        if (lastStatus[i] !== status) {
          lastStatus[i] = status
          const st = statusRefs.current[i]
          if (st) { st.textContent = status === 'proven' ? '✓ proven' : status === 'scanning' ? '● scanning' : 'queued'; st.dataset.state = status }
        }
      })
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [])

  const navLinks: [string, string][] = [['Product', '#product'], ['How it works', '#how'], ['Detectors', '#detectors'], ['Proof', '#proof']]

  return (
    <>
      {/* floating nav that appears after the hero */}
      <div ref={miniNavRef} className="fixed left-1/2 top-4 z-50 w-[min(1100px,calc(100%-2rem))] opacity-0 transition-[opacity,transform] duration-300" style={{ transform: 'translate(-50%,-24px)' }}>
        <div className="flex items-center justify-between rounded-full border border-white/80 bg-paper/95 px-4 py-2 backdrop-blur-xl" style={{ boxShadow: '0 18px 40px -22px rgba(20,20,25,.55)' }}>
          <Link to="/" className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-ink text-lime"><Shield size={15} /></span><span className="font-display font-semibold">SentinelAPI</span></Link>
          <nav className="hidden gap-1 md:flex">{navLinks.map(([l, h]) => <a key={h} href={h} className="rounded-full px-3 py-1.5 text-sm text-ink2 hover:bg-cream2">{l}</a>)}</nav>
          <Link to="/scan/new" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-ink2">Start a scan</Link>
        </div>
      </div>

      <section ref={wrapRef} className="relative" style={{ height: '430vh' }}>
        <div className="sticky top-0 h-screen p-2.5 sm:p-4">
          <div className="flex h-full flex-col rounded-[30px] p-2 sm:p-2.5" style={{ background: FRAME }}>

            {/* ---------- top bar with notched nav tab ---------- */}
            <div className="relative flex h-14 shrink-0 items-stretch sm:h-16">
              <Link to="/" className="flex items-center gap-2.5 px-3 text-cream sm:px-5">
                <span className="grid size-6 place-items-center rounded-[6px] border-2 border-cream"><span className="size-2 rounded-[2px] bg-lime" /></span>
                <span className="font-display text-lg font-medium tracking-tight">SentinelAPI</span>
              </Link>
              <div className="relative ml-2 hidden items-center rounded-t-[22px] px-3 md:flex" style={{ background: CREAM }}>
                <Fillet className="-left-[22px] bottom-0" at="0 0" color={CREAM} />
                <Fillet className="-right-[22px] bottom-0" at="100% 0" color={CREAM} />
                <nav className="flex items-center gap-1 rounded-full border border-ink/80 px-1.5 py-1">
                  {navLinks.map(([l, h]) => <a key={h} href={h} className="rounded-full px-3.5 py-1 text-[13px] text-ink transition-colors hover:bg-ink hover:text-cream">{l}</a>)}
                </nav>
              </div>
              <div className="ml-auto flex items-center gap-2 pr-1 sm:pr-2">
                <a href="#how" className="hidden items-center gap-1.5 rounded-full border border-white/25 px-4 py-2 text-[13px] text-cream/90 transition-colors hover:bg-white/10 sm:inline-flex">Docs <ChevronDown size={14} /></a>
                <Link to="/scan/new" className="inline-flex items-center gap-2 rounded-full border border-white/25 py-1.5 pl-1.5 pr-4 text-[13px] text-cream transition-colors hover:bg-white/10">
                  <span className="grid size-6 place-items-center rounded-full bg-cream text-ink"><ArrowRight size={13} /></span>Start a Scan
                </Link>
              </div>
            </div>

            {/* ---------- the cream card ---------- */}
            <div ref={cardRef} className="relative min-h-0 flex-1 overflow-hidden rounded-[24px]" style={{ background: `radial-gradient(120% 90% at 70% 40%, #faf8f2 0%, ${CREAM} 55%, #ebe5d8 100%)` }}>
              {threeFailed ? <StackFallback /> : (
                <StageBoundary onFail={onFail}>
                  <ScannerStage story={story} labelRefs={labelRefs} onFail={onFail} />
                </StageBoundary>
              )}

              {/* chapter indicator */}
              <div className="absolute right-5 top-5 z-20 hidden gap-1.5 sm:flex">
                {['01 Stack', '02 Sweep', '03 Proven'].map((c, i) => (
                  <span key={c} ref={el => { chapterRefs.current[i] = el }} data-active={i === 0}
                    className="mono rounded-full border border-ink/15 px-2.5 py-1 text-[10px] text-muted transition-colors data-[active=true]:border-ink data-[active=true]:bg-ink data-[active=true]:text-cream">{c}</span>
                ))}
              </div>

              {/* chapter 1: hero copy */}
              <div ref={heroRef} className="absolute left-[5%] top-1/2 z-10 max-w-[600px] pr-4" style={{ transform: 'translateY(-50%)' }}>
                <h1 className="font-display text-[clamp(2.7rem,6vw,5.6rem)] font-normal leading-[1.02] tracking-[-0.035em] text-ink">
                  There is a<br />
                  <LayerIcon className="mr-3 inline-block h-[0.82em] w-[0.82em] align-[-0.1em]" />Better Way<br />
                  to Secure APIs.
                </h1>
                <Link to="/scan/new" className="group mt-10 flex w-fit items-center gap-3 border-b border-ink pb-3 pr-24 text-sm font-medium">
                  <span className="grid size-5 place-items-center rounded-full bg-ink text-cream transition-transform group-hover:translate-x-1"><ArrowRight size={11} /></span>Start a Scan
                </Link>
                <p className="mt-4 max-w-[340px] text-[13px] leading-5 text-ink2">SentinelAPI is an API vulnerability scanner that proves authorization flaws across every endpoint and identity — before they become costly data breaches.</p>
              </div>

              {/* chapter 2: sweep */}
              <div ref={scanRef} className="pointer-events-none absolute left-[5%] top-1/2 z-10 max-w-[400px] opacity-0">
                <p className="mono text-xs text-muted">/ live sweep</p>
                <h2 className="font-display mt-3 text-[clamp(2.2rem,4vw,3.6rem)] font-normal leading-[1.02] tracking-[-0.03em]">Six layers.<br />One sweep.</h2>
                <p className="mt-4 text-sm leading-6 text-ink2">The lens becomes a projector. Every identity’s request is pushed through every layer — and each layer is <b>proven</b> from the response body, never guessed.</p>
                <div className="mt-6 flex items-center gap-3">
                  <span className="mono text-[11px] text-muted">SWEEP</span>
                  <div className="h-1.5 w-44 overflow-hidden rounded-full bg-ink/10"><div ref={barRef} className="h-full rounded-full bg-ink" style={{ width: 0 }} /></div>
                  <span ref={pctRef} className="mono w-9 text-[11px]">0%</span>
                </div>
              </div>

              {/* chapter 3: proven */}
              <div ref={finalRef} className="pointer-events-none absolute left-[5%] top-1/2 z-10 max-w-[440px] opacity-0">
                <p className="mono text-xs text-muted">/ result</p>
                <h2 className="font-display mt-3 text-[clamp(2.2rem,4vw,3.6rem)] font-normal leading-[1.02] tracking-[-0.03em]">Every layer,<br />proven.</h2>
                <p className="mt-4 text-sm leading-6 text-ink2">Six OWASP API detectors · real HTTP evidence · a copy-paste PoC · and a fix you can re-verify live.</p>
                <Link to="/scan/new" className="lime-btn mt-7 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm"><ScanLine size={16} /> Start a scan</Link>
              </div>

              {/* layer labels (positioned by the 3D scene) */}
              <div className="pointer-events-none absolute inset-0 z-10 hidden sm:block">
                {LAYERS.map((L, i) => (
                  <div key={L.key} ref={el => { labelRefs.current[i] = el }} className="absolute left-0 top-0 opacity-0 will-change-transform">
                    <div className="flex items-center">
                      <span className="h-px w-8 bg-ink/40" />
                      <span className="size-1.5 rounded-full bg-ink" />
                      <div className="ml-2.5 rounded-2xl border border-white/80 bg-paper/85 px-3.5 py-2 backdrop-blur-md" style={{ boxShadow: '0 12px 30px -18px rgba(20,20,25,.45)' }}>
                        <div className="flex items-center gap-2">
                          <span className="size-2.5 rounded-[3px] border border-ink/20" style={{ background: L.color }} />
                          <span className="mono text-[10px] text-muted">L0{i + 1} · {L.owasp}</span>
                          <span ref={el => { statusRefs.current[i] = el }} data-state="queued"
                            className="mono rounded-full px-1.5 py-px text-[10px] text-muted data-[state=proven]:bg-lime/50 data-[state=proven]:text-[#33420a] data-[state=scanning]:text-ink">queued</span>
                        </div>
                        <div className="font-display mt-0.5 text-sm font-semibold leading-tight">{L.name}</div>
                        <div className="text-[10.5px] text-muted">{L.full}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* scroll cue */}
              <div ref={cueRef} className="pointer-events-none absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 text-[11px] text-muted">
                <span className="relative h-8 w-5 rounded-full border border-ink/40"><span className="floaty absolute left-1/2 top-1.5 h-1.5 w-1 -translate-x-1/2 rounded-full bg-ink" /></span>
                Scroll to open the layers
              </div>

              {/* crazy-mode notch (bottom-right) */}
              <div className="absolute bottom-0 right-0 z-20 rounded-tl-[22px] pb-1 pl-4 pr-1 pt-3" style={{ background: FRAME }}>
                <Fillet className="-top-[22px] right-0" at="0 0" color={FRAME} />
                <Fillet className="-left-[22px] bottom-0" at="0 0" color={FRAME} />
                <div className="flex items-center gap-2 pr-2 text-[12px] text-cream/80">
                  Crazy mode:
                  <div className="flex rounded-full border border-white/25 p-0.5">
                    <button onClick={() => setCrazy(true)} className={`rounded-full px-3 py-0.5 transition-colors ${crazy ? 'bg-lime text-ink' : 'text-cream/80 hover:text-cream'}`}>On</button>
                    <button onClick={() => setCrazy(false)} className={`rounded-full px-3 py-0.5 transition-colors ${!crazy ? 'bg-cream text-ink' : 'text-cream/80 hover:text-cream'}`}>Off</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
