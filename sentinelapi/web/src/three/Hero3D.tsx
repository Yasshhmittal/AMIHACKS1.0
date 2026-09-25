import { Component, lazy, Suspense, type ReactNode } from 'react'

const LiquidOrb = lazy(() => import('./LiquidOrb'))

/** Animated CSS/SVG fallback — used while the 3D chunk loads, if WebGL is
 * unavailable, or if the 3D renderer throws. Genuinely pretty on its own. */
export function OrbFallback() {
  return (
    <div className="relative grid h-full w-full place-items-center">
      <div className="floaty relative h-[78%] w-[78%]">
        <div className="iri spin-slow absolute inset-0 rounded-full blur-[2px] opacity-90"
          style={{ maskImage: 'radial-gradient(circle at 50% 50%, transparent 38%, #000 40%, #000 62%, transparent 64%)', WebkitMaskImage: 'radial-gradient(circle at 50% 50%, transparent 38%, #000 40%, #000 62%, transparent 64%)' }} />
        <div className="absolute inset-[14%] rounded-full"
          style={{ background: 'radial-gradient(120% 120% at 30% 25%, #ffffff, #eef0f5 40%, #cdd2dc 75%, #aeb6c4)', boxShadow: 'inset 0 20px 50px rgba(255,255,255,.9), inset 0 -30px 60px rgba(80,90,110,.4), 0 40px 80px -30px rgba(30,30,40,.4)' }} />
        <div className="absolute left-[26%] top-[22%] h-[22%] w-[22%] rounded-full bg-white/80 blur-md" />
      </div>
    </div>
  )
}

class OrbBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <OrbFallback /> : this.props.children }
}

function webglOK(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')))
  } catch { return false }
}

export default function Hero3D() {
  if (!webglOK()) return <OrbFallback />
  return (
    <OrbBoundary>
      <Suspense fallback={<OrbFallback />}>
        <LiquidOrb />
      </Suspense>
    </OrbBoundary>
  )
}
