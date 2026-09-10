'use client'

import * as React from 'react'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  ChevronsUpDown,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'

import { Logo, LogoMark } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { apiPost } from '@/lib/client/api'
import { cn } from '@/lib/utils'

/**
 * Application shell.
 *
 * Three navigation states, not two:
 *
 *   < md         a mobile header with a slide-over drawer
 *   md .. lg     an icon rail, 3.75rem wide, labels stacked under the glyphs
 *   >= lg        the full sidebar
 *
 * The middle state is the one that was missing. Navigation appeared only from
 * `lg` up, so a 768px tablet in portrait — an entirely ordinary way to use
 * this product — got the phone layout, with the primary navigation hidden
 * behind a button and a quarter of the width unused beside the content.
 *
 * The full sidebar returns at `lg` rather than `xl` on purpose. A 1280px
 * laptop reports a layout viewport of around 1265px once a classic scrollbar
 * is subtracted, so an `xl` threshold would hand the most common laptop width
 * the tablet rail.
 *
 * The rail is one DOM tree with the full sidebar, switched by CSS rather than
 * by measuring the viewport in JavaScript. Labels are always present in the
 * accessibility tree; only their presentation changes. Rendering two trees, or
 * one tree gated on a `useMediaQuery`, both mean the server render and the
 * first client render can disagree about which navigation exists.
 *
 * Labels stay visible in the rail, set small and stacked, rather than being
 * replaced by tooltips. A tooltip is unreachable by touch, and the rail state
 * is exactly the tablet width where touch is most likely.
 */

/**
 * Navigation, grouped.
 *
 * Four destinations in a full-height column left most of the sidebar empty,
 * and an empty column reads as an unfinished one. Two labelled groups give the
 * space structure instead of filler: the three screens that are the job, then
 * the one that is not.
 *
 * Deliberately not solved by inventing a widget to fill the gap. Recent-items
 * lists and usage meters in a sidebar are things to maintain forever in
 * exchange for occupying pixels.
 */
const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
      { href: '/optimize', label: 'Optimize', Icon: Sparkles },
      { href: '/history', label: 'History', Icon: History },
    ],
  },
  {
    label: 'Account',
    items: [{ href: '/settings', label: 'Settings', Icon: Settings }],
  },
] as const

type NavItem = (typeof NAV_GROUPS)[number]['items'][number]

/** `/resume/...` and `/analysis/...` belong to the Optimize flow. */
function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href !== '/optimize') return false
  return (
    pathname.startsWith('/optimize') ||
    pathname.startsWith('/analysis') ||
    pathname.startsWith('/resume')
  )
}

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
    <div
      className={cn(
        'min-h-dvh',
        // The grid column is the sidebar token, so the shell and the sidebar
        // cannot disagree about how wide it is.
        'md:grid md:grid-cols-[var(--sidebar-rail)_minmax(0,1fr)]',
        'lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]',
      )}
    >
      <Sidebar pathname={pathname} user={user} />

      <div className="flex min-w-0 flex-col">
        <MobileHeader onOpenDrawer={() => setDrawerOpen(true)} />
        <main id="main" className="min-w-0 flex-1 pb-16">
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

