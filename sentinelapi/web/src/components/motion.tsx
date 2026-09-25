import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

const ease: [number, number, number, number] = [0.22, 0.7, 0.2, 1]

export function Reveal({ children, delay = 0, y = 18, className = '' }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease, delay }}>
      {children}
    </motion.div>
  )
}

export function Stagger({ children, className = '', gap = 0.08 }: { children: ReactNode; className?: string; gap?: number }) {
  return (
    <motion.div className={className}
      initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
      variants={{ show: { transition: { staggerChildren: gap } } }}>
      {children}
    </motion.div>
  )
}

export function Item({ children, className = '', y = 16 }: { children: ReactNode; className?: string; y?: number }) {
  return (
    <motion.div className={className}
      variants={{ hidden: { opacity: 0, y }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease } } }}>
      {children}
    </motion.div>
  )
}

export { motion }
