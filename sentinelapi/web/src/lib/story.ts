/**
 * Shared scroll timeline for the hero story. Both the 3D scene and the HTML
 * overlays read the same smoothed progress (0..1) and these same windows, so
 * text, labels and geometry always move in lock-step.
 *
 *   0.00 ─ idle hero (stack + lens, gentle ripple)
 *   0.06 → 0.40  OPEN   : hero text leaves, stack explodes into layers, lens rises
 *   0.40 → 0.82  SCAN   : lens becomes a projector, beam sweeps down every layer
 *   0.84 → 0.98  CLOSE  : layers settle back, "every layer proven" + CTA
 */
export const T = {
  heroOut: [0.05, 0.2] as const,
  open: [0.08, 0.4] as const,
  scanTitle: [0.3, 0.42] as const,
  scan: [0.42, 0.82] as const,
  close: [0.84, 0.98] as const,
  final: [0.88, 0.97] as const,
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const seg = (p: number, [a, b]: readonly [number, number]) => clamp01((p - a) / (b - a))
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const LAYERS = [
  { key: 'bola', name: 'BOLA', full: 'Broken Object Level Authorization', owasp: 'API1', color: '#e4e7eb', metal: 0.85, rough: 0.3 },
  { key: 'auth', name: 'Broken Auth', full: 'Broken Authentication', owasp: 'API2', color: '#3a3f47', metal: 0.55, rough: 0.42 },
  { key: 'exposure', name: 'Data Exposure', full: 'Excessive Data Exposure', owasp: 'API3', color: '#d9f02e', metal: 0.08, rough: 0.38 },
  { key: 'rate', name: 'Rate Limiting', full: 'Unrestricted Resource Consumption', owasp: 'API4', color: '#a3aab4', metal: 0.8, rough: 0.32 },
  { key: 'bfla', name: 'BFLA', full: 'Broken Function Level Authorization', owasp: 'API5', color: '#ff7a1a', metal: 0.08, rough: 0.4 },
  { key: 'misconfig', name: 'Misconfiguration', full: 'Security Misconfiguration', owasp: 'API8', color: '#f5f4f0', metal: 0.04, rough: 0.55 },
] as const
