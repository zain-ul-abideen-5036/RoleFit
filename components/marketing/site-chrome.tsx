'use client'

import * as React from 'react'

import Link from 'next/link'
import { Menu, X } from 'lucide-react'

import { Logo, LogoMark } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Button } from '@/components/ui/button'
import { PRODUCT } from '@/lib/constants'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#evidence', label: 'Anti-fabrication' },
  { href: '/#ats', label: 'ATS readiness' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
]

/**
 * Marketing header.
 *
 * The mobile menu is a disclosure rather than a modal: it does not trap focus
 * or lock scrolling, because at this size the page behind it is the content the
 * links point at.
 *
 * Links are set at the metadata step rather than at body size. Five nav items
 * at 14px medium beside a wordmark and two buttons is a header where nothing
 * is dominant; dropping the links a step leaves the wordmark and the primary
 * action as the two things the eye lands on, which is the correct order.
 */
export function SiteHeader() {
  const [open, setOpen] = React.useState(false)

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <header className="sticky top-0 z-[--z-header] border-b border-line bg-canvas/85 backdrop-blur-sm">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="focus-ring rounded-md focus-visible:outline-offset-4"
          aria-label={`${PRODUCT.name} home`}
        >
          <Logo />
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="focus-ring rounded-md px-2.5 py-2 text-meta font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 lg:flex">
          <ThemeToggle />
          {/* A hairline divider, so the theme control reads as chrome and the
              two account actions read as a pair. */}
          <span aria-hidden="true" className="h-5 w-px bg-line" />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle />
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? (
              <X className="size-4" aria-hidden="true" />
            ) : (
              <Menu className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {open ? (
        <div id="mobile-nav" className="animate-enter border-t border-line bg-surface lg:hidden">
          <nav className="container-page flex flex-col py-2" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="focus-ring rounded-md px-2 py-3 text-meta font-medium text-fg-muted hover:bg-hover hover:text-fg"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3 pb-2">
              <Button variant="secondary" fullWidth asChild>
                <Link href="/login" onClick={() => setOpen(false)}>
                  Sign in
                </Link>
              </Button>
              <Button fullWidth asChild>
                <Link href="/signup" onClick={() => setOpen(false)}>
                  Get started
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  )
}

/* ==========================================================================
   Footer
   ========================================================================== */

const FOOTER_SECTIONS = [
  {
    heading: 'Product',
    links: [
      { href: '/#how-it-works', label: 'How it works' },
      { href: '/#evidence', label: 'Anti-fabrication' },
      { href: '/#ats', label: 'ATS readiness' },
      { href: '/#pricing', label: 'Pricing' },
      { href: '/#faq', label: 'FAQ' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy policy' },
      { href: '/terms', label: 'Terms of service' },
      { href: '/ai-disclaimer', label: 'AI disclaimer' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { href: '/login', label: 'Sign in' },
      { href: '/signup', label: 'Create account' },
      { href: '/dashboard', label: 'Dashboard' },
    ],
  },
]

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('border-t border-line bg-surface', className)}>
      <div className="container-page py-12 lg:py-16">
        <div className="grid gap-10 md:grid-cols-[1.6fr_repeat(3,1fr)]">
          <div className="min-w-0">
            <Logo />
            <p className="mt-4 measure-tight text-meta leading-relaxed text-fg-muted">
              Evidence-based resume optimization. {PRODUCT.name} rewrites what you already have — it
              never invents experience you do not.
            </p>
          </div>

          {FOOTER_SECTIONS.map((section) => (
            <div key={section.heading}>
              <h2 className="eyebrow text-fg-subtle">{section.heading}</h2>
              <ul className="mt-3.5 flex flex-col gap-1.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    {/*
                      inline-flex with a minimum height, so the link is a real
                      24px+ target. An inline anchor's padding does not grow its
                      layout box, which leaves an 18px tap target on a phone.
                    */}
                    <Link
                      href={link.href}
                      className="focus-ring inline-flex min-h-6 items-center rounded text-meta text-fg-muted transition-colors hover:text-fg"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-2xs text-fg-subtle">
            © {new Date().getFullYear()} {PRODUCT.name}. Built by {PRODUCT.owner}.
          </p>
          <div className="flex items-center gap-4">
            <a
              href={PRODUCT.repository}
              className="focus-ring inline-flex min-h-6 items-center rounded text-2xs text-fg-subtle transition-colors hover:text-fg"
              rel="noreferrer noopener"
              target="_blank"
            >
              Source on GitHub
            </a>
            <LogoMark variant="mono" className="size-4 text-fg-subtle" />
          </div>
        </div>
      </div>
    </footer>
  )
}
