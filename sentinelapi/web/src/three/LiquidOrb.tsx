import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * A real WebGL liquid-glass sculpture: a high-detail icosahedron whose vertices
 * wobble with summed sine waves (the "liquid"), rendered with an iridescent,
 * clear-coated physical material lit by three coloured lights. Reflections come
 * from a PMREM-processed canvas-gradient environment, so no external HDR file
 * (and no network) is needed. Everything is disposed on unmount.
 */
export default function LiquidOrb() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const width = mount.clientWidth || 520
    const height = mount.clientHeight || 520

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100)
    camera.position.set(0, 0, 5.2)

    // --- environment (canvas gradient -> PMREM) for glassy reflections ---
    const envCanvas = document.createElement('canvas')
    envCanvas.width = 256; envCanvas.height = 256
    const ctx = envCanvas.getContext('2d')!
    const grad = ctx.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.45, '#f4f1ea')
    grad.addColorStop(0.7, '#e9f7c8')
    grad.addColorStop(1, '#dcd6c6')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256)
    // a couple of soft light blobs
    for (const [x, y, r, c] of [[70, 60, 70, 'rgba(205,251,71,.7)'], [190, 190, 90, 'rgba(110,86,247,.4)']] as const) {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r)
      rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    const envTex = new THREE.CanvasTexture(envCanvas)
    envTex.mapping = THREE.EquirectangularReflectionMapping
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envRT = pmrem.fromEquirectangular(envTex)
    scene.environment = envRT.texture

    // --- geometry ---
    const geo = new THREE.IcosahedronGeometry(1.25, 12)
    const basePos = geo.attributes.position.clone()
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#f7f7fb'),
      metalness: 0.2,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
      iridescence: 1,
      iridescenceIOR: 1.35,
      envMapIntensity: 1.25,
      sheen: 0.6,
      sheenColor: new THREE.Color('#cdfb47'),
    })
    const mesh = new THREE.Mesh(geo, material)
    scene.add(mesh)

    // --- lights ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const l1 = new THREE.PointLight(0xcdfb47, 2.4, 30); l1.position.set(4, 3, 4)
    const l2 = new THREE.PointLight(0x6e56f7, 2.0, 30); l2.position.set(-4, -2, 3)
    const l3 = new THREE.PointLight(0x48b0f7, 1.6, 30); l3.position.set(0, 4, -3)
    scene.add(l1, l2, l3)

    // --- interaction ---
    const target = { x: 0, y: 0 }
    const onMove = (e: MouseEvent) => {
      const r = mount.getBoundingClientRect()
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 0.6
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 0.6
    }
    window.addEventListener('mousemove', onMove)

    const pos = geo.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    const n = new THREE.Vector3()
    let raf = 0
    const start = performance.now()

    const animate = () => {
      const t = (performance.now() - start) / 1000
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(basePos, i)
        n.copy(v).normalize()
        const d = 0.16 * Math.sin(v.x * 2.2 + t * 1.3)
          + 0.12 * Math.sin(v.y * 2.6 + t * 1.1)
          + 0.10 * Math.sin(v.z * 3.0 + t * 1.7)
        v.addScaledVector(n, d)
        pos.setXYZ(i, v.x, v.y, v.z)
      }
      pos.needsUpdate = true
      geo.computeVertexNormals()

      mesh.rotation.y += 0.003
      mesh.rotation.x += 0.0016
      camera.position.x += (target.x - camera.position.x) * 0.05
      camera.position.y += (-target.y - camera.position.y) * 0.05
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    animate()

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight
      if (!w || !h) return
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', onResize)
      geo.dispose(); material.dispose(); envTex.dispose(); envRT.dispose(); pmrem.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className="h-full w-full" aria-hidden />
}
