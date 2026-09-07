import * as React from 'react'

import { Alert } from '@/components/ui/feedback'

/**
 * Shared layout for policy pages.
 *
 * Kept narrow (about 68 characters of measure) because these are the pages
 * people actually read end to end, and long lines are what stops them.
 */

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  /** A short honesty note shown at the top. */
  updated: string
  children: React.ReactNode
}) {
  return (
    <div className="container-page py-16 lg:py-20">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">{title}</h1>

        <Alert tone="warning" className="mt-6">
          {updated}
        </Alert>

        <div className="mt-10 flex flex-col gap-10">{children}</div>
      </div>
    </div>
  )
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
      <div className="mt-3 flex flex-col gap-4 text-sm leading-relaxed text-fg-muted [&_li]:leading-relaxed [&_strong]:font-semibold [&_strong]:text-fg [&_ul]:ml-5 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2">
        {children}
      </div>
    </section>
  )
}
