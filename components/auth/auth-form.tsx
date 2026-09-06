'use client'

import * as React from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Eye, EyeOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { apiPost, toDisplayError, type ApiFieldErrors } from '@/lib/client/api'
import { cn } from '@/lib/utils'

/**
 * Sign in / sign up form.
 *
 * One component for both, because the difference is three fields and a label —
 * duplicating it would guarantee the two drift apart on validation, error
 * handling and focus behaviour.
 */

export type AuthMode = 'login' | 'signup'

interface AuthResponse {
  user: { id: string; email: string }
}

const PASSWORD_RULES = [
  { label: 'At least 12 characters', test: (value: string) => value.length >= 12 },
  { label: 'A lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { label: 'An uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'A number', test: (value: string) => /[0-9]/.test(value) },
]

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter()
  const isSignup = mode === 'signup'

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [displayName, setDisplayName] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)

  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<ApiFieldErrors>({})

  const passwordChecks = PASSWORD_RULES.map((rule) => ({
    ...rule,
    passed: rule.test(password),
  }))

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})

    try {
      await apiPost<AuthResponse>(isSignup ? '/api/auth/signup' : '/api/auth/login', {
        email,
        password,
        ...(isSignup && displayName.trim() ? { displayName: displayName.trim() } : {}),
      })

      // `refresh()` so server components re-read the new session cookie before
      // the dashboard renders; without it the shell can paint signed-out.
      router.refresh()
      router.push('/dashboard')
    } catch (error) {
      const display = toDisplayError(error)
      setFormError(display.message)
      setFieldErrors(display.fieldErrors ?? {})
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-fg">
        {isSignup ? 'Create your account' : 'Sign in'}
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        {isSignup
          ? 'Free while the product is in development. No card required.'
          : 'Welcome back. Pick up where you left off.'}
      </p>

      {formError ? (
        <Alert tone="danger" live className="mt-6">
          {formError}
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        {isSignup ? (
          <Field id="displayName" error={fieldErrors['displayName']}>
            <FieldLabel optional>Name</FieldLabel>
            <Input
              name="name"
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Avery Chen"
            />
          </Field>
        ) : null}

        <Field id="email" error={fieldErrors['email']}>
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
        </Field>

        <Field id="password" error={fieldErrors['password']}>
          <FieldLabel>Password</FieldLabel>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              // Not a form control: excluded from tab order would be wrong, but
              // it must announce what it does and its current state.
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-md text-fg-subtle transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {isSignup ? null : (
            <FieldDescription>Use the password you created when you signed up.</FieldDescription>
          )}
        </Field>

        {isSignup ? (
          <ul className="-mt-1 flex flex-col gap-1.5" aria-label="Password requirements">
            {passwordChecks.map((rule) => (
              <li key={rule.label} className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    'flex size-4 items-center justify-center rounded-full border transition-colors',
                    rule.passed
                      ? 'border-success-line bg-success-bg text-success-fg'
                      : 'border-line-strong text-transparent',
                  )}
                  aria-hidden="true"
                >
                  <Check className="size-2.5" />
                </span>
                <span className={rule.passed ? 'text-success-fg' : 'text-fg-subtle'}>
                  {rule.label}
                </span>
                {/* Announced without relying on the colour of the tick. */}
                <span className="sr-only">{rule.passed ? '(met)' : '(not yet met)'}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={submitting}
          loadingLabel={isSignup ? 'Creating account…' : 'Signing in…'}
          className="mt-2"
        >
          {isSignup ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-sm text-fg-muted">
        {isSignup ? 'Already have an account? ' : 'New here? '}
        <Link
          href={isSignup ? '/login' : '/signup'}
          className="font-medium text-fg-accent underline underline-offset-4 hover:text-fg"
        >
          {isSignup ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </div>
  )
}
