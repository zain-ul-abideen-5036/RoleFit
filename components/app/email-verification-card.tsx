'use client'

import * as React from 'react'

import { BadgeCheck, MailWarning } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/feedback'
import { apiPost, toDisplayError } from '@/lib/client/api'

/**
 * Email verification status, and the control to request a new link.
 *
 * States what verification does and does not affect. RoleFit does not gate any
 * feature on a verified address, and saying so is more useful than an
 * unexplained warning badge — an unverified user is not locked out of anything,
 * they simply cannot recover the account by email.
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
    <Card>
      <CardHeader>
        <CardTitle as="h2">Email address</CardTitle>
        <CardDescription>
          {verified
            ? 'Your address is confirmed, so you can reset your password by email.'
            : 'Confirming your address is what lets you reset your password by email. Nothing else in RoleFit depends on it.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span
            className={
              verified
                ? 'flex size-9 items-center justify-center rounded-full bg-success-bg text-success-fg'
                : 'flex size-9 items-center justify-center rounded-full bg-warning-bg text-warning-fg'
            }
          >
            {verified ? (
              <BadgeCheck className="size-4" aria-hidden="true" />
            ) : (
              <MailWarning className="size-4" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{email}</p>
            <p className="text-xs text-fg-muted">{verified ? 'Confirmed' : 'Not confirmed yet'}</p>
          </div>
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

        {verified ? null : (
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void requestLink()}
              loading={submitting}
              loadingLabel="Sending…"
              disabled={sent}
            >
              {sent ? 'Link sent' : 'Send a confirmation link'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
