import Link from 'next/link'

import { Check } from 'lucide-react'

import { Logo } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { PRODUCT } from '@/lib/constants'

const ASSURANCES = [
  {
    title: 'Never adds skills your resume does not support',
    body: 'Every rewrite is checked against your source document before you see it.',
  },
  {
    title: 'Every change is shown before it is applied',
    body: 'Accept, edit or reject each one. Nothing lands that you have not agreed to.',
  },
  {
    title: 'Your resume is never written to our logs',
    body: 'Delete your account and the documents behind it go with it.',
  },
]

/**
 * Auth layout.
 *
 * A split layout on large screens: the form on the left, and the product's
 * actual promise on the right. On mobile the panel is dropped entirely rather
 * than stacked — someone signing in on a phone wants the form, not marketing.
 *
 * The right-hand panel is dark in both themes. It is the one full-bleed dark
 * region in the product, and it is here for a structural reason rather than a
 * decorative one: this is the only screen with nothing else on it, so the two
 * halves have to distinguish themselves from each other, and a hairline
 * between two white columns does not do that at 1440px.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[1fr_minmax(0,34rem)]">
      <div className="flex flex-1 flex-col">
        <header className="flex h-(--header-height) shrink-0 items-center justify-between px-5 sm:px-8">
          <Link
            href="/"
            className="focus-ring rounded-md focus-visible:outline-offset-4"
            aria-label={`${PRODUCT.name} home`}
          >
            <Logo />
          </Link>
          <ThemeToggle />
        </header>

        <main id="main" className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-sm">{children}</div>
        </main>

        <footer className="px-5 py-6 sm:px-8">
          <p className="measure text-2xs leading-relaxed text-fg-subtle">
            By continuing you agree to the{' '}
            <Link
              href="/terms"
              className="focus-ring rounded underline underline-offset-4 hover:text-fg"
            >
              Terms
            </Link>{' '}
            and{' '}
            <Link
              href="/privacy"
              className="focus-ring rounded underline underline-offset-4 hover:text-fg"
            >
              Privacy policy
            </Link>
            .
          </p>
        </footer>
      </div>

      {/*
        Pinned to the ink primitive rather than the `inverse` semantic token.
        `bg-inverse` means "the opposite of the current surface", which in dark
        mode resolves to near-white — and the light-on-dark type inside here
        would then have been white on white. This panel is dark in both themes
        by design, so it names the colour it actually wants.
      */}
      <aside className="hidden bg-ink-950 lg:flex lg:flex-col lg:justify-center lg:px-14 lg:py-16">
        <p className="eyebrow text-signal-300">Why {PRODUCT.name}</p>
        {/*
          The display serif, at a display size. This is the persuasive surface —
          one of the two places in the product where the serif is allowed — and
          it is set once, large, in a single weight.
        */}
        <h2 className="mt-4 max-w-md font-display text-serif-xs text-white">
          A tailored resume you can defend in the interview
        </h2>
        <p className="mt-4 max-w-md text-body-lg leading-relaxed text-ink-300">
          Optimization that works from the experience you actually have, and tells you plainly where
          the gaps are.
        </p>

        <ul className="mt-10 flex max-w-md flex-col divide-y divide-white/10 border-y border-white/10">
          {ASSURANCES.map((item) => (
            <li key={item.title} className="flex items-start gap-3 py-4">
              <span
                className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-verdant-500/20 text-verdant-200"
                aria-hidden="true"
              >
                <Check className="size-2.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-meta font-medium text-white">{item.title}</span>
                <span className="mt-0.5 block text-2xs leading-relaxed text-ink-400">
                  {item.body}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
