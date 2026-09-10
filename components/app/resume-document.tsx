import * as React from 'react'

import type { ResumeProfile } from '@/lib/domain/types'
import { buildLayout, type LayoutBlock } from '@/lib/documents/layout'
import { cn } from '@/lib/utils'

/**
 * On-screen rendering of a resume.
 *
 * Deliberately built from the same `buildLayout` block list the PDF and DOCX
 * renderers consume. Section order, headings and wording are therefore decided
 * in exactly one place, and the preview cannot drift away from the file the
 * user downloads — which is the failure mode that makes a preview worse than
 * useless.
 */

export function ResumeDocument({
  profile,
  title,
  highlighted = false,
  className,
  /** Renders at document proportions for the print/preview page. */
  paper = false,
}: {
  profile: ResumeProfile
  title?: string
  highlighted?: boolean
  className?: string
  paper?: boolean
}) {
  const blocks = buildLayout(profile)

  return (
    <section
      className={cn(
        'overflow-hidden border bg-surface',
        // The paper variant is a sheet of A4, not a UI panel: square-ish
        // corners and a real shadow, because it is standing in for a physical
        // object. Everywhere else in this product a shadow would be
        // decoration; here it is the thing that says "document".
        paper ? 'rounded-sm shadow-lg' : 'rounded-xl',
        highlighted ? 'border-success-line' : 'border-line',
        className,
      )}
      aria-label={title ?? 'Resume'}
    >
      {title ? (
        <header className="no-print border-b border-line px-4 py-2.5">
          <h2 className="eyebrow text-fg-subtle">{title}</h2>
        </header>
      ) : null}

      {/*
        The compact variant scrolls, so it must be reachable by keyboard —
        a scroll container that only responds to a mouse wheel strands anyone
        navigating with a keyboard or switch device. `paper` does not scroll,
        so it stays out of the tab order.
      */}
      <div
        data-testid="resume-body"
        {...(paper
          ? {}
          : { tabIndex: 0, role: 'group', 'aria-label': `${title ?? 'Resume'} content` })}
        className={cn(
          'print-sheet',
          paper
            ? 'mx-auto max-w-[52rem] px-8 py-10 sm:px-12 sm:py-14'
            : 'max-h-[32rem] overflow-y-auto px-5 py-5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
        )}
      >
        {blocks.map((block, index) => (
          <Block key={index} block={block} paper={paper} />
        ))}

        {blocks.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-subtle">
            This resume has no readable content.
          </p>
        ) : null}
      </div>
    </section>
  )
}

function Block({ block, paper }: { block: LayoutBlock; paper: boolean }) {
  switch (block.kind) {
    case 'name':
      return (
        <h1 className={cn('font-bold tracking-tight text-fg', paper ? 'text-3xl' : 'text-xl')}>
          {block.text}
        </h1>
      )

    case 'contact':
      return (
        <p className={cn('mt-1.5 text-fg-muted', paper ? 'text-sm' : 'text-xs')}>
          {block.parts.join('  ·  ')}
        </p>
      )

    case 'sectionHeading':
      return (
        <h2
          className={cn(
            'mt-6 border-b border-line pb-1 font-semibold uppercase tracking-wider text-fg',
            paper ? 'text-sm' : 'text-xs',
          )}
        >
          {block.text}
        </h2>
      )

    case 'paragraph':
      return (
        <p className={cn('mt-2 leading-relaxed text-fg', paper ? 'text-sm' : 'text-xs')}>
          {block.text}
        </p>
      )

    case 'entryHeader':
      return (
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3">
          <p className={cn('font-semibold text-fg', paper ? 'text-sm' : 'text-xs')}>
            {block.primary}
            {block.secondary ? (
              <span className="font-normal text-fg-muted"> — {block.secondary}</span>
            ) : null}
          </p>
          {block.trailing ? (
            <p className={cn('shrink-0 text-fg-subtle', paper ? 'text-sm' : 'text-xs')}>
              {block.trailing}
            </p>
          ) : null}
        </div>
      )

    case 'entrySubheader':
      return <p className={cn('text-fg-subtle', paper ? 'text-sm' : 'text-xs')}>{block.text}</p>

    case 'bullet':
      return (
        <div className={cn('mt-1 flex gap-2 leading-relaxed', paper ? 'text-sm' : 'text-xs')}>
          <span className="text-fg-subtle" aria-hidden="true">
            –
          </span>
          <span className="text-fg">{block.text}</span>
        </div>
      )

    case 'labelledList':
      return (
        <p className={cn('mt-1.5 leading-relaxed text-fg', paper ? 'text-sm' : 'text-xs')}>
          {block.label ? <span className="font-semibold">{block.label}: </span> : null}
          {block.items.join(', ')}
        </p>
      )

    case 'spacer':
      return <div className="h-2" aria-hidden="true" />
  }
}
