'use client'

import * as React from 'react'

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { cn } from '@/lib/utils'

/**
 * Dropdown menu and tooltip.
 *
 * Both were hand-rolled or absent. The account menu in particular was a
 * `useState` boolean, a `mousedown` listener on the document, an Escape
 * handler, and `role="menu"` applied to a div holding two links — which is a
 * menu that arrow keys do nothing in, that does not return focus to its
 * trigger, that has no typeahead, and whose items are announced as links
 * inside a menu rather than as menu items.
 *
 * Radix supplies all of that, plus collision-aware positioning, which matters
 * for a menu anchored to the bottom of a sidebar on a short viewport.
 */

/* ==========================================================================
   Dropdown menu
   ========================================================================== */

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-[--z-popover] min-w-52 overflow-hidden rounded-lg border border-line bg-overlay p-1 shadow-lg',
          // Radix reports which edge it landed on, so the entrance can travel
          // from the trigger rather than always from the top. A menu that
          // flipped to open upward but still animated downward reads wrong.
          'data-[state=open]:animate-panel-in data-[state=closed]:animate-overlay-out',
          // Never taller than the space available; scrolls if it must.
          'max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({
  className,
  inset = false,
  tone = 'default',
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  tone?: 'default' | 'danger'
}) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-meta outline-none',
        'transition-colors duration-[--duration-instant]',
        // `data-highlighted` covers pointer hover and keyboard focus with one
        // state, which is what keeps the two from looking different.
        tone === 'danger'
          ? 'text-danger-fg data-[highlighted]:bg-danger-bg'
          : 'text-fg-muted data-[highlighted]:bg-hover data-[highlighted]:text-fg',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>) {
  return <DropdownMenuPrimitive.Label className={cn('px-2.5 py-1.5', className)} {...props} />
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-line', className)}
      {...props}
    />
  )
}

/* ==========================================================================
   Tooltip
   ========================================================================== */

/**
 * Tooltips carry supplementary detail only, never the only copy of anything.
 *
 * A tooltip is unreachable by touch and invisible to search, so anything the
 * user needs in order to act belongs in the page. What it is good for is the
 * second sentence — what a score dimension actually measures, what an engine
 * name means — kept out of the way until asked for.
 *
 * `delayDuration` is 250ms rather than the default 700: this is a dense
 * interface where the pointer often rests on a data cell, and a long delay
 * makes the tooltip feel broken. `skipDelayDuration` lets a user sweep along a
 * row of them without re-waiting each time.
 */
export function TooltipProvider({
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider delayDuration={250} skipDelayDuration={200} {...props}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          'z-[--z-popover] max-w-64 rounded-md border border-line bg-overlay px-2.5 py-2',
          'text-2xs leading-relaxed text-fg-muted shadow-lg',
          'data-[state=delayed-open]:animate-panel-in data-[state=closed]:animate-overlay-out',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

/**
 * A tooltip on an information affordance.
 *
 * Wrapped up because the pattern is fiddly to get right: the trigger must be a
 * real focusable button so a keyboard user can reach the tooltip at all, and
 * it needs an accessible name of its own — `aria-label` on the button, since
 * the tooltip text is not read as the button's name in every screen-reader
 * pairing.
 */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="focus-ring inline-flex size-4 cursor-help items-center justify-center rounded-full border border-line-strong text-[9px] font-semibold leading-none text-fg-subtle transition-colors hover:border-line-bold hover:text-fg-muted"
        >
          <span aria-hidden="true">i</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  )
}
