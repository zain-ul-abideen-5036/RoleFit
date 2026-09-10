import * as React from 'react'

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Metric readout.
 *
 * The dashboard opened with four counts in four equal cells — resumes,
 * analyses, optimizations, average readiness. Three of those are numbers that
 * go up and never inform a decision: knowing you have uploaded six resumes
 * does not tell you anything you would act on. They led the page because they
 * are easy to render.
 *
 * So this component makes the useful shape cheap and the useless one awkward:
 * a figure, its unit, and — where one exists — the *change* and what it should
 * make you do. A metric with no delta and no next action is a tally, and a
 * tally belongs in Settings under "what is stored on this account", which is
 * where they now live.
 */

/* ==========================================================================
   Delta
   ========================================================================== */

const DELTA_PRESENTATION = {
  up: { Icon: ArrowUpRight, classes: 'text-success-fg' },
  down: { Icon: ArrowDownRight, classes: 'text-danger-fg' },
  flat: { Icon: Minus, classes: 'text-fg-subtle' },
} as const

/**
 * A signed change against a previous value.
 *
 * `higherIsBetter` exists because it is not universal here: readiness going up
 * is good, outstanding gaps going up is not, and hard-coding green-for-up
 * would colour a worsening number as an improvement.
 */
export function StatDelta({
  value,
  higherIsBetter = true,
  suffix,
  className,
}: {
  value: number
  higherIsBetter?: boolean
  /** e.g. "vs last analysis" — the comparison, without which a delta is noise. */
  suffix?: string
  className?: string
}) {
  const rounded = Math.round(value)
  const direction = rounded === 0 ? 'flat' : rounded > 0 ? 'up' : 'down'
  const good = direction === 'flat' ? 'flat' : rounded > 0 === higherIsBetter ? 'up' : 'down'
  const { Icon } = DELTA_PRESENTATION[direction]
  const { classes } = DELTA_PRESENTATION[good]

  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', className)}>
      <Icon className={cn('size-3.5 shrink-0', classes)} aria-hidden="true" />
      <span className={cn('text-2xs font-medium tabular-nums', classes)}>
        {rounded > 0 ? '+' : ''}
        {rounded}
      </span>
      {suffix ? <span className="text-2xs text-fg-subtle">{suffix}</span> : null}
      {/* The arrow is the only thing that says which way it went, and it is
          decorative, so the direction is spelled out for a screen reader. */}
      <span className="sr-only">
        {direction === 'flat' ? 'unchanged' : direction === 'up' ? 'increase' : 'decrease'}
      </span>
    </span>
  )
}

/* ==========================================================================
   Stat
   ========================================================================== */

const VALUE_TONES = {
  default: 'text-fg',
  success: 'text-success-fg',
  warning: 'text-warning-fg',
  danger: 'text-danger-fg',
  muted: 'text-fg-disabled',
} as const

export interface StatProps {
  label: string
  /** The figure. `null` renders an em dash rather than a zero. */
  value: React.ReactNode
  /** A qualifier under the figure: the band, the count it came from. */
  detail?: React.ReactNode
  tone?: keyof typeof VALUE_TONES
  /** An `InfoTip` or similar beside the label. */
  annotation?: React.ReactNode
  className?: string
}

/**
 * One figure with its label above and its meaning below.
 *
 * Label above the value, not below it: reading order should be "what this is"
 * then "what it says". A big number with its caption underneath makes the
 * reader hold an unexplained figure in their head for the length of a
 * saccade, which is how a dashboard becomes something you have to learn.
 */
export function Stat({ label, value, detail, tone = 'default', annotation, className }: StatProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-1.5">
        <p className="eyebrow truncate text-fg-subtle">{label}</p>
        {annotation}
      </div>
      <p className={cn('mt-1.5 text-display-sm font-semibold tabular-nums', VALUE_TONES[tone])}>
        {value}
      </p>
      {detail ? <div className="mt-1 text-2xs text-fg-subtle">{detail}</div> : null}
    </div>
  )
}

/**
 * A row of stats, divided by hairlines rather than boxed individually.
 *
 * Four bordered tiles in a row is four containers stating one measurement
 * each; one bordered strip divided by rules states that they belong together
 * and are comparable, which they are. It also removes three borders and three
 * shadows from the top of the page.
 *
 * Rules become horizontal when the row wraps to a column on a phone, because a
 * vertical divider between stacked items is a line to nowhere.
 */
export function StatRow({
  children,
  className,
  columns = 3,
}: {
  children: React.ReactNode
  className?: string
  columns?: 2 | 3 | 4
}) {
  const grid = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
  } as const

  return (
    <div
      className={cn(
        'grid overflow-hidden rounded-xl border border-line bg-surface',
        'divide-y divide-line sm:divide-x sm:divide-y-0',
        grid[columns],
        // 4-up keeps a horizontal rule between its two mobile rows.
        columns === 4 &&
          '[&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-line sm:[&>*]:border-b-0',
        className,
      )}
    >
      {React.Children.map(children, (child) => (
        <div className="min-w-0 px-4 py-3.5 sm:px-5 sm:py-4">{child}</div>
      ))}
    </div>
  )
}
