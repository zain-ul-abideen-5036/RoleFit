'use client'

import * as React from 'react'

import Link from 'next/link'
import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PageBody, Panel } from '@/components/ui/layout'
import { PRODUCT } from '@/lib/constants'

/**
 * Error boundary for the authenticated section.
 *
 * Scoped to the app segment on purpose, so a failure on one screen leaves the
 * navigation intact and the user can move somewhere else. The root boundary
 * replaces the entire document, which for a signed-in user means losing the
 * shell and being handed a dead end — correct for a failure in the layout
 * itself, wrong for a failure inside one page.
 *
 * `error.message` is deliberately not rendered. In production Next.js already
 * replaces it with a generic string, but in development it would be a stack
 * trace or a database error — and a boundary that shows one in development is
 * a boundary that eventually shows one in production. The digest is shown
 * instead: it correlates with the server log without revealing anything.
 */
export default function AppError({
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
    <PageBody>
      <Panel tone="danger" className="mx-auto max-w-xl px-5 py-8 text-center sm:px-8">
        <h1 className="text-title font-semibold text-fg">This screen could not be loaded</h1>
        <p className="mx-auto mt-2 measure-tight text-meta leading-relaxed text-fg-muted">
          Something failed while preparing this page. Nothing you had saved has been lost — your
          resumes, runs and decisions are all still there.
        </p>

        {error.digest ? (
          <p className="mt-3 text-2xs text-fg-subtle">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}

        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={reset}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>

        <p className="mt-6 text-2xs text-fg-subtle">
          If it keeps happening,{' '}
          <a
            className="focus-ring rounded underline underline-offset-4 hover:text-fg"
            href={`mailto:${PRODUCT.supportEmail}`}
          >
            let us know
          </a>
          .
        </p>
      </Panel>
    </PageBody>
  )
}
