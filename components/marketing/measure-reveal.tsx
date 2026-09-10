'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Plays a score readout's sweep when it scrolls into view, once.
 *
 * The whole mechanism is inverted from the usual scroll-reveal, and that is
 * the point. A normal reveal renders the end state as empty and fills it in
 * from JavaScript, so a failed hydration, a blocked bundle or a crawler sees
 * nothing. Here the server renders the **true reading**, fully drawn; this
 * component only ever takes it *away* — and only when it can do so unseen.
 *
 * For a product whose entire argument is that its score is honest and
 * reproducible, an animation that can strand a `0` on the marketing page is
 * the one bug it cannot afford. So every failure path lands on the reading:
 *
 *   no JavaScript          the arc and bars are already drawn
 *   hydration fails        likewise — nothing has run to empty them
 *   reduced motion         left alone deliberately, before any measurement
 *   already on screen      left alone, because arming it would be a visible pop
 *
 * Three phases, because two are not enough. `idle` is the server's truth;
 * `armed` snaps to empty with no transition, which is safe only off screen;
 * `running` transitions back to the same values `idle` had. The CSS lives in
 * `globals.css` under "Measurement reveal" and keys off `data-measure`, so the
 * score components need no animation props and the same components stay
 * instant everywhere else in the product.
 */

type Phase = 'idle' | 'armed' | 'running'

export function MeasureReveal({
  children,
  className,
  /** How much of the element must be showing before the sweep starts. */
  threshold = 0.4,
}: {
  children: React.ReactNode
  className?: string
  threshold?: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [phase, setPhase] = React.useState<Phase>('idle')

  React.useEffect(() => {
    const element = ref.current
    if (!element) return

    // Honoured before anything is touched. The global reduced-motion block
    // would collapse the durations anyway, but leaving the element at `idle`
    // means it is never emptied in the first place.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof IntersectionObserver === 'undefined') return

    const box = element.getBoundingClientRect()
    const onScreen = box.top < window.innerHeight && box.bottom > 0
    // Arming something the user is already looking at would blank a drawn
    // score and redraw it — a pop, and a worse first impression than no
    // animation at all. This card sits well below the fold, so the ordinary
    // case is off screen.
    if (onScreen) return

    setPhase('armed')

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          // Two frames, not one: `armed` has to be painted before `running`
          // changes the same properties, or the browser coalesces both into
          // one style recalculation and there is nothing to transition from.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => setPhase('running'))
          })
          // Once. Re-running on every scroll past is the thing that makes a
          // page feel like a demo reel.
          observer.disconnect()
        }
      },
      { threshold },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [threshold])

  return (
    <div ref={ref} data-measure={phase} className={cn('min-w-0', className)}>
      {children}
    </div>
  )
}
