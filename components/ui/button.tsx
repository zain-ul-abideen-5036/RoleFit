import * as React from 'react'

import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Button.
 *
 * Sizes meet a comfortable touch target from `md` upward, focus rings are never
 * removed without replacement, and transitions apply to colour rather than
 * layout so nothing reflows on hover.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'font-medium transition-colors duration-150',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    'disabled:pointer-events-none disabled:opacity-55',
    'cursor-pointer select-none',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent shadow-xs hover:bg-accent-hover active:translate-y-px',
        /** Marketing CTAs only — the accent is reserved for conversion moments. */
        cta: 'bg-cta text-on-cta shadow-sm hover:bg-cta-hover active:translate-y-px',
        secondary:
          'border border-line-strong bg-surface text-fg shadow-xs hover:bg-sunken active:translate-y-px',
        ghost: 'text-fg-muted hover:bg-sunken hover:text-fg',
        danger: 'bg-danger-solid text-white shadow-xs hover:brightness-95 active:translate-y-px',
        link: 'text-fg-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-6 text-[0.9375rem]',
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
