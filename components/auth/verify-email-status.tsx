'use client'

import * as React from 'react'

import Link from 'next/link'
import { CircleCheck, CircleX, Loader2 } from 'lucide-react'

import { apiPost, toDisplayError } from '@/lib/client/api'

/**
 * Redeems a verification token on arrival.
 *
 * Runs from the client rather than in the server component so the request is a
 * POST carrying the `Origin` header the CSRF check requires. It also means a
 * mail client prefetching the link with a GET cannot spend the token before the
 * person has clicked it.
 */
export function VerifyEmailStatus({ token }: { token: string }) {
  const [state, setState] = React.useState<'working' | 'done' | 'failed'>('working')
  const [message, setMessage] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!token) {
      setState('failed')
      setMessage('The verification link is missing its token.')
      return
    }

    let cancelled = false

    void (async () => {
      try {
        await apiPost('/api/auth/verify-email', { token })
        if (!cancelled) setState('done')
      } catch (error) {
        if (cancelled) return
        setState('failed')
        setMessage(toDisplayError(error).message)
      }
    })()

    return () => {
      // Strict mode mounts effects twice in development. Without this, the
      // second run reports the first run's token as already spent.
      cancelled = true
    }
  }, [token])

  if (state === 'working') {
    return (
      <div className="flex items-center gap-3" aria-live="polite">
        <Loader2 className="size-5 animate-spin text-accent" aria-hidden="true" />
        <p className="text-meta leading-relaxed text-fg-muted">Confirming your email address…</p>
      </div>
    )
  }

  if (state === 'done') {
    return (
      <div aria-live="polite">
        <div className="flex size-11 items-center justify-center rounded-full bg-success-bg text-success-fg">
          <CircleCheck className="size-5" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-display-sm font-semibold text-fg">Email confirmed</h1>
        <p className="mt-2 text-meta leading-relaxed text-fg-muted">
          Your address is verified. Nothing else to do.
        </p>
        <p className="mt-6 text-meta leading-relaxed text-fg-muted">
          <Link
            href="/dashboard"
            className="font-medium text-fg-accent underline underline-offset-4 hover:text-fg"
          >
            Go to your dashboard
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div aria-live="polite">
      <div className="flex size-11 items-center justify-center rounded-full bg-danger-bg text-danger-fg">
        <CircleX className="size-5" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-display-sm font-semibold text-fg">That link is no longer valid</h1>
      <p className="mt-2 text-meta leading-relaxed text-fg-muted">
        {message ?? 'The link may have expired or already been used.'} Verification links last 24
        hours and work once.
      </p>
      <p className="mt-6 text-meta leading-relaxed text-fg-muted">
        <Link
          href="/settings"
          className="font-medium text-fg-accent underline underline-offset-4 hover:text-fg"
        >
          Send a new link from settings
        </Link>
      </p>
    </div>
  )
}
