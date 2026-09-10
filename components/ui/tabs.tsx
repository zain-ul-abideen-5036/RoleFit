'use client'

import * as React from 'react'

import * as TabsPrimitive from '@radix-ui/react-tabs'

import { cn } from '@/lib/utils'

/**
 * Tabs.
 *
 * Built on Radix so the roving tabindex, arrow-key navigation and
 * `aria-controls` wiring are correct — a hand-rolled tab strip is almost
 * always a row of buttons that a screen reader announces as six unrelated
 * controls, and that arrow keys do nothing in.
 *
 * Used where a screen had become a column of stacked panels the user had to
 * scroll past to reach the one they wanted: History was three cards deep,
 * Analysis was six. Tabs are the right structure when the sections are
 * alternatives rather than a sequence.
 *
 * The style is an underline, not a segmented pill. A pill row reads as a
 * filter control; an underline reads as page-level navigation, which is what
 * these are — and it survives a count badge next to the label without the
 * pill growing lumpy.
 */

export const Tabs = TabsPrimitive.Root

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        // Scrolls rather than wraps: a tab row that reflows to two lines
        // stops reading as one control. `-mb-px` sets the active underline
        // onto the container's bottom rule instead of above it.
        '-mb-px flex items-center gap-1 overflow-x-auto',
        // The scrollbar itself is noise on a six-item row that only sometimes
        // overflows. The row still scrolls; it just does not reserve a gutter.
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({
  className,
  children,
  count,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
  /** A count beside the label, e.g. the number of gaps in that tab. */
  count?: number
}) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'focus-ring group relative inline-flex shrink-0 cursor-pointer items-center gap-2',
        'rounded-t-md border-b-2 border-transparent px-3 pb-2.5 pt-1.5 text-meta font-medium',
        'text-fg-subtle transition-colors duration-[--duration-fast] ease-[--ease-standard]',
        'hover:text-fg',
        'data-[state=active]:border-accent data-[state=active]:text-fg',
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined ? (
        /*
          The count is inside the trigger's accessible name on purpose: "Gaps
          17" is what a screen reader should say, because the number is the
          reason someone picks that tab.
        */
        <span
          className={cn(
            'rounded-sm px-1.5 py-0.5 text-2xs tabular-nums',
            'bg-sunken text-fg-subtle transition-colors',
            'group-data-[state=active]:bg-accent-subtle group-data-[state=active]:text-fg-accent',
          )}
        >
          {count}
        </span>
      ) : null}
    </TabsPrimitive.Trigger>
  )
}

export function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('focus-ring mt-5 outline-none data-[state=active]:animate-enter', className)}
      {...props}
    />
  )
}
