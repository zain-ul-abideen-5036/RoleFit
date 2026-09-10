'use client'

import * as React from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'

import { PasswordRequirements } from '@/components/auth/password-requirements'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { apiPost, toDisplayError, type ApiFieldErrors } from '@/lib/client/api'

/**
 * Sets a new password from a reset link.
 *
 * The token arrives in the query string and is never displayed. On success the
 * user is sent to sign in rather than straight into the app: redeeming the link
 * proves control of the mailbox, not that the password they just typed is the
 * one they meant, and signing in confirms it reached the server intact.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()

  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<ApiFieldErrors>({})

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})

    try {
      await apiPost('/api/auth/reset-password', { token, password })
      // `refresh()` so the shell re-reads session state rather than painting
      // from a stale cache.
      router.refresh()
      router.push('/login?reset=1')
    } catch (error) {
      const display = toDisplayError(error)
      setFormError(display.message)
      setFieldErrors(display.fieldErrors ?? {})
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div>
        <h1 className="text-display-sm font-semibold text-fg">That link is incomplete</h1>
        <p className="mt-2 text-meta leading-relaxed text-fg-muted">
          The reset link is missing its token. Email clients sometimes break long links across lines
          — copying the whole thing into the address bar usually fixes it.
        </p>
        <p className="mt-6 text-meta leading-relaxed text-fg-muted">
          <Link
            href="/forgot-password"
            className="font-medium text-fg-accent underline underline-offset-4 hover:text-fg"
          >
            Request a new link
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-display-sm font-semibold text-fg">Choose a new password</h1>
      <p className="mt-2 text-meta leading-relaxed text-fg-muted">
        Setting a new password signs you out everywhere else.
      </p>

      {formError ? (
        <Alert tone="danger" live className="mt-6">
          {formError}
          {fieldErrors['token'] ? (
            <>
              {' '}
              <Link href="/forgot-password" className="font-medium underline underline-offset-4">
                Request a new link
              </Link>
              .
            </>
          ) : null}
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <Field id="password" error={fieldErrors['password']}>
          <FieldLabel>New password</FieldLabel>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="focus-ring absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-md text-fg-subtle transition-colors hover:text-fg"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </Field>

        <PasswordRequirements value={password} />

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={submitting}
          loadingLabel="Saving…"
          className="mt-2"
        >
          Set new password
        </Button>
      </form>
    </div>
  )
}
