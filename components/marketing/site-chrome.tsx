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
 */
export function SiteHeader() {
  const [open, setOpen] = React.useState(false)

  // Close on route change or Escape.
  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-sm">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          aria-label={`${PRODUCT.name} home`}
        >
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-sunken hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <ThemeToggle />
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
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </div>

      {open ? (
        <div id="mobile-nav" className="border-t border-line bg-surface lg:hidden">
          <nav className="container-page flex flex-col py-3" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-3 text-sm font-medium text-fg-muted hover:bg-sunken hover:text-fg"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-line pt-4">
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
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-muted">
              Evidence-based resume optimization. RoleFit rewrites what you already have — it never
              invents experience you do not.
            </p>
          </div>

          {FOOTER_SECTIONS.map((section) => (
            <div key={section.heading}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                {section.heading}
              </h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    {/*
                      inline-flex with vertical padding, so the link is a real
                      24px+ target. An inline anchor's padding does not grow its
                      layout box, which leaves an 18px tap target on a phone.
                    */}
                    <Link
                      href={link.href}
                      className="inline-flex min-h-6 items-center rounded py-0.5 text-sm text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-fg-subtle">
            © {new Date().getFullYear()} {PRODUCT.name}. Built by {PRODUCT.owner}.
          </p>
          <div className="flex items-center gap-4">
            <a
              href={PRODUCT.repository}
              className="inline-flex min-h-6 items-center rounded text-xs text-fg-subtle transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
