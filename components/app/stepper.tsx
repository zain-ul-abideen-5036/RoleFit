import * as React from 'react'

import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Workflow stepper.
 *
 * Renders as an ordered list so the sequence reaches a screen reader without
 * relying on the visual connectors, and the current step carries
 * `aria-current="step"`. On small screens it collapses to "Step 2 of 4 — Job
 * description" rather than shrinking four labels into illegibility.
 *
 * The markers are small and the connectors are hairlines. A row of 28px filled
 * circles joined by 2px rules is the single most recognisable piece of
 * onboarding-template furniture there is, and it takes up a band of the screen
 * proportional to nothing — this is a four-step form, not a checkout. What the
 * user needs from it is where they are and how much is left, which a 20px
 * marker states as well as a 28px one.
 */

export interface Step {
  id: string
  label: string
}

export function Stepper({
  steps,
  currentIndex,
  className,
}: {
  steps: readonly Step[]
  currentIndex: number
  className?: string
}) {
  const clamped = Math.min(currentIndex, steps.length - 1)
  const current = steps[clamped]
  const position = Math.min(currentIndex + 1, steps.length)

  return (
    <div className={className}>
      {/* Mobile: a single readable line and a progress track. */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="eyebrow text-fg-subtle">
            Step {position} of {steps.length}
          </p>
          <p className="text-meta font-medium text-fg">{current?.label}</p>
        </div>
        {/*
          scaleX rather than width. Animating width is a layout property, so
          every frame re-runs layout for the subtree; a transform is handed to
          the compositor and costs nothing. Same movement on screen, and it
          stays smooth on the low-end phone this branch exists for.
        */}
        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-sunken">
          <div
            className="h-full origin-left rounded-full bg-accent transition-transform duration-[--duration-settle] ease-[--ease-standard]"
            style={{ transform: `scaleX(${position / steps.length})` }}
          />
        </div>
      </div>

      {/* Desktop: the full sequence. */}
      <ol className="hidden items-center gap-3 sm:flex">
        {steps.map((step, index) => {
          const complete = index < currentIndex
          const active = index === currentIndex

          return (
            <li key={step.id} className={cn('flex items-center gap-3', index > 0 && 'flex-1')}>
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-px flex-1 transition-colors duration-[--duration-settle]',
                    complete || active ? 'bg-line-bold' : 'bg-line',
                  )}
                />
              ) : null}

              <span className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums',
                    'transition-colors duration-[--duration-fast] ease-[--ease-standard]',
                    complete && 'border-accent bg-accent text-on-accent',
                    active && 'border-accent bg-surface text-fg',
                    !complete && !active && 'border-line-strong bg-surface text-fg-disabled',
                  )}
                >
                  {complete ? (
                    <Check className="size-3" aria-hidden="true" />
                  ) : (
                    <span aria-hidden="true">{index + 1}</span>
                  )}
                </span>
                <span
                  className={cn(
                    'whitespace-nowrap text-meta transition-colors duration-[--duration-fast]',
                    active ? 'font-medium text-fg' : 'text-fg-subtle',
                  )}
                >
                  {step.label}
                </span>
                <span className="sr-only">
                  {complete ? '(completed)' : active ? '(current step)' : '(not started)'}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
