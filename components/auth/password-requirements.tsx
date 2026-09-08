'use client'

import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The live password checklist.
 *
 * Shared by signup and password reset. Both must enforce the same policy, and
 * a policy shown in two places is a policy that eventually disagrees with
 * itself — and with `passwordSchema`, which is the one that actually decides.
 */

export const PASSWORD_RULES = [
  { label: 'At least 12 characters', test: (value: string) => value.length >= 12 },
  { label: 'A lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { label: 'An uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'A number', test: (value: string) => /[0-9]/.test(value) },
] as const

export function PasswordRequirements({ value }: { value: string }) {
  return (
    <ul className="-mt-1 flex flex-col gap-1.5" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const passed = rule.test(value)

        return (
          <li key={rule.label} className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                'flex size-4 items-center justify-center rounded-full border transition-colors',
                passed
                  ? 'border-success-line bg-success-bg text-success-fg'
                  : 'border-line-strong text-transparent',
              )}
              aria-hidden="true"
            >
              <Check className="size-2.5" />
            </span>
            <span className={passed ? 'text-success-fg' : 'text-fg-subtle'}>{rule.label}</span>
            {/* Announced without relying on the colour of the tick. */}
            <span className="sr-only">{passed ? '(met)' : '(not yet met)'}</span>
          </li>
        )
      })}
    </ul>
  )
}
