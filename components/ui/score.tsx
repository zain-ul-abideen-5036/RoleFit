import * as React from 'react'

import { ATS_SCORE_DISCLAIMER, scoreBand } from '@/lib/constants'
import type { ScoreDimension } from '@/lib/domain/types'
import { cn } from '@/lib/utils'

/**
 * Score visualisation.
 *
 * Two rules the product depends on:
 *
 *  1. A score is never shown without its band label. The ring communicates
 *     magnitude at a glance; the word tells someone who cannot distinguish the
 *     colours what it means.
 *  2. `ScoreDisclaimer` accompanies the score wherever it is prominent. The
 *     product must not imply this is the number a real ATS produces.
 */

/*
 * The track is neutral, not a tinted version of the arc.
 *
 * It used to be the tone colour at 40% opacity, which meant a low score drew a
 * large pale red doughnut with a small saturated red arc on it — two reds
 * competing, and a ring that read as mostly-filled-with-bad rather than as a
 * value on a scale. A neutral track is the scale; the arc is the value.
 */
const TONE_CLASSES = {
  success: { ring: 'text-success-solid', text: 'text-success-fg' },
  warning: { ring: 'text-warning-solid', text: 'text-warning-fg' },
  danger: { ring: 'text-danger-solid', text: 'text-danger-fg' },
} as const

export interface ScoreRingProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  /** Shown under the number, e.g. "ATS Readiness". */
  caption?: string
  className?: string
}

/*
 * Strokes are thinner than they were, by roughly a third.
 *
 * A 9px stroke on a 132px ring is a doughnut chart; a 5px stroke on the same
 * ring is a gauge. This is a measuring instrument, and the value is the number
 * in the middle — the arc is there to say roughly where that number sits on a
 * scale, which a hairline does as well as a band does.
 */
const SIZES = {
  sm: { box: 60, stroke: 4, value: 'text-body-lg', band: 'text-3xs' },
  md: { box: 88, stroke: 5, value: 'text-display-xs', band: 'text-2xs' },
  lg: { box: 124, stroke: 6, value: 'text-display-md', band: 'text-2xs' },
} as const

export function ScoreRing({ score, size = 'md', caption, className }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const band = scoreBand(clamped)
  const tone = TONE_CLASSES[band.tone]
  const { box, stroke, value, band: bandSize } = SIZES[size]

  const radius = (box - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dash = (clamped / 100) * circumference

  return (
    <div className={cn('inline-flex flex-col items-center gap-2', className)}>
      <div className="relative" style={{ width: box, height: box }}>
        <svg
          width={box}
          height={box}
          viewBox={`0 0 ${box} ${box}`}
          role="img"
          aria-label={`ATS readiness estimate: ${clamped} out of 100, ${band.label}`}
        >
          <circle
            cx={box / 2}
            cy={box / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="text-line"
            stroke="currentColor"
          />
          <circle
            cx={box / 2}
            cy={box / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            stroke="currentColor"
            className={tone.ring}
            strokeDasharray={`${dash} ${circumference - dash}`}
            // Start the arc at 12 o'clock rather than 3.
            transform={`rotate(-90 ${box / 2} ${box / 2})`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className={cn('font-semibold tabular-nums leading-none text-fg', value)}>
            {clamped}
          </span>
          {/* The word, always. It is what the ring means to someone who cannot
              distinguish the arc colour from the track. */}
          <span className={cn('font-medium leading-none', bandSize, tone.text)}>{band.label}</span>
        </div>
      </div>
      {caption ? <span className="eyebrow text-center text-fg-subtle">{caption}</span> : null}
    </div>
  )
}

/* --------------------------------------------------------------- meter row */

export interface ScoreBarProps {
  label: string
  score: number
  /** Rendered as "contributes N%" so weighting is never hidden. */
  weight?: number
  detail?: string
  className?: string
}

export function ScoreBar({ label, score, weight, detail, className }: ScoreBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const band = scoreBand(clamped)
  const tone = TONE_CLASSES[band.tone]

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-meta font-medium text-fg">{label}</span>
        <span className="flex items-baseline gap-2.5">
          {/* The weight, because a dimension scoring badly matters more or less
              depending on it — and hiding that makes the overall number look
              arbitrary. */}
          {weight !== undefined ? (
            <span className="text-2xs tabular-nums text-fg-subtle">
              {Math.round(weight * 100)}% of score
            </span>
          ) : null}
          <span className={cn('text-meta font-semibold tabular-nums', tone.text)}>{clamped}</span>
        </span>
      </div>
      {/*
        A 4px track, not 6px, and it is a track rather than a pill: the bar is
        one row in a stack of seven, and seven fat rounded bars read as a
        chart competing with the ring beside them.
      */}
      <div
        className="h-1 overflow-hidden rounded-full bg-sunken"
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${clamped} out of 100`}
      >
        {/*
          scaleX rather than width. Animating width is a layout property, so
          every frame re-runs layout for the subtree; a transform is handed to
          the compositor. Same movement on screen, none of the cost, across
          seven of these at once.
        */}
        <div
          className={cn(
            'h-full origin-left rounded-full bg-current',
            'transition-transform duration-[--duration-settle] ease-[--ease-standard]',
            tone.ring,
          )}
          style={{ transform: `scaleX(${clamped / 100})` }}
        />
      </div>
      {detail ? <p className="text-2xs leading-relaxed text-fg-subtle">{detail}</p> : null}
    </div>
  )
}

export function ScoreBreakdown({ dimensions }: { dimensions: readonly ScoreDimension[] }) {
  // Heaviest first: the dimension that moves the number most is the one worth
  // reading, and sorting by weight is the only ordering that says so.
  const ordered = [...dimensions].sort((a, b) => b.weight - a.weight)

  return (
    <div className="flex flex-col gap-4">
      {ordered.map((dimension) => (
        <ScoreBar
          key={dimension.key}
          label={dimension.label}
          score={dimension.score}
          weight={dimension.weight}
          detail={dimension.detail}
        />
      ))}
    </div>
  )
}

/**
 * The honesty note that must accompany a prominent score.
 * Kept as a component so the wording cannot drift between pages.
 */
export function ScoreDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs leading-relaxed text-fg-subtle', className)}>
      {ATS_SCORE_DISCLAIMER}
    </p>
  )
}

/** A before/after score change, e.g. on the review screen. */
export function ScoreDelta({
  from,
  to,
  className,
}: {
  from: number
  to: number
  className?: string
}) {
  const delta = Math.round(to) - Math.round(from)
  const tone = delta > 0 ? 'text-success-fg' : delta < 0 ? 'text-danger-fg' : 'text-fg-muted'
  const sign = delta > 0 ? '+' : ''

  return (
    <span className={cn('inline-flex items-baseline gap-2 tabular-nums', className)}>
      <span className="text-fg-subtle line-through">{Math.round(from)}</span>
      <span className="text-fg" aria-hidden="true">
        →
      </span>
      <span className="font-semibold text-fg">{Math.round(to)}</span>
      <span className={cn('text-sm font-medium', tone)}>
        ({sign}
        {delta})
      </span>
    </span>
  )
}
