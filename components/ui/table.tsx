import * as React from 'react'

import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * Data table.
 *
 * The product listed everything — analyses, runs, exports, resumes — as
 * flex rows with the label pushed left and the metadata pushed right. That
 * reflows on a phone, which is why it was chosen, but it costs the one thing a
 * list of records is for: on a wide screen nothing lines up, so you cannot
 * compare the fourth row's score against the first's without reading both.
 *
 * A real table, with two behaviours:
 *
 *   - At `md` and up it is a `<table>`. Columns align, the header is sticky
 *     inside a scroll container, and headers carry `scope="col"` so a screen
 *     reader announces the column when it reads a cell.
 *   - Below `md` each record becomes a stacked block via `<TableCards>`.
 *     Squeezing five columns into 375px produces either a horizontal scrollbar
 *     or four ellipses, and neither is a table anyone can read.
 *
 * The two are separate renders of the same data rather than one grid pretending
 * to be both, because a `<td>` that becomes a block loses its association with
 * its header and a screen reader then reads six unlabelled values.
 */

/* ==========================================================================
   Table
   ========================================================================== */

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  /** Announced to assistive tech; required, since a table needs a name. */
  label: string
  /** Renders the header row sticky within the scroll container. */
  stickyHeader?: boolean
}

/**
 * The scroll container is the element that scrolls, and it is focusable.
 *
 * A container that only responds to a mouse wheel strands anyone on a keyboard
 * or a switch device. `tabIndex={0}` with a group role makes it reachable, and
 * the inset focus ring is used because an outset one would be clipped by the
 * container's own overflow.
 */
export function Table({ label, stickyHeader = false, className, children, ...props }: TableProps) {
  return (
    <div
      className="focus-ring-inset -mx-4 overflow-x-auto sm:mx-0"
      tabIndex={0}
      role="group"
      aria-label={`${label} (scrollable)`}
    >
      <table
        className={cn('w-full min-w-full border-collapse text-left', className)}
        data-sticky={stickyHeader || undefined}
        {...props}
      >
        <caption className="sr-only">{label}</caption>
        {children}
      </table>
    </div>
  )
}

export function TableHead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        'border-b border-line',
        // Sticky only inside the scroll container, and only when asked for.
        '[table[data-sticky]_&]:sticky [table[data-sticky]_&]:top-0 [table[data-sticky]_&]:z-(--z-raised) [table[data-sticky]_&]:bg-surface',
        className,
      )}
      {...props}
    />
  )
}

export interface TableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** Right-aligns the column. Use for every numeric column. */
  numeric?: boolean
  /** Collapses the column to its content width. */
  tight?: boolean
  /** Hides the label visually but keeps it for screen readers (action columns). */
  srOnly?: boolean
}

export function TableHeaderCell({
  numeric = false,
  tight = false,
  srOnly = false,
  className,
  children,
  ...props
}: TableHeaderCellProps) {
  return (
    <th
      scope="col"
      className={cn(
        'eyebrow whitespace-nowrap px-3 py-2.5 align-middle font-medium text-fg-subtle first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5',
        numeric && 'text-right',
        tight && 'w-px',
        className,
      )}
      {...props}
    >
      {srOnly ? <span className="sr-only">{children}</span> : children}
    </th>
  )
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-line', className)} {...props} />
}

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** The row is a navigation target. Adds hover feedback. */
  interactive?: boolean
}

export function TableRow({ interactive = false, className, ...props }: TableRowProps) {
  return (
    <tr
      className={cn(
        'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
        // Row-level hover, not cell-level: the whole record highlights, which
        // is what lets the eye track across a wide row without losing it.
        interactive && 'hover:bg-hover focus-within:bg-hover',
        className,
      )}
      {...props}
    />
  )
}

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean
  tight?: boolean
  /** Marks the cell as the row's label. Renders a `<th scope="row">`. */
  rowHeader?: boolean
}

export function TableCell({
  numeric = false,
  tight = false,
  rowHeader = false,
  className,
  ...props
}: TableCellProps) {
  const Component = rowHeader ? 'th' : 'td'
  return (
    <Component
      {...(rowHeader ? { scope: 'row' as const } : {})}
      className={cn(
        'px-3 py-2.5 align-middle text-meta text-fg-muted first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5',
        rowHeader && 'font-normal text-fg',
        numeric && 'text-right tabular-nums',
        tight && 'w-px whitespace-nowrap',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The cell that makes a row clickable.
 *
 * A stretched link rather than an `onClick` on the `<tr>`: a table row is not
 * a link, so a row handler is invisible to the keyboard, cannot be opened in a
 * new tab, and shows no destination in the status bar. The anchor lives in the
 * row-header cell and covers the row via a positioned overlay, so the whole
 * row is a target while remaining one real link in the accessibility tree.
 */
export function TableRowLink({
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
        'focus-ring-inset relative font-medium text-fg after:absolute after:inset-0 after:content-[""]',
        className,
      )}
    >
      {children}
    </Link>
  )
}

/** A footer note under a table — a count, a disclaimer, a truncation notice. */
export function TableNote({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p
      className={cn('border-t border-line px-4 py-2.5 text-2xs text-fg-subtle sm:px-5', className)}
    >
      {children}
    </p>
  )
}

/* ==========================================================================
   Mobile equivalent
   ========================================================================== */

/**
 * The stacked form of a table, for viewports below `md`.
 *
 * Each record is one bordered block: its label as the heading, its fields as
 * label/value pairs. Every value keeps a visible label, which is the whole
 * point — a table that becomes a grid of bare values on a phone reads as a
 * pile of numbers.
 */
export function TableCards({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <ul className={cn('divide-y divide-line', className)}>{children}</ul>
}

export function TableCard({
  href,
  title,
  meta,
  trailing,
  fields,
}: {
  href?: string
  title: React.ReactNode
  /** A line under the title: a timestamp, a filename. */
  meta?: React.ReactNode
  /** A badge or score on the right of the title row. */
  trailing?: React.ReactNode
  /** Label/value pairs shown beneath. */
  fields?: readonly { label: string; value: React.ReactNode }[]
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-fg">{title}</p>
          {meta ? <p className="mt-0.5 text-2xs text-fg-subtle">{meta}</p> : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
      {fields && fields.length > 0 ? (
        <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
          {fields.map((field) => (
            <div key={field.label} className="flex items-baseline gap-1.5">
              <dt className="text-2xs text-fg-subtle">{field.label}</dt>
              <dd className="text-2xs font-medium tabular-nums text-fg-muted">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  )

  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="focus-ring-inset block px-4 py-3.5 transition-colors hover:bg-hover"
        >
          {body}
        </Link>
      ) : (
        <div className="px-4 py-3.5">{body}</div>
      )}
    </li>
  )
}

/**
 * Switches between the two renders at `md`.
 *
 * A component rather than two `hidden` classes at every call site, so the
 * breakpoint is decided once. Both trees are in the DOM, which is the cost of
 * this approach — acceptable here because these lists are capped at 50 rows
 * and the alternative is measuring the viewport in JavaScript and rendering
 * the wrong one on first paint.
 */
export function ResponsiveTable({
  table,
  cards,
  className,
}: {
  table: React.ReactNode
  cards: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="hidden md:block">{table}</div>
      <div className="md:hidden">{cards}</div>
    </div>
  )
}
