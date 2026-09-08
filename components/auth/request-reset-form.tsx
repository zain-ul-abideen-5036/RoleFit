'use client'

import * as React from 'react'

import Link from 'next/link'
import { MailCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { apiPost, toDisplayError } from '@/lib/client/api'

/**
 * Requests a password reset link.
 *
 * The confirmation is identical whether or not the address has an account, and
 * it is worded to be *true* in both cases: "if an account exists". Saying "we
 * have sent you an email" when no account exists would be a lie, and saying
 * "no account found" would hand over an enumeration oracle.
 */
export function RequestResetForm() {
  const [email, setEmail] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setFormError(null)

    try {
      await apiPost('/api/auth/request-password-reset', { email })
      setSent(true)
    } catch (error) {
      // Only a transport or rate-limit failure can land here; the endpoint
      // itself does not distinguish known from unknown addresses.
      setFormError(toDisplayError(error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div>
        <div className="flex size-11 items-center justify-center rounded-full bg-success-bg text-success-fg">
          <MailCheck className="size-5" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-fg">Check your email</h1>
        <p className="mt-2 text-sm text-fg-muted">
          If an account exists for <span className="font-medium text-fg">{email}</span>, a reset
          link is on its way. It is valid for one hour and can be used once.
        </p>
        <p className="mt-4 text-sm text-fg-muted">
          Nothing arrived? Check your spam folder, then{' '}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="cursor-pointer font-medium text-fg-accent underline underline-offset-4 hover:text-fg"
          >
            try again
          </button>
          .
        </p>
        <p className="mt-6 text-sm text-fg-muted">
          <Link
            href="/login"
            className="font-medium text-fg-accent underline underline-offset-4 hover:text-fg"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-fg">Reset your password</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Enter the address you signed up with and we will email you a link.
      </p>

      {formError ? (
        <Alert tone="danger" live className="mt-6">
          {formError}
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <Field id="email">
          <FieldLabel>Email</FieldLabel>
          <Input
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
          <FieldDescription>
            Your current password keeps working until you set a new one.
          </FieldDescription>
        </Field>

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={submitting}
          loadingLabel="Sending…"
          className="mt-2"
        >
          Email me a reset link
        </Button>
      </form>

      <p className="mt-6 text-sm text-fg-muted">
        Remembered it?{' '}
        <Link
          href="/login"
          className="font-medium text-fg-accent underline underline-offset-4 hover:text-fg"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
