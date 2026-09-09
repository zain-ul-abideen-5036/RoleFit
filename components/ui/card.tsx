import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Card.
 *
 * The product's primary surface. Elevation is a hairline border plus a very low
 * shadow — the design direction treats shadows as delineation, not decoration,
 * so nothing here floats.
 *
 * A card is not the default container. Most groupings on a page are better
 * served by a heading and a rule, and reaching for a card every time is what
 * produces the bordered-box grid that reads as a template. Use one when the
 * content genuinely is a discrete object: a run, a document, a proposal.
 */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The card is itself a target — it wraps a link, or the whole surface is
   * clickable. Adds hover and press feedback.
   *
   * Deliberately opt-in. A card that lifts under the pointer but does nothing
   * when clicked is a promise the interface does not keep, and users learn
   * within a page to stop trusting the cue.
   */
  interactive?: boolean
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive = false, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-line bg-surface text-fg shadow-xs',
        'transition-[border-color,box-shadow,transform] duration-[--duration-fast] ease-[--ease-standard]',
        interactive && [
          'hover:border-line-strong hover:shadow-md',
          'active:scale-[0.997] active:shadow-xs active:duration-[--duration-instant]',
          // The card may wrap the link rather than be one, so the ring is
          // drawn from whatever inside it took focus.
          'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
        ],
        className,
      )}
      {...props}
    />
  )
})

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return (
      <div ref={ref} className={cn('flex flex-col gap-1.5 p-5 sm:p-6', className)} {...props} />
    )
  },
)

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' | 'h4' }
>(function CardTitle({ className, as: Component = 'h3', ...props }, ref) {
  return (
    <Component
      ref={ref}
      className={cn('font-display text-title font-medium tracking-tight text-fg', className)}
      {...props}
    />
  )
})

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return (
    <p ref={ref} className={cn('text-sm leading-relaxed text-fg-muted', className)} {...props} />
  )
})

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn('p-5 pt-0 sm:p-6 sm:pt-0', className)} {...props} />
  },
)

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-wrap items-center gap-3 border-t border-line px-5 py-4 sm:px-6',
          className,
        )}
        {...props}
      />
    )
  },
)