function NavLink({
  item,
  pathname,
  onNavigate,
  /** Forces the expanded presentation, for the mobile drawer. */
  expanded = false,
}: {
  item: NavItem
  pathname: string
  onNavigate?: () => void
  expanded?: boolean
}) {
  const { href, label, Icon } = item
  const active = isActive(pathname, href)

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'focus-ring group relative flex items-center rounded-md',
        'transition-[color,background-color] duration-[--duration-fast] ease-[--ease-standard]',
        expanded
          ? 'gap-3 py-2 pl-3.5 pr-3 text-sm'
          : // Rail: a centred column. Expanded: a row. One tree, two shapes.
            'flex-col gap-1 px-1 py-2 text-3xs lg:flex-row lg:gap-3 lg:py-2 lg:pl-3.5 lg:pr-3 lg:text-sm',
        active ? 'font-medium text-fg' : 'font-normal text-fg-muted hover:bg-hover hover:text-fg',
      )}
    >
      {/*
        A rail, not a filled pill.

        The pill is the default every dashboard template ships with, and it
        spends a saturated block of colour on a label the user already knows
        they are looking at. A 2px marker states the position just as
        unambiguously, leaves the accent free for things that need it, and
        reads as a document index rather than a row of tabs.

        Weight carries the state as well as colour does, so the cue survives
        being desaturated. In the rail it runs along the bottom edge instead of
        the left, because a vertical bar beside a 44px-wide centred item reads
        as a border on the item rather than as a position marker.
      */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute rounded-full bg-accent',
          'origin-center transition-transform duration-[--duration-fast] ease-[--ease-standard]',
          expanded
            ? 'inset-y-1.5 left-0 w-0.5'
            : 'inset-x-2 bottom-0 h-0.5 lg:inset-x-auto lg:inset-y-1.5 lg:left-0 lg:h-auto lg:w-0.5',
          active
            ? expanded
              ? 'scale-y-100'
              : 'scale-x-100 lg:scale-x-100 lg:scale-y-100'
            : expanded
              ? 'scale-y-0 group-hover:scale-y-50'
              : 'scale-x-0 group-hover:scale-x-50 lg:scale-y-0 lg:group-hover:scale-y-50',
        )}
      />
      <Icon
        className={cn(
          'size-4.5 shrink-0 transition-colors duration-[--duration-fast]',
          active ? 'text-fg' : 'text-fg-subtle group-hover:text-fg-muted',
        )}
        aria-hidden="true"
      />
      {/*
        In the rail the label is visible but small. It is never `hidden`:
        `display: none` removes it from the accessibility tree too, which would
        leave four unnamed links.
      */}
      <span className={expanded ? undefined : 'leading-none lg:leading-normal'}>{label}</span>
    </Link>
  )
}

