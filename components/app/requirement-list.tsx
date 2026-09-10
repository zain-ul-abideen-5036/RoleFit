import * as React from 'react'

import { cn } from '@/lib/utils'
import { PRODUCT } from '@/lib/constants'
import type { AnalysisReport, RequirementMatch } from '@/lib/domain/types'

import { Badge, MatchBadge } from '@/components/ui/feedback'

/**
 * The requirement list.
 *
 * Every screen that shows requirements used to build its own version of this,
 * and each one wrapped every row in `rounded-lg border border-line bg-canvas`
 * inside a `CardContent` inside a `Card` — three nested borders to state one
 * list. Rows are separated by hairlines here and nothing else, which is what
 * lets twenty of them read as a list rather than as twenty objects.
 *
 * Two things the previous version computed and then threw away are shown:
 * *how* a match was established, and its confidence. The product's whole claim
 * is that the score is explainable, and "Strong match" with nothing behind it
 * is exactly as opaque as the model output it is meant to be an alternative
 * to.
 */

/**
 * How the match was established, in the user's words rather than the
 * engine's. Every one of these is lexical — there is deliberately no
 * embedding-based method, because a match must be able to cite the span that
 * supports it.
 */
const METHOD_COPY: Record<string, string> = {
  exact: 'The posting’s own term appears in your resume',
  alias: 'A known equivalent appears — k8s for Kubernetes, for instance',
  normalized: 'Something on your resume implies it: PostgreSQL evidences SQL',
  related: 'An adjacent skill. Partial credit only, never counted as a match',
  fuzzy: 'Word overlap against free text, with no canonical term to match on',
}

const METHOD_LABEL: Record<string, string> = {
  exact: 'Exact term',
  alias: 'Known alias',
  normalized: 'Implied',
  related: 'Adjacent',
  fuzzy: 'Word overlap',
}

export interface RequirementListProps {
  matches: readonly RequirementMatch[]
  /** Shows the resume span that supports the match. */
  showEvidence?: boolean
  /**
   * Hides the per-row match badge. Use when the section heading already
   * states the status — a list of gaps under a heading that says these are
   * the gaps does not need "Missing / not verified" stamped twenty times.
   */
  hideStatus?: boolean
  /**
   * Advisory nearest-span hints, keyed by requirement. Empty unless an
   * embedding provider is configured.
   */
  suggestions?: AnalysisReport['gapSuggestions']
  className?: string
}

export function RequirementList({
  matches,
  showEvidence = false,
  hideStatus = false,
  suggestions = [],
  className,
}: RequirementListProps) {
  const byRequirement = new Map(suggestions.map((entry) => [entry.requirementId, entry]))

  return (
    <ul className={cn('divide-y divide-line', className)}>
      {matches.map((match) => {
        const suggestion = byRequirement.get(match.requirementId)
        const evidence = showEvidence ? match.evidence[0] : undefined

        return (
          <li key={match.requirementId} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
              <p className="min-w-0 flex-1 measure-wide text-meta leading-relaxed text-fg">
                {match.text}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                {/*
                  Required and Preferred are different weights of the same
                  fact, so only the heavier one is stated. Labelling every
                  preferred item "Preferred" doubled the badge count on the
                  screen to convey the absence of urgency.
                */}
                {match.priority === 'required' ? <Badge tone="neutral">Required</Badge> : null}
                {hideStatus ? null : <MatchBadge status={match.status} />}
              </div>
            </div>

            {/*
              How, and how sure. A single line, on the row, rather than a
              disclosure — it is one clause and hiding it behind a click is
              what made the previous screen feel like a verdict handed down.
            */}
            {match.status !== 'missing' && METHOD_LABEL[match.method] ? (
              <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-2xs text-fg-subtle">
                <span className="font-medium text-fg-muted">{METHOD_LABEL[match.method]}</span>
                <span aria-hidden="true">·</span>
                <span>{METHOD_COPY[match.method]}</span>
              </p>
            ) : null}

            {evidence ? (
              <blockquote className="mt-2 border-l-2 border-line-accent pl-3 text-2xs leading-relaxed text-fg-muted">
                <span className="font-medium text-fg-subtle">From your {evidence.section}: </span>
                {evidence.excerpt}
              </blockquote>
            ) : null}

            {/*
              Deliberately not framed as a match. It is still a gap; this is
              the nearest thing already on the resume, offered so the person
              can decide whether it is the same thing. Only they can.
            */}
            {suggestion ? (
              <div className="mt-2 rounded-md border border-dashed border-line-strong px-3 py-2">
                <p className="text-2xs font-medium text-fg-subtle">
                  Closest thing already on your resume
                </p>
                <blockquote className="mt-1 text-2xs leading-relaxed text-fg-muted">
                  <span className="text-fg-subtle">From your {suggestion.section}: </span>
                  {suggestion.excerpt}
                </blockquote>
                <p className="mt-1.5 text-2xs text-fg-subtle">
                  Not counted as a match. If it is the same thing, say so in your own words —{' '}
                  {PRODUCT.name} will not claim it for you.
                </p>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
