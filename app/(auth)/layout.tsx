import Link from 'next/link'

import { CheckCircle2 } from 'lucide-react'

import { Logo } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { PRODUCT } from '@/lib/constants'

const ASSURANCES = [
  'Never adds skills your resume does not support',
  'Every change is shown before it is applied',
  'Your resume is never written to our logs',
]

/**
 * Auth layout.
 *
 * A split layout on large screens: the form on the left, and the product's
 * actual promise on the right. On mobile the panel is dropped entirely rather
 * than stacked — someone signing in on a phone wants the form, not marketing.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-2">
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between px-6 py-5 sm:px-8">
          <Link
            href="/"
            className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            aria-label={`${PRODUCT.name} home`}
          >
            <Logo />
          </Link>
          <ThemeToggle />
        </header>

        <main id="main" className="flex flex-1 items-center justify-center px-6 py-10 sm:px-8">
          <div className="w-full max-w-sm">{children}</div>
        </main>

        <footer className="px-6 py-6 sm:px-8">
          <p className="text-xs text-fg-subtle">
            By continuing you agree to the{' '}
            <Link href="/terms" className="underline underline-offset-4 hover:text-fg">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-fg">
              Privacy policy
            </Link>
            .
          </p>
        </footer>
      </div>

      <aside className="hidden border-l border-line bg-surface lg:flex lg:flex-col lg:justify-center lg:px-14">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-accent">
          Why {PRODUCT.name}
        </p>
        <h2 className="mt-4 max-w-md font-display text-3xl font-medium leading-tight tracking-tight text-fg">
          A tailored resume you can defend in the interview
        </h2>
        <p className="mt-4 max-w-md text-base leading-relaxed text-fg-muted">
          Optimization that works from the experience you actually have, and tells you plainly where
          the gaps are.
        </p>

        <ul className="mt-10 flex max-w-md flex-col gap-4">
          {ASSURANCES.map((item) => (
            <li key={item} className="flex items-start gap-3">
              <CheckCircle2
                className="mt-0.5 size-4.5 shrink-0 text-success-solid"
                aria-hidden="true"
              />
              <span className="text-sm leading-relaxed text-fg-muted">{item}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