function NavList({
  pathname,
  onNavigate,
  expanded = false,
}: {
  pathname: string
  onNavigate?: () => void
  expanded?: boolean
}) {
  return (
    <nav className={cn('flex flex-col', expanded ? 'gap-6' : 'gap-4 lg:gap-6')} aria-label="Main">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          {/*
            The group label is a real heading for the links under it. In the
            rail there is no room for "Workspace" at any legible size, so it is
            visually hidden there and the groups read as one list — which is
            what they look like anyway at that width.
          */}
          <p
            className={cn(
              'eyebrow mb-1.5 px-3.5 text-fg-subtle',
              expanded ? undefined : 'sr-only lg:not-sr-only',
            )}
          >
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink
                  item={item}
                  pathname={pathname}
                  onNavigate={onNavigate}
                  expanded={expanded}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function Sidebar({ pathname, user }: { pathname: string; user: AppShellProps['user'] }) {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface md:flex">
      {/*
        The logo sits on the same rule as the page header opposite it, so the
        two align rather than the brand floating above a taller band.
      */}
      <div className="flex h-[--header-height] shrink-0 items-center justify-center border-b border-line px-3 lg:justify-start lg:px-4">
        <Link
          href="/dashboard"
          aria-label="RoleFit dashboard"
          className="focus-ring rounded-md focus-visible:outline-offset-4"
        >
          {/* Mark alone in the rail; full lockup once there is room for it. */}
          <span className="lg:hidden">
            <LogoMark className="size-6" />
          </span>
          <span className="hidden lg:inline-flex">
            <Logo />
          </span>
        </Link>
      </div>

      {/*
        The primary action leads the column, but as a full-width row rather
        than a heavy slab under the wordmark — it was competing with the logo
        for the first thing the eye landed on, and the logo should win that.

        In the rail it becomes an icon button. A truncated "New opt…" is worse
        than a glyph, and this is the one action in the product a returning
        user is looking for, so it keeps its position either way.
      */}
      <div className="px-2 pt-3 lg:px-3 lg:pt-4">
        <Button size="sm" className="h-9 w-full px-0 lg:justify-start lg:px-3.5" asChild>
          <Link href="/optimize">
            <Sparkles className="size-4" aria-hidden="true" />
            <span className="sr-only lg:not-sr-only">New optimization</span>
          </Link>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 pt-5 lg:px-3 lg:pt-6">
        <NavList pathname={pathname} />
      </div>

      <div className="border-t border-line p-2 lg:p-3">
        <AccountMenu user={user} />
      </div>
    </aside>
  )
}

function MobileHeader({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  return (
    <header className="sticky top-0 z-[--z-header] flex h-[--header-height] items-center justify-between gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur-sm md:hidden">
      <Link
        href="/dashboard"
        aria-label="RoleFit dashboard"
        className="focus-ring rounded-md focus-visible:outline-offset-4"
      >
        <Logo />
      </Link>
      <Button variant="secondary" size="icon" onClick={onOpenDrawer} aria-label="Open menu">
        <Menu className="size-4" aria-hidden="true" />
      </Button>
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
    <div className="fixed inset-0 z-[--z-drawer] md:hidden">
      <button
        type="button"
        className="absolute inset-0 animate-fade-in bg-ink-950/45"
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
        className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] animate-slide-from-left flex-col border-r border-line bg-surface outline-none"
      >
        <div className="flex h-[--header-height] shrink-0 items-center justify-between border-b border-line px-4">
          <Logo />
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close menu">
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="px-3 py-4">
          <Button fullWidth asChild>
            <Link href="/optimize">
              <Sparkles className="size-4" aria-hidden="true" />
              New optimization
            </Link>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          <NavList pathname={pathname} onNavigate={onClose} expanded />
        </div>

        <div className="border-t border-line p-3">
          <AccountMenu user={user} expanded />
        </div>
      </div>
    </div>
  )
}

/* ==========================================================================
   Account
   ========================================================================== */

/**
 * The account menu.
 *
 * This was a `useState` boolean, a document-level `mousedown` listener, an
 * Escape handler and `role="menu"` on a div holding two links — a menu that
 * arrow keys did nothing in, whose items were announced as links rather than
 * menu items, and which did not return focus to its trigger on close. Radix
 * supplies all of that, along with collision-aware placement, which this
 * particular menu needs because it is anchored to the bottom of a full-height
 * column.
 *
 * The theme selector lives inside it. It was previously duplicated into the
 * mobile header and the marketing chrome and absent from the desktop app
 * entirely, so a signed-in user on a laptop had to open Settings to change
 * theme.
 */
function AccountMenu({
  user,
  expanded = false,
}: {
  user: AppShellProps['user']
  expanded?: boolean
}) {
  const router = useRouter()
  const [signingOut, setSigningOut] = React.useState(false)

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account: ${label}`}
          className={cn(
            'focus-ring flex w-full cursor-pointer items-center rounded-lg text-left',
            'transition-colors hover:bg-hover',
            expanded ? 'gap-2.5 px-2 py-2' : 'justify-center px-1 py-2 lg:gap-2.5 lg:px-2',
          )}
        >
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-meta font-semibold text-fg-accent"
            aria-hidden="true"
          >
            {initial}
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-meta font-medium text-fg',
              expanded ? undefined : 'hidden lg:block',
            )}
            aria-hidden="true"
          >
            {label}
          </span>
          <ChevronsUpDown
            className={cn(
              'size-3.5 shrink-0 text-fg-subtle',
              expanded ? undefined : 'hidden lg:block',
            )}
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate text-meta font-medium text-fg">{label}</span>
          <span className="block truncate text-2xs text-fg-subtle">{user.email}</span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="size-4" aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/*
          `onSelect` prevented: changing theme should not close the menu, so
          the user can see the change land and correct it in one visit.
        */}
        <div
          className="flex items-center justify-between gap-2 px-2.5 py-2"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <span className="text-meta text-fg-muted">Theme</span>
          <ThemeToggle />
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={signingOut}
          onSelect={(event) => {
            event.preventDefault()
            void signOut()
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
