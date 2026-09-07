'use client'

import * as React from 'react'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  ChevronDown,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'

import { Logo } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Button } from '@/components/ui/button'
import { apiPost } from '@/lib/client/api'
import { cn } from '@/lib/utils'

/**
 * Application shell.
 *
 * A persistent sidebar on desktop, a slide-over on mobile. The mobile drawer is
 * a dialog: it traps focus, closes on Escape and on backdrop click, and
 * restores focus to the trigger — a navigation drawer that strands keyboard
 * users behind it is a common and avoidable failure.
 */

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/optimize', label: 'Optimize', Icon: Sparkles },
  { href: '/history', label: 'History', Icon: History },
  { href: '/settings', label: 'Settings', Icon: Settings },
]

export interface AppShellProps {
  user: { email: string; displayName: string | null }
  children: React.ReactNode
}

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = React.useState(false)

  // Close the drawer whenever the route changes.
  React.useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <DesktopSidebar pathname={pathname} user={user} />

      <div className="flex min-w-0 flex-col">
        <MobileHeader onOpenDrawer={() => setDrawerOpen(true)} />
        <main id="main" className="flex-1 pb-16">
          {children}
        </main>
      </div>

      {drawerOpen ? (
        <MobileDrawer pathname={pathname} user={user} onClose={() => setDrawerOpen(false)} />
      ) : null}
    </div>
  )
}

/* ==========================================================================
   Navigation
   ========================================================================== */

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        // `/resume/...` and `/analysis/...` belong to the Optimize flow.
        const active =
          pathname === href ||
          (href === '/optimize' &&
            (pathname.startsWith('/optimize') ||
              pathname.startsWith('/analysis') ||
              pathname.startsWith('/resume')))

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              active
                ? 'bg-accent-subtle text-fg-accent'
                : 'text-fg-muted hover:bg-sunken hover:text-fg',
            )}
          >
            <Icon className="size-4.5 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

function DesktopSidebar({ pathname, user }: { pathname: string; user: AppShellProps['user'] }) {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface lg:flex">
      <div className="px-5 py-5">
        <Link
          href="/dashboard"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Logo />
        </Link>
      </div>

      <div className="px-3">
        <Button fullWidth asChild>
          <Link href="/optimize">
            <Sparkles className="size-4" aria-hidden="true" />
            New optimization
          </Link>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5">
        <NavList pathname={pathname} />
      </div>

      <div className="border-t border-line p-3">
        <AccountMenu user={user} />
      </div>
    </aside>
  )
}

function MobileHeader({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur-sm lg:hidden">
      <Link
        href="/dashboard"
        className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <Logo />
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Button variant="secondary" size="icon" onClick={onOpenDrawer} aria-label="Open menu">
          <Menu className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </header>
  )
}

function MobileDrawer({
  pathname,
  user,
  onClose,
}: {
  pathname: string
  user: AppShellProps['user']
  onClose: () => void
}) {
  const panelRef = React.useRef<HTMLDivElement>(null)
  const previouslyFocused = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    // Move focus into the drawer so the next Tab lands inside it.
    panelRef.current?.focus()

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables || focusables.length === 0) return

      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = originalOverflow
      previouslyFocused.current?.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-ink-950/45 animate-fade-in"
        onClick={onClose}
        aria-label="Close menu"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col border-r border-line bg-surface outline-none"
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Logo />
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close menu">
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="px-3 pb-4">
          <Button fullWidth asChild>
            <Link href="/optimize">
              <Sparkles className="size-4" aria-hidden="true" />
              New optimization
            </Link>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          <NavList pathname={pathname} onNavigate={onClose} />
        </div>

        <div className="border-t border-line p-3">
          <AccountMenu user={user} />
        </div>
      </div>
    </div>
  )
}

/* ==========================================================================
   Account
   ========================================================================== */

function AccountMenu({ user }: { user: AppShellProps['user'] }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [signingOut, setSigningOut] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function signOut(): Promise<void> {
    setSigningOut(true)
    try {
      await apiPost('/api/auth/logout')
    } catch {
      // Signing out locally is the right outcome even if the call failed.
    }
    router.refresh()
    router.push('/')
  }

  const label = user.displayName?.trim() || user.email
  const initial = label.charAt(0).toUpperCase()

  return (
    <div ref={containerRef} className="relative">
      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute bottom-full left-0 mb-2 w-full overflow-hidden rounded-lg border border-line bg-overlay shadow-lg animate-fade-in"
        >
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-sm font-medium text-fg">{label}</p>
            <p className="truncate text-xs text-fg-subtle">{user.email}</p>
          </div>
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-fg-muted transition-colors hover:bg-sunken hover:text-fg"
          >
            <Settings className="size-4" aria-hidden="true" />
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={signingOut}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-sm text-fg-muted transition-colors hover:bg-sunken hover:text-fg disabled:opacity-60"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-sm font-semibold text-fg-accent"
          aria-hidden="true"
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{label}</span>
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-fg-subtle transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}

/** Page header used at the top of each app screen. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  breadcrumb?: { href: string; label: string }
}) {
  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
        {breadcrumb ? (
          <Link
            href={breadcrumb.href}
            className="mb-3 inline-flex items-center gap-1.5 rounded text-sm text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <FileText className="size-3.5" aria-hidden="true" />
            {breadcrumb.label}
          </Link>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">{title}</h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
    </div>
  )
}

/** Standard content container for app pages. */
export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8', className)}>
      {children}
    </div>
  )
}
