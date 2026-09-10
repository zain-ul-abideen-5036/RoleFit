import * as React from 'react'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Page composition primitives.
 *
 * These decide where a screen's title sits, how wide its content runs, and how
 * a section is bounded. Previously each page decided all three for itself,
 * which is why `max-w-6xl`, `max-w-3xl` and an 80rem marketing container were
 * all in play at once and the product's left edge moved as you navigated it.
 *
 * Deliberately a server component with no `'use client'`. The two of these
 * that already existed lived inside `app-shell.tsx`, which is a client
 * component — so every server page that wanted a page title pulled a client
 * boundary in with it and shipped the whole shell's JavaScript to render a
 * heading.
 */

/* ==========================================================================
   Header
   ========================================================================== */

export interface Breadcrumb {
  href: string
  label: string
}

export interface PageHeaderProps {
  title: string
  description?: string
  /** Right-aligned controls: the screen's primary and secondary actions. */
  actions?: React.ReactNode
  /** Trail above the title. The last entry is the current page and is not a link. */
  breadcrumbs?: readonly Breadcrumb[]
  /** A status badge or score sitting inline with the title. */
  meta?: React.ReactNode
  /** Tabs or a filter bar, rendered on the header's bottom rule. */
  nav?: React.ReactNode
  /** Set when the title is long-form content rather than a short label. */
  className?: string
}

/**
 * The header band at the top of every app screen.
 *
 * One band, on the surface colour, closed by a hairline — so the page's
 * identity and its controls are visually separated from its content without a
 * card around either. The `nav` slot sits *on* the closing rule rather than
 * below it, which is what makes a tab row read as belonging to the page rather
 * than as the first piece of content in it.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  meta,
  nav,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('border-b border-line bg-surface', className)}>
      <div className={cn('container-app', nav ? 'pt-5' : 'py-5')}>
        {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} /> : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/*
                `truncate` is wrong here and `break-words` is right: these
                titles are job descriptions and resume filenames, and a
                truncated job title is a title the user cannot read. It wraps.
              */}
              <h1 className="min-w-0 break-words text-display-xs font-semibold text-fg sm:text-display-sm">
                {title}
              </h1>
              {meta}
            </div>
            {description ? (
              <p className="mt-1.5 measure text-sm leading-relaxed text-fg-muted">{description}</p>
            ) : null}
          </div>

          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              {actions}
            </div>
          ) : null}
        </div>

        {nav ? <div className="mt-4">{nav}</div> : null}
      </div>
    </header>
  )
}

/**
 * Breadcrumb trail.
 *
 * An ordered list, so the hierarchy reaches a screen reader without depending
 * on the chevrons — which are decorative and hidden. The current page is the
 * last item and is plain text carrying `aria-current`, not a link to itself.
 */
