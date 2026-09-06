import * as React from 'react'

import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Workflow stepper.
 *
 * Renders as an ordered list so the sequence is conveyed to a screen reader
 * without relying on the visual connectors, and the current step is marked with
 * `aria-current`. On small screens it collapses to "Step 2 of 5 — Job
 * description" rather than shrinking five labels into illegibility.
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
  const current = steps[Math.min(currentIndex, steps.length - 1)]

  return (
    <div className={className}>
      {/* Mobile: a single readable line. */}
      <div className="sm:hidden">
        <p className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
          Step {Math.min(currentIndex + 1, steps.length)} of {steps.length}
        </p>
        <p className="mt-1 text-base font-semibold text-fg">{current?.label}</p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-sunken">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${((currentIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Desktop: full sequence. */}
      <ol className="hidden items-center sm:flex">
        {steps.map((step, index) => {
          const complete = index < currentIndex
          const active = index === currentIndex

          return (
            <li key={step.id} className={cn('flex items-center', index > 0 && 'flex-1')}>
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'mx-2 h-px flex-1 transition-colors',
                    complete || active ? 'bg-accent' : 'bg-line-strong',
                  )}
                />
              ) : null}

              <span
                className="flex items-center gap-2.5"
                aria-current={active ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                    complete && 'border-accent bg-accent text-on-accent',
                    active && 'border-accent bg-accent-subtle text-fg-accent',
                    !complete && !active && 'border-line-strong text-fg-subtle',
                  )}
                >
                  {complete ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    <span aria-hidden="true">{index + 1}</span>
                  )}
                </span>
                <span
                  className={cn(
                    'whitespace-nowrap text-sm font-medium transition-colors',
                    active ? 'text-fg' : 'text-fg-subtle',
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
