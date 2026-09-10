'use client'

import * as React from 'react'

import { BadgeCheck, MailWarning } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { Panel } from '@/components/ui/layout'
import { apiPost, toDisplayError } from '@/lib/client/api'
import { cn } from '@/lib/utils'

/**
 * Email verification status, and the control to request a new link.
 *
 * States what verification does and does not affect. RoleFit does not gate any
 * feature on a verified address, and saying so is more useful than an
 * unexplained warning badge — an unverified user is not locked out of
 * anything, they simply cannot recover the account by email.
 *
 * Sits at the top of Settings as a status strip rather than as the first of
 * five identical cards. When the address is already confirmed it is a single
 * quiet line: a verified account does not need a panel explaining that
 * nothing is wrong.
 */
export function EmailVerificationCard({ email, verified }: { email: string; verified: boolean }) {
  const [submitting, setSubmitting] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function requestLink(): Promise<void> {
    if (submitting) return

    setSubmitting(true)
    setError(null)

    try {
      await apiPost('/api/auth/request-verification', { email })
      setSent(true)
    } catch (caught) {
      setError(toDisplayError(caught).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Panel tone={verified ? 'default' : 'warning'} className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
              verified ? 'bg-success-bg text-success-solid' : 'bg-warning-bg text-warning-solid',
            )}
            aria-hidden="true"
          >
            {verified ? <BadgeCheck className="size-4" /> : <MailWarning className="size-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-meta font-semibold text-fg">
              {verified ? 'Email address confirmed' : 'Email address not confirmed'}
              <span className="sr-only">{verified ? '' : ' — action available'}</span>
            </p>
            <p className="mt-0.5 measure text-2xs leading-relaxed text-fg-muted">
              <span className="break-all font-medium text-fg-muted">{email}</span>
              {' — '}
              {verified
                ? 'you can reset your password by email.'
                : 'confirming it is what lets you reset your password by email. Nothing else in RoleFit depends on it.'}
            </p>
          </div>
        </div>

        {verified ? null : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => void requestLink()}
            loading={submitting}
            loadingLabel="Sending…"
            disabled={sent}
          >
            {sent ? 'Link sent' : 'Send a confirmation link'}
          </Button>
        )}
      </div>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {sent ? (
        <Alert tone="success">
          A confirmation link is on its way to {email}. It is valid for 24 hours and can be used
          once.
        </Alert>
      ) : null}
    </Panel>
  )
}