function Breadcrumbs({ items }: { items: readonly Breadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2.5">
      <ol className="flex flex-wrap items-center gap-1 text-meta text-fg-subtle">
        {items.map((item, index) => {
          const last = index === items.length - 1
          return (
            <li key={item.href} className="flex items-center gap-1">
              {index > 0 ? (
                <ChevronRight className="size-3.5 shrink-0 text-fg-disabled" aria-hidden="true" />
              ) : null}
              {last ? (
                <span aria-current="page" className="text-fg-muted">
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="focus-ring rounded transition-colors hover:text-fg"
                >
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/* ==========================================================================
   Body
   ========================================================================== */

export interface PageBodyProps {
  children: React.ReactNode
  className?: string
  /**
   * `content` is the working width of an app screen. `prose` narrows to a
   * readable measure for screens that are mostly running text — Settings, a
   * policy page — because a two-column definition list at 78rem strands its
   * values a hand's width from their labels.
   */
  width?: 'content' | 'prose'
}

export function PageBody({ children, className, width = 'content' }: PageBodyProps) {
  return (
    <div
      className={cn(
        'container-app py-6 sm:py-8',
        // One entrance, on the container, rather than a stagger across every
        // child. Staggered lists look considered in a demo and feel slow on
        // the fourth visit, because the user is waiting on content they
        // already know the shape of. 280ms once, then the page is simply
        // there. Disabled wholesale by the reduced-motion block in globals.
        'animate-enter',
        className,
      )}
    >
      {/*
        The narrow variant is an inner box, not a narrower container.
        `container-app` centres itself, so applying `max-w-3xl` to it centred
        the body inside the content area while the page header above stayed at
        full width — the two then disagreed about where the page's left edge
        was by 200px, which is exactly the kind of misalignment that reads as
        carelessness even when nobody can name it.
      */}
      {width === 'prose' ? <div className="max-w-3xl">{children}</div> : children}
    </div>
  )
}

/**
 * Vertical rhythm for a stack of sections.
 *
 * One place that decides how far apart two sections sit, instead of a
 * `flex flex-col gap-6` repeated on every page with a different number.
 */
export function Stack({
  children,
  gap = 'lg',
  className,
  as: Component = 'div',
}: {
  children: React.ReactNode
  gap?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  as?: 'div' | 'section' | 'ul' | 'ol'
}) {
  const gaps = { sm: 'gap-3', md: 'gap-5', lg: 'gap-8', xl: 'gap-12' } as const
  return (
    <Component className={cn('flex min-w-0 flex-col', gaps[gap], className)}>{children}</Component>
  )
}

/* ==========================================================================
   Section
   ========================================================================== */

export interface SectionProps {
  children: React.ReactNode
  /** Rendered as the section's accessible heading. */
  title?: string
  description?: string
  /** Controls on the heading's baseline: a filter, a "view all" link. */
  actions?: React.ReactNode
  /** Heading level. Sections inside an `h1` page default to `h2`. */
  as?: 'h2' | 'h3'
  className?: string
  /** Removes the hairline under the heading, for a section that opens a panel. */
  bare?: boolean
}

/**
 * A section boundary: a label, a rule, and at most one action.
 *
 * The alternative — and what most of this product used to do — is to wrap
 * every grouping in a card. A card around a list of links adds a border, a
 * shadow and 24px of padding to state a grouping that a heading and a hairline
 * already state, and once every section on a page is a card the page has no
 * emphasis left to spend on the one thing that matters.
 */
export function Section({
  children,
  title,
  description,
  actions,
  as: Heading = 'h2',
  className,
  bare = false,
}: SectionProps) {
  return (
    <section className={cn('min-w-0', className)}>
      {title ? (
        <div
          className={cn(
            'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5',
            !bare && 'border-b border-line pb-2.5',
          )}
        >
          <div className="min-w-0">
            <Heading className="text-title font-semibold text-fg">{title}</Heading>
            {description ? (
              <p className="mt-1 measure text-meta leading-relaxed text-fg-muted">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn(title && 'mt-4')}>{children}</div>
    </section>
  )
}

/**
 * A link that closes a section heading, e.g. "View all".
 *
 * Its own component because it was written out inline four times with three
 * different colours and two different hover behaviours.
 */
export function SectionLink({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'focus-ring inline-flex items-center gap-1 rounded text-meta font-medium text-fg-accent',
        'transition-colors hover:text-fg',
        className,
      )}
    >
      {children}
      <ChevronRight className="size-3.5" aria-hidden="true" />
    </Link>
  )
}

/* ==========================================================================
   Toolbar
   ========================================================================== */

/**
 * A horizontal band of controls above a data set: filters on the left,
 * actions on the right, wrapping to two rows rather than scrolling on a phone.
 */
export function Toolbar({
  children,
  actions,
  className,
}: {
  children?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/* ==========================================================================
   Panel
   ========================================================================== */

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Hairline only, no shadow. The product's default discrete surface. */
  tone?: 'default' | 'sunken' | 'success' | 'warning' | 'danger' | 'accent'
  /** Removes the internal padding, for a panel whose child is a table or list. */
  flush?: boolean
}

const PANEL_TONES = {
  default: 'border-line bg-surface',
  sunken: 'border-line bg-sunken',
  success: 'border-success-line bg-success-bg',
  warning: 'border-warning-line bg-warning-bg',
  danger: 'border-danger-line bg-danger-bg',
  accent: 'border-line-accent bg-accent-subtle',
} as const

/**
 * A flat, bounded surface.
 *
 * The difference between this and `Card` is that a panel does not float: no
 * shadow, no hover lift, no interactive affordance. It is the right container
 * for a region of a screen, where `Card` is the right container for a discrete
 * object in a list of them.
 *
 * Having both matters because the failure mode here was one component used for
 * both jobs, so a settings section and a resume in a grid had the same
 * elevation and the same rounded corners, and neither read as more or less
 * substantial than the other.
 */
export function Panel({ tone = 'default', flush = false, className, ...props }: PanelProps) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-xl border',
        PANEL_TONES[tone],
        !flush && 'p-4 sm:p-5',
        className,
      )}
      {...props}
    />
  )
}

/**
 * A panel's own heading row, closed by a rule.
 *
 * Only for a `flush` panel — one with a table or list under it. A padded panel
 * should use `Section` and skip the internal header entirely, because a
 * heading inside a bordered box inside a page that already has a heading is
 * the nested-container problem in miniature.
 */
export function PanelHeader({
  title,
  description,
  actions,
  as: Heading = 'h2',
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  as?: 'h2' | 'h3'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3 sm:px-5',
        className,
      )}
    >
      <div className="min-w-0">
        <Heading className="text-body-lg font-semibold text-fg">{title}</Heading>
        {description ? (
          <p className="mt-1 measure text-meta leading-relaxed text-fg-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/* ==========================================================================
   Description list
   ========================================================================== */

/**
 * A label/value pair grid.
 *
 * Settings and the resume metadata both hand-rolled this, and both ended up
 * with the label and value on opposite edges of a wide container — which at
 * 1400px puts an eye-travel of 30cm between "Email" and the address. Two
 * columns, the value column starting where the longest label ends.
 */
export function DescriptionList({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <dl className={cn('divide-y divide-line', className)}>{children}</dl>
}

export function DescriptionRow({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4">
      <dt className="text-meta text-fg-muted sm:pt-px">
        {label}
        {hint ? <span className="mt-0.5 block text-2xs text-fg-subtle">{hint}</span> : null}
      </dt>
      <dd className="min-w-0 text-sm text-fg">{children}</dd>
    </div>
  )
}
