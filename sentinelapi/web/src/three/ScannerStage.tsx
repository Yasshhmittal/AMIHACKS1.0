import { useEffect, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { LAYERS, T, easeInOut, lerp, seg } from '../lib/story'

export interface StoryState { progress: number; crazy: boolean; has3D: boolean }

interface Props {
  story: MutableRefObject<StoryState>
  labelRefs: MutableRefObject<(HTMLDivElement | null)[]>
  onFail?: () => void
}

const W = 3.1          // sheet width
const D = 2.35         // sheet depth
const SEGS = 56        // fold resolution
const N = LAYERS.length
const LENS_X = -0.2    // where the lens rests on the stack (root space)
const LENS_Z = 0.18

// Per-sheet placement so edges peek out at different places (like a real pile).
const SHEET = [
  { sx: 1.06, sz: 1.04, rot: -0.05, ox: 0.02, oz: -0.02 },
  { sx: 1.0, sz: 1.02, rot: 0.04, ox: -0.06, oz: 0.05 },
  { sx: 1.04, sz: 0.98, rot: -0.02, ox: 0.08, oz: 0.02 },
  { sx: 0.98, sz: 1.03, rot: 0.06, ox: -0.03, oz: -0.05 },
  { sx: 1.05, sz: 1.0, rot: -0.07, ox: 0.05, oz: 0.07 },
  { sx: 1.08, sz: 1.06, rot: 0.02, ox: -0.02, oz: 0.0 },
]

/**
 * One shared fold field, evaluated in the stack's own space. Every sheet samples
 * the SAME field, so sheets are parallel surfaces offset by their gap: they nest
 * like fabric and can never intersect — no matter how they're shifted or turned.
 */
function field(x: number, z: number, t: number, amp: number) {
  const nx = x / (W / 2), nz = z / (D / 2)
  let y = amp * (0.55 * Math.sin(x * 1.75 + t * 0.55) + 0.32 * Math.sin(z * 2.3 - x * 0.65 + t * 0.42) + 0.13 * Math.sin((x + z) * 3.4 + t * 0.9))
  y -= 0.34 * Math.max(0, nz) ** 2          // front edge drapes toward the viewer
  y -= 0.16 * Math.max(0, -nx) ** 2         // left edge droops
  y += 0.1 * Math.max(0, nx) ** 2 * (0.6 + 0.4 * Math.sin(t * 0.4 + 1)) // right edge lifts
  const dx = x - LENS_X, dz = z - LENS_Z
  y -= 0.17 * Math.exp(-(dx * dx + dz * dz) / 0.32)                        // cradle for the lens
  y += 0.15 * Math.exp(-(dx * dx) / 0.9 - ((z - LENS_Z + 0.62) ** 2) / 0.07) // fold rising behind it
  return y
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, s: number) => void, size = 256) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** A camera-style lens, axis along +Y with the glass at the +Y end. */
function buildLens() {
  const lens = new THREE.Group()
  const body = new THREE.MeshPhysicalMaterial({ color: '#eff1f4', metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 })
  const groove = new THREE.MeshPhysicalMaterial({ color: '#cfd4da', metalness: 0.6, roughness: 0.35 })
  const matte = new THREE.MeshPhysicalMaterial({ color: '#e3e6ea', metalness: 0.2, roughness: 0.6 })
  const gold = new THREE.MeshPhysicalMaterial({ color: '#d99a5c', metalness: 0.95, roughness: 0.22, clearcoat: 1 })
  const black = new THREE.MeshStandardMaterial({ color: '#0c0d11', metalness: 0.3, roughness: 0.45 })

  const add = (m: THREE.Mesh, y: number) => { m.position.y = y; lens.add(m); return m }
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.45, 0.34, 72), body), -0.62)          // rear
  add(new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.035, 12, 72), body), -0.79).rotation.x = Math.PI / 2 // rounded rear lip
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.86, 72), body), -0.03)            // main barrel
  for (let r = 0; r < 5; r++) add(new THREE.Mesh(new THREE.TorusGeometry(0.502, 0.012, 8, 72), groove), -0.36 + r * 0.055).rotation.x = Math.PI / 2
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.515, 0.515, 0.16, 72), matte), 0.24)         // focus ring
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.5, 0.09, 72), body), 0.41)             // front face
  add(new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.032, 14, 72), gold), 0.45).rotation.x = Math.PI / 2 // gold ring
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.06, 72), black), 0.47)           // black rim

  // shallow glass dome with iridescent coating (the colourful optics)
  const R = 0.43, theta = 0.9
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#0b1236', metalness: 0.15, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02,
    iridescence: 1, iridescenceIOR: 2.0, iridescenceThicknessRange: [120, 900], envMapIntensity: 2.2,
    emissive: new THREE.Color('#4f6bff'), emissiveIntensity: 0.05,
  })
  const glass = new THREE.Mesh(new THREE.SphereGeometry(R, 72, 32, 0, Math.PI * 2, 0, theta), glassMat)
  glass.position.y = 0.5 - R * Math.cos(theta)
  lens.add(glass)
  // lens-element rings sitting on the dome
  const ringMat = new THREE.MeshStandardMaterial({ color: '#2a2e3a', metalness: 0.6, roughness: 0.3, emissive: new THREE.Color('#cdfb47'), emissiveIntensity: 0 })
  for (const r of [0.24, 0.14]) {
    const h = glass.position.y + Math.sqrt(R * R - r * r) + 0.004
    add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.007, 8, 64), ringMat), h).rotation.x = Math.PI / 2
  }
  return { lens, glassMat, ringMat }
}

