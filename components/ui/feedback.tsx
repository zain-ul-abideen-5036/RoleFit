import * as React from 'react'

import { cva, type VariantProps } from 'class-variance-authority'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Minus,
  Plus,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Status, badge and alert primitives.
 *
 * Every status here pairs colour with an icon and a text label. Colour alone
 * never carries meaning — that is a WCAG requirement, and it is also what makes
 * the diff view legible to the roughly one in twelve men with a colour vision
 * deficiency who will use this product to apply for a job.
 */

/* ------------------------------------------------------------------ badge */

/*
 * `rounded-md`, not `rounded-full`.
 *
 * A fully round pill is the shape every component library ships, and once
 * status, match, change and count badges are all pills, a dense screen becomes
 * a field of lozenges with nothing distinguishing one row from another. A
 * small radius keeps the badge reading as a label attached to its content, and
 * it agrees with the corner language of the surfaces around it.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums',
  {
    variants: {
      tone: {
        neutral: 'border-line-strong bg-sunken text-fg-muted',
        accent: 'border-line-accent bg-accent-subtle text-fg-accent',
        success: 'border-success-line bg-success-bg text-success-fg',
        warning: 'border-warning-line bg-warning-bg text-warning-fg',
        danger: 'border-danger-line bg-danger-bg text-danger-fg',
        info: 'border-info-line bg-info-bg text-info-fg',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

/* ------------------------------------------------------------- match status */

const MATCH_PRESENTATION = {
  strong: { tone: 'success' as const, Icon: CheckCircle2, label: 'Strong match' },
  partial: { tone: 'warning' as const, Icon: AlertTriangle, label: 'Partial evidence' },
  missing: { tone: 'danger' as const, Icon: XCircle, label: 'Missing / not verified' },
}

export function MatchBadge({
  status,
  className,
}: {
  status: 'strong' | 'partial' | 'missing'
  className?: string
}) {
  const { tone, Icon, label } = MATCH_PRESENTATION[status]
  return (
    <Badge tone={tone} className={className}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </Badge>
  )
}

/* -------------------------------------------------------------- diff status */

const CHANGE_PRESENTATION = {
  added: {
    Icon: Plus,
    label: 'Added',
    classes: 'border-diff-added-line bg-diff-added-bg text-diff-added-fg',
  },
  modified: {
    Icon: RefreshCw,
    label: 'Rewritten',
    classes: 'border-diff-modified-line bg-diff-modified-bg text-diff-modified-fg',
  },
  removed: {
    Icon: Minus,
    label: 'Removed',
    classes: 'border-diff-removed-line bg-diff-removed-bg text-diff-removed-fg',
  },
  reordered: {
    Icon: RefreshCw,
    label: 'Reordered',
    classes: 'border-diff-reordered-line bg-diff-reordered-bg text-diff-reordered-fg',
  },
}

export function ChangeBadge({
  action,
  className,
}: {
  action: 'added' | 'modified' | 'removed' | 'reordered'
  className?: string
}) {
  const { Icon, label, classes } = CHANGE_PRESENTATION[action]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
        classes,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  )
}

/* ------------------------------------------------------------------ alert */

const alertVariants = cva(
  [
    'flex gap-3 rounded-lg border p-4 text-sm',
    // An alert almost always appears in response to something the user just
    // did, and arriving instantly is indistinguishable from having been there
    // all along — which is how a validation message gets missed.
    'animate-enter',
  ].join(' '),
  {
    variants: {
      tone: {
        info: 'border-line-strong bg-sunken text-fg-muted',
        accent: 'border-line-accent bg-accent-subtle text-fg',
        success: 'border-success-line bg-success-bg text-success-fg',
        warning: 'border-warning-line bg-warning-bg text-warning-fg',
        danger: 'border-danger-line bg-danger-bg text-danger-fg',
      },
    },
    defaultVariants: { tone: 'info' },
  },
)

const ALERT_ICONS = {
  info: Info,
  accent: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: ShieldAlert,
}

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  title?: string
  /** Errors use `role="alert"`; informational notes should not interrupt. */
  live?: boolean
}

export function Alert({ className, tone = 'info', title, live, children, ...props }: AlertProps) {
  const Icon = ALERT_ICONS[tone ?? 'info']

  return (
    <div
      className={cn(alertVariants({ tone }), className)}
      role={live ? 'alert' : undefined}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-current">{title}</p> : null}
        <div className={cn('leading-relaxed', title && 'mt-1')}>{children}</div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- skeleton */

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton', className)} aria-hidden="true" {...props} />
}

/* ------------------------------------------------------------- empty state */

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}

/**
 * Empty state.
 *
 * Deliberately a designed component rather than a bare sentence: an empty
 * dashboard is the first thing a new user sees, and it should tell them what to
 * do next rather than only that there is nothing here.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        // Solid hairline rather than a dashed border on a filled panel: a
        // dashed rectangle reads as a drop zone, which an empty state is not,
        // and the sunken ground says "nothing here yet" without the costume.
        'flex flex-col items-center justify-center rounded-xl border border-line bg-sunken px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-line bg-surface text-fg-subtle">
          {icon}
        </div>
      ) : null}
      <p className="font-display text-[1.0625rem] font-medium text-fg">{title}</p>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-fg-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
