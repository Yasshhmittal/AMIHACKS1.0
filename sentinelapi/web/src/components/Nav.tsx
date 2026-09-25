import { Link } from 'react-router-dom'
import { Shield } from 'lucide-react'

export function Logo({ onDark = false }: { onDark?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-xl bg-ink text-lime"><Shield size={17} strokeWidth={2.4} /></span>
      <span className={`font-display text-lg font-bold tracking-tight ${onDark ? 'text-cream' : 'text-ink'}`}>SentinelAPI</span>
    </Link>
  )
}

export function LandingNav() {
  const links = [['Product', '#product'], ['How it works', '#how'], ['Detectors', '#detectors'], ['Proof', '#proof']]
  return (
    <header className="sticky top-0 z-50 px-4 pt-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-full border border-white/70 bg-paper/70 px-4 py-2.5 backdrop-blur-xl" style={{ boxShadow: '0 20px 40px -30px rgba(20,20,25,.4)' }}>
        <Logo />
        <nav className="hidden items-center gap-1 rounded-full bg-cream2/70 p-1 md:flex">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="rounded-full px-3.5 py-1.5 text-sm font-medium text-ink2 transition-colors hover:bg-paper hover:text-ink">{label}</a>
          ))}
        </nav>
        <Link to="/scan/new" className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-ink2">Start a scan</Link>
      </div>
    </header>
  )
}
