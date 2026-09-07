'use client'

import * as React from 'react'

import Link from 'next/link'
import { RefreshCw } from 'lucide-react'

import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { PRODUCT } from '@/lib/constants'

/**
 * Global error boundary.
 *
 * `error.message` is deliberately not rendered. In production Next.js already
 * replaces it with a generic string, but in development it would be a stack
 * trace or a database error — and a boundary that shows one in development is
 * a boundary that eventually shows one in production. The digest is shown
 * instead: it correlates with the server log without revealing anything.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    // Surfaced in the browser console only; the server has already logged the
    // real error under the same digest.
    console.error('Unhandled application error', error.digest ?? '(no digest)')
  }, [error])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo />
      <h1 className="mt-10 text-3xl font-bold tracking-tight text-fg">Something went wrong</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-fg-muted">
        An unexpected error interrupted this page. Nothing you had saved has been lost — try again,
        and if it keeps happening let us know.
      </p>

      {error.digest ? (
        <p className="mt-4 text-xs text-fg-subtle">
          Reference: <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button onClick={reset}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Try again
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>

      <p className="mt-8 text-xs text-fg-subtle">
        <a
          className="underline underline-offset-4 hover:text-fg"
          href={`mailto:${PRODUCT.supportEmail}`}
        >
          {PRODUCT.supportEmail}
        </a>
      </p>
    </div>
  )
}
