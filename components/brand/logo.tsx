import * as React from 'react'

import { PRODUCT } from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * The RoleFit mark.
 *
 * Two interlocking forms separated by a stepped seam: a candidate and a role
 * meeting along a joint that only fits one way, with the steps reading as
 * upward progression. Drawn as flat geometry so it stays legible down to 16px
 * and prints cleanly in monochrome.
 *
 * Geometry is shared between variants; only the fills change.
 */

const UPPER_PATH = 'M3 29 L11.67 29 L11.67 20.33 L20.33 20.33 L20.33 11.67 L29 11.67 L29 3 L3 3 Z'
const LOWER_PATH = 'M11.67 29 L11.67 20.33 L20.33 20.33 L20.33 11.67 L29 11.67 L29 29 Z'

/** Perpendicular offset that opens the seam between the two forms. */
const SEAM = 0.9

export interface LogoMarkProps extends React.SVGProps<SVGSVGElement> {
  /**
   * `brand` uses the fixed palette; `mono` inherits `currentColor`, for print,
   * a dark footer, or anywhere the surface colour is unknown.
   */
  variant?: 'brand' | 'mono'
  title?: string
}

export function LogoMark({ variant = 'brand', title, className, ...props }: LogoMarkProps) {
  const isMono = variant === 'mono'

  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-8', className)}
      // Decorative when it sits beside the wordmark; labelled when it stands alone.
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {/*
        Geometry is untouched — the seam is the identity. Only the fills moved,
        from two hardcoded hex values to semantic tokens.

        `fill-brand` resolves to the mark's own blue — #2457e6 in light,
        signal-400 in dark, which is what it shipped with. It is a separate
        token from `fg-accent` on purpose: that one is tuned for link text
        against body copy, and the mark should not move when it is retuned.
      */}
      <path
        d={UPPER_PATH}
        transform={`translate(${-SEAM} ${-SEAM})`}
        className={isMono ? 'fill-current opacity-55' : 'fill-brand'}
      />
      <path
        d={LOWER_PATH}
        transform={`translate(${SEAM} ${SEAM})`}
        className={isMono ? 'fill-current' : 'fill-fg'}
      />
    </svg>
  )
}

export interface LogoProps {
  variant?: 'brand' | 'mono'
  /** Hides the wordmark, leaving the mark alone. */
  markOnly?: boolean
  className?: string
  markClassName?: string
}

/** The full lockup: mark plus wordmark. */
export function Logo({ variant = 'brand', markOnly = false, className, markClassName }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark
        variant={variant}
        className={cn('size-7', markClassName)}
        {...(markOnly ? { title: PRODUCT.name } : {})}
      />
      {markOnly ? null : (
        <span className="text-title font-bold tracking-[-0.03em] text-fg">{PRODUCT.name}</span>
      )}
    </span>
  )
}
