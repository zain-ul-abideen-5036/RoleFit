import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Card.
 *
 * The product's primary surface. Elevation is a hairline border plus a very low
 * shadow — the design direction treats shadows as delineation, not decoration,
 * so nothing here floats.
 */

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Card({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('rounded-xl border border-line bg-surface text-fg shadow-xs', className)}
        {...props}
      />
    )
  },
)

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
      className={cn('font-display text-[1.0625rem] font-medium tracking-tight text-fg', className)}
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