/**
 * Hero sculpture: a camera lens resting on six draped "security layers".
 * Scroll drives it: the pile separates, the lens rises and becomes a projector,
 * a scan frame sweeps down every layer and each one lights up as it's proven.
 */
export default function ScannerStage({ story, labelRefs, onFail }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const failRef = useRef(onFail)
  failRef.current = onFail

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    } catch {
      failRef.current?.()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.02
    renderer.domElement.style.display = 'block'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
    camera.position.set(0, 0.55, 10)
    camera.lookAt(0, 0, 0)

    const pmrem = new THREE.PMREMGenerator(renderer)
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = envRT.texture
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe9e2d4, 0.6))
    const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(-4, 7, 6); scene.add(key)
    const rim = new THREE.DirectionalLight(0xfff0dc, 0.7); rim.position.set(6, 3, -5); scene.add(rim)

    const root = new THREE.Group()
    scene.add(root)

    // ------------------------------------------------------------ sheets
    const sheets = LAYERS.map((L, i) => {
      const geo = new THREE.PlaneGeometry(W, D, SEGS, SEGS)
      geo.rotateX(-Math.PI / 2)
      const base = Float32Array.from(geo.attributes.position.array as Float32Array)
      const mat = new THREE.MeshPhysicalMaterial({
        color: L.color, metalness: L.metal, roughness: L.rough,
        clearcoat: 0.35, clearcoatRoughness: 0.3, side: THREE.DoubleSide,
        emissive: new THREE.Color('#a6dc1e'), emissiveIntensity: 0,
      })
      const mesh = new THREE.Mesh(geo, mat)
      const P = SHEET[i]
      mesh.scale.set(P.sx, 1, P.sz)
      mesh.rotation.y = P.rot
      root.add(mesh)
      return { mesh, geo, base, mat, P, y: 0 }
    })

    // ------------------------------------------------------------ lens
    const { lens, glassMat, ringMat } = buildLens()
    root.add(lens)

    // ------------------------------------------------------------ projector beam
    const beamTex = canvasTexture((ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, 0, s)
      g.addColorStop(0, 'rgba(205,251,71,0.9)'); g.addColorStop(0.6, 'rgba(183,230,47,0.28)'); g.addColorStop(1, 'rgba(183,230,47,0.0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s)
    })
    const coneGeo = new THREE.ConeGeometry(1, 1, 72, 1, true)
    coneGeo.translate(0, -0.5, 0)
    const coneMat = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    const cone = new THREE.Mesh(coneGeo, coneMat)
    root.add(cone)

    // ------------------------------------------------------------ scan frame
    const frameTex = canvasTexture((ctx, s) => {
      ctx.fillStyle = 'rgba(205,251,71,0.14)'; ctx.fillRect(0, 0, s, s)
      ctx.strokeStyle = 'rgba(122,168,10,0.3)'; ctx.lineWidth = 1
      for (let k = 1; k < 8; k++) { const q = (k / 8) * s; ctx.beginPath(); ctx.moveTo(q, 0); ctx.lineTo(q, s); ctx.moveTo(0, q); ctx.lineTo(s, q); ctx.stroke() }
      ctx.strokeStyle = 'rgba(122,168,10,1)'; ctx.lineWidth = 7; ctx.strokeRect(4, 4, s - 8, s - 8)
      ctx.fillStyle = 'rgba(14,17,22,0.9)'
      for (const [x, y] of [[4, 4], [s - 26, 4], [4, s - 26], [s - 26, s - 26]]) ctx.fillRect(x, y, 22, 22)
    }, 512)
    const scanMat = new THREE.MeshBasicMaterial({ map: frameTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    const scanPlane = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.2, D * 1.22), scanMat)
    scanPlane.rotation.x = -Math.PI / 2
    root.add(scanPlane)

    // ------------------------------------------------------------ contact shadow
    const shadowTex = canvasTexture((ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
      g.addColorStop(0, 'rgba(40,34,24,0.38)'); g.addColorStop(1, 'rgba(40,34,24,0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s)
    })
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.7, D * 1.5), shadowMat)
    shadow.rotation.x = -Math.PI / 2
    root.add(shadow)

    // ------------------------------------------------------------ data particles
    const PCOUNT = 240
    const pPos = new Float32Array(PCOUNT * 3)
    const pSeed = new Float32Array(PCOUNT)
    for (let k = 0; k < PCOUNT; k++) {
      pPos[k * 3] = (Math.random() - 0.5) * W * 1.3
      pPos[k * 3 + 1] = (Math.random() - 0.5) * 4
      pPos[k * 3 + 2] = (Math.random() - 0.5) * D * 1.3
      pSeed[k] = Math.random()
    }
    const pGeo = new THREE.BufferGeometry()
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
    const pMat = new THREE.PointsMaterial({ color: '#7fae0c', size: 0.05, transparent: true, opacity: 0, depthWrite: false })
    root.add(new THREE.Points(pGeo, pMat))

    // ------------------------------------------------------------ sizing
    let halfW = 4, wide = true, cw = 1, ch = 1
    const resize = () => {
      cw = mount.clientWidth || 1; ch = mount.clientHeight || 1
      renderer.setSize(cw, ch, false)
      renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'
      camera.aspect = cw / ch; camera.updateProjectionMatrix()
      halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z * camera.aspect
      wide = camera.aspect > 1.15
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 }
    const onMove = (e: PointerEvent) => { mouse.tx = e.clientX / window.innerWidth - 0.5; mouse.ty = e.clientY / window.innerHeight - 0.5 }
    window.addEventListener('pointermove', onMove)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    story.current.has3D = true
    const v = new THREE.Vector3()
    let last = performance.now()
    let tt = 0          // animation clock (runs faster in crazy mode)
    let crazyAmt = 0    // eased 0..1 so crazy mode blends in/out smoothly
    let raf = 0

    const frame = () => {
      raf = requestAnimationFrame(frame)
      const rect = mount.getBoundingClientRect()
      if (rect.bottom < 0 || rect.top > window.innerHeight) { last = performance.now(); return }

      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      crazyAmt += ((story.current.crazy ? 1 : 0) - crazyAmt) * (1 - Math.exp(-dt * 3))
      tt += dt * (reduce ? 0.15 : 1 + 1.6 * crazyAmt)
      const ease = 1 - Math.exp(-dt * 4)
      mouse.x += (mouse.tx - mouse.x) * ease
      mouse.y += (mouse.ty - mouse.y) * ease

      const sp = story.current.progress
      const open = easeInOut(seg(sp, T.open))
      const close = easeInOut(seg(sp, T.close))
      const scanP = seg(sp, T.scan)
      const explode = open * (1 - close)
      const beamOn = seg(sp, [0.36, 0.44]) * (1 - seg(sp, [0.82, 0.88]))
      const amp = reduce ? 0.08 : 0.2 + 0.12 * crazyAmt

      // --- placement: right side -> centre (sweep) -> right (final)
      const baseX = wide ? halfW * 0.4 : 0
      const baseY = wide ? -0.2 : -1.2
      root.position.x = lerp(lerp(baseX, wide ? -halfW * 0.03 : 0, open), baseX * 0.95, close)
      root.position.y = lerp(lerp(baseY, -0.35, open), baseY, close)
      root.scale.setScalar(lerp(lerp(wide ? 1.12 : 0.78, wide ? 0.82 : 0.6, open), wide ? 1.02 : 0.72, close))
      root.rotation.x = 0.2 + 0.1 * open + mouse.y * 0.1
      root.rotation.y = -0.55 + 0.8 * explode + mouse.x * 0.28 + (reduce ? 0 : Math.sin(tt * 0.22) * 0.05)

      // --- sheets: shared fold field, gap, scan glow
      const breathe = 0.05 * crazyAmt * (0.5 + 0.5 * Math.sin(tt * 1.6))
      const gap = lerp(0.085, 0.58, explode) + breathe
      const beamY = lerp((N - 1) / 2 * gap, -(N - 1) / 2 * gap, scanP)
      for (let i = 0; i < N; i++) {
        const S = sheets[i], P = S.P
        const y = ((N - 1) / 2 - i) * gap
        S.y = y
        S.mesh.position.set(P.ox, y, P.oz)
        const c = Math.cos(P.rot), s = Math.sin(P.rot)
        const arr = S.geo.attributes.position.array as Float32Array
        const a = amp * (1 + (i - 2.5) * 0.012)
        for (let k = 0; k < arr.length; k += 3) {
          const lx = S.base[k] * P.sx, lz = S.base[k + 2] * P.sz
          const X = lx * c + lz * s + P.ox
          const Z = -lx * s + lz * c + P.oz
          arr[k + 1] = field(X, Z, tt, a)
        }
        S.geo.attributes.position.needsUpdate = true
        S.geo.computeVertexNormals()
        const d = beamY - y
        const passed = scanP > 0 && beamY < y - 0.05
        S.mat.emissiveIntensity = beamOn * (Math.exp(-d * d * 22) * 0.9 + (passed ? 0.1 : 0))
      }

      // --- lens: nestled in the cradle -> rises and faces down as a projector
      const topY = sheets[0].y
      const restY = topY + field(LENS_X, LENS_Z, tt, amp) + 0.47
      lens.position.set(lerp(LENS_X, 0, open), lerp(restY, topY + 1.3, open), lerp(LENS_Z, 0, open))
      lens.rotation.set(lerp(Math.PI / 2 - 0.18, Math.PI, open), 0, lerp(0.62, 0, open))
      glassMat.emissiveIntensity = 0.05 + 1.2 * beamOn
      ringMat.emissiveIntensity = 1.4 * beamOn

      // --- beam, scan frame, particles, shadow
      const glassY = lens.position.y - 0.62
      const bottomY = sheets[N - 1].y - 0.25
      cone.position.set(lens.position.x, glassY, lens.position.z)
      cone.scale.set(lerp(0.3, 1.9, beamOn), Math.max(0.01, glassY - bottomY), lerp(0.3, 1.5, beamOn))
      coneMat.opacity = 0.3 * beamOn
      scanPlane.position.set(0, beamY + 0.25, 0)
      scanMat.opacity = beamOn * (scanP > 0 && scanP < 1 ? 1 : 0.35)
      pMat.opacity = 0.7 * beamOn
      const pa = pGeo.attributes.position.array as Float32Array
      for (let k = 0; k < PCOUNT; k++) {
        let py = pa[k * 3 + 1] + (0.25 + pSeed[k] * 0.6) * dt
        if (py > 2.2) py = -2.2
        pa[k * 3 + 1] = py
      }
      pGeo.attributes.position.needsUpdate = true
      shadow.position.y = sheets[N - 1].y - 0.55
      shadowMat.opacity = 1 - 0.55 * explode

      renderer.render(scene, camera)

      // --- pin labels to each sheet's right edge (on the actual folded surface)
      const labels = labelRefs.current
      for (let i = 0; i < N; i++) {
        const el = labels[i]
        if (!el) continue
        const S = sheets[i], P = S.P
        const lx = (W / 2) * P.sx
        const X = lx * Math.cos(P.rot) + P.ox, Z = -lx * Math.sin(P.rot) + P.oz
        v.set(W / 2, field(X, Z, tt, amp), 0)
        S.mesh.localToWorld(v)
        v.project(camera)
        const sx = Math.min((v.x * 0.5 + 0.5) * cw + 12, cw - 240)
        const sy = (-v.y * 0.5 + 0.5) * ch
        el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translateY(-50%)`
      }
    }
    frame()

    return () => {
      cancelAnimationFrame(raf)
      story.current.has3D = false
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      scene.traverse(obj => {
        const m = obj as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
        mats.forEach(mm => { (mm as THREE.MeshBasicMaterial).map?.dispose(); mm.dispose() })
      })
      envRT.dispose(); pmrem.dispose(); renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [story, labelRefs])

  return <div ref={mountRef} className="absolute inset-0" aria-hidden />
}
