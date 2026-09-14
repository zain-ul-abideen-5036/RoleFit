'use client'

import * as React from 'react'

import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { cn } from '@/lib/utils'

/**
 * Alert dialog.
 *
 * Radix handles what a hand-rolled modal reliably gets wrong: the focus trap,
 * restoring focus to the trigger on close, `aria-modal` plus labelled
 * title/description, inert background content, and scroll locking that does
 * not shift the layout when the scrollbar disappears.
 *
 * An *alert* dialog specifically, and it is the only one here. An alert dialog
 * cannot be dismissed by clicking the backdrop and puts initial focus on the
 * safe action; a plain dialog is dismissible and is for content. The product
 * has exactly one modal interaction — confirming account deletion — and using
 * a dismissible dialog for it is how someone deletes an account by pressing
 * Escape at the wrong moment.
 *
 * The dismissible variant is deliberately absent rather than written and left
 * unused. A component with no call site is a component nobody has checked
 * against a real screen.
 */

/* ==========================================================================
   Shared surfaces
   ========================================================================== */

const overlayClasses = [
  'fixed inset-0 z-(--z-overlay) bg-ink-950/50',
  // Paired open/close, and the exit is faster: the user has already decided.
  'data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out',
].join(' ')

const contentClasses = [
  'fixed left-1/2 top-1/2 z-(--z-overlay) w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2',
  'rounded-xl border border-line bg-overlay shadow-xl',
  // A dialog genuinely floats, so it is one of the few surfaces that earns a
  // shadow in this system.
  'data-[state=open]:animate-panel-in data-[state=closed]:animate-panel-out',
  // Tall content scrolls inside the dialog rather than growing past the
  // viewport, which on a phone puts the confirm button off screen.
  'max-h-[calc(100dvh-2rem)] overflow-y-auto',
].join(' ')

/* ==========================================================================
   Alert dialog
   ========================================================================== */

export const AlertDialog = AlertDialogPrimitive.Root
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger
export const AlertDialogCancel = AlertDialogPrimitive.Cancel
export const AlertDialogAction = AlertDialogPrimitive.Action

export function AlertDialogContent({
  className,
  children,
  title,
  description,
  tone = 'default',
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> & {
  title: string
  description?: string
  /** `danger` tints the title, for a destructive confirmation. */
  tone?: 'default' | 'danger'
}) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className={overlayClasses} />
      <AlertDialogPrimitive.Content
        className={cn(contentClasses, 'max-w-md', className)}
        {...props}
      >
        <div className="px-5 pt-5">
          <AlertDialogPrimitive.Title
            className={cn(
              'text-body-lg font-semibold',
              tone === 'danger' ? 'text-danger-fg' : 'text-fg',
            )}
          >
            {title}
          </AlertDialogPrimitive.Title>
          {description ? (
            <AlertDialogPrimitive.Description className="mt-1.5 text-meta leading-relaxed text-fg-muted">
              {description}
            </AlertDialogPrimitive.Description>
          ) : null}
        </div>
        <div className="px-5 pb-5">{children}</div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  )
}

export function AlertDialogFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}>
      {children}
    </div>
  )
}
