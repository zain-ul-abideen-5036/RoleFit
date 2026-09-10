'use client'

import * as React from 'react'

import { useReducedMotion } from 'framer-motion'

import { cn } from '@/lib/utils'

/**
 * The rotating role in the hero headline.
 *
 * Taken from the rotating-word hero pattern and pointed at something real. The
 * reference cycled "amazing / new / wonderful / beautiful / smart", which is
 * five adjectives that describe nothing and could sit on any product's home
 * page. Cycling job titles instead states the actual proposition: the same
 * resume, aimed at a specific role, which is the entire product.
 *
 * Three things the pattern usually gets wrong, handled here:
 *
 *  1. **The heading mutates under a screen reader.** An `h1` whose text
 *     changes every few seconds is announced repeatedly and reads as a
 *     different heading each time. So the accessible heading is one stable
 *     sentence, rendered once and visually hidden, and the animated text is
 *     `aria-hidden`. Assistive technology gets a sentence; the eye gets the
 *     rotation.
 *
 *  2. **It shifts the layout.** Absolutely positioned variants inside a box
 *     sized by the longest title, so nothing below moves as the words change.
 *     The sizer is `invisible` rather than hidden, because it still has to
 *     take up space.
 *
 *  3. **It cannot be stopped.** WCAG 2.2.2 covers auto-updating content, and a
 *     word that changes on its own is auto-updating. It freezes on
 *     `prefers-reduced-motion`, and on hover or keyboard focus anywhere in the
 *     headline, so a slow reader can hold it still.
 */

const ROLES = [
  'Backend Engineer',
  'Product Manager',
  'Data Analyst',
  'Product Designer',
  'Marketing Lead',
] as const

/** Long enough to read the word and register that it changed. */
const INTERVAL_MS = 2600

export function RoleRotator({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion()
  const [index, setIndex] = React.useState(0)
  const [paused, setPaused] = React.useState(false)

  const frozen = reduceMotion === true || paused

  React.useEffect(() => {
    if (frozen) return
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % ROLES.length)
    }, INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [frozen])

  // The widest title decides the box. Measured from the same font at the same
  // size by rendering it, rather than guessed at with a magic width.
  const widest = ROLES.reduce((a, b) => (b.length > a.length ? b : a))

  return (
    <span
      className={cn('relative inline-grid align-bottom', className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span aria-hidden="true" className="invisible whitespace-nowrap">
        {widest}
      </span>

      {ROLES.map((role, i) => (
        <span
          key={role}
          aria-hidden="true"
          className={cn(
            'absolute inset-0 whitespace-nowrap text-fg-accent',
            // Opacity and transform only, so the swap costs nothing to
            // composite. No blur, no filter, no layout property.
            'transition-[opacity,transform] duration-[--duration-settle] ease-[--ease-standard]',
            i === index
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none -translate-y-1.5 opacity-0',
          )}
        >
          {role}
        </span>
      ))}
    </span>
  )
}

export { ROLES }
