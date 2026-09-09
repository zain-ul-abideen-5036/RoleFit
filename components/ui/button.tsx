import * as React from 'react'

import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Button.
 *
 * Sizes meet a comfortable touch target from `md` upward, and focus rings are
 * never removed without replacement.
 *
 * The press is the one piece of motion here that earns its place. It was
 * `translate-y-px`, which is a jump rather than a press: it moves the label
 * but nothing about the surface reads as depressed, and a 1px step at 60fps
 * is a flicker. A scale under 1 with the shadow pulled in at the same time
 * reads as the thing being pushed into the page, which is what actually
 * happened.
 *
 * Transitions are confined to `background-color`, `box-shadow`, `transform`
 * and `border-color`. All four are compositor-friendly or cheap; none of them
 * reflows, so a page of buttons costs nothing on hover.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'font-medium',
    'transition-[background-color,box-shadow,transform,border-color,color]',
    'duration-[--duration-fast] ease-[--ease-standard]',
    // The press: 1.5% down, and back on release. Small enough to feel like
    // travel in the surface rather than a size change.
    'active:scale-[0.985] active:duration-[--duration-instant]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    'disabled:pointer-events-none disabled:opacity-55',
    'cursor-pointer select-none',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-on-accent shadow-xs hover:bg-accent-hover hover:shadow-sm active:shadow-none',
        /** Marketing CTAs only — the accent is reserved for conversion moments. */
        cta: 'bg-cta text-on-cta shadow-sm hover:bg-cta-hover hover:shadow-md active:shadow-xs',
        secondary:
          'border border-line-strong bg-surface text-fg shadow-xs hover:border-line-bold hover:bg-sunken active:shadow-none',
        ghost: 'text-fg-muted hover:bg-sunken hover:text-fg',
        danger: 'bg-danger-solid text-white shadow-xs hover:brightness-95 active:shadow-none',
        // Not a button shape at all, so it opts out of the press.
        link: 'text-fg-accent underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-6 text-body-lg',
        icon: 'size-10',
        'icon-sm': 'size-8',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Shows a spinner and blocks interaction. */
  loading?: boolean
  /** Replaces the label while loading, e.g. "Uploading…". */
  loadingLabel?: string
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    fullWidth,
    asChild = false,
    loading = false,
    loadingLabel,
    children,
    disabled,
    ...props
  },
  ref,
) {
  // `asChild` renders a foreign element (usually a Link); injecting a spinner
  // would break Slot's single-child contract.
  if (asChild) {
    return (
      <Slot
        ref={ref}
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        {...props}
      >
        {children}
      </Slot>
    )
  }

  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  )
})

export { buttonVariants }
