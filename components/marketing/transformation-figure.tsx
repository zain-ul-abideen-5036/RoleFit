import * as React from 'react'

import { Check, Minus } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The hero figure: what the product actually produces.
 *
 * This used to be three panels of grey rounded bars with an arrow between
 * them — the placeholder-lines mock that every product page ships, which says
 * "there is a document involved" and nothing else. It is also the single most
 * recognisable generated-template element there is, precisely because it
 * carries no information: the same figure works for a CRM, a note-taking app
 * or an invoice tool.
 *
 * What replaced it is the product's real output, with real text: four
 * requirements from a posting, matched against evidence, two of them evidenced
 * and quoted, two of them reported as gaps and explicitly *not* written in.
 * That is the entire proposition in one panel, and it cannot be mistaken for
 * any other product's hero.
 *
 * Static markup, no image, no animation. It reads in both themes, scales with
 * the user's font size, and costs one paint.
 */

interface Row {
  requirement: string
  status: 'strong' | 'missing'
  /** The resume span the match rests on. Present only for a match. */
  evidence?: string
  /** Why nothing was written. Present only for a gap. */
  note?: string
}

const ROWS: Row[] = [
  {
    requirement: 'Strong SQL and PostgreSQL',
    status: 'strong',
    evidence: 'Migrated the reporting database to PostgreSQL, cutting query times by 35%',
  },
  {
    requirement: 'Containerised deployment',
    status: 'strong',
    evidence: 'Managed the deployment pipeline across three services using Docker',
  },
  {
    requirement: 'AWS Lambda',
    status: 'missing',
    note: 'No evidence on your resume, so it was not added',
  },
  {
    requirement: 'Kubernetes',
    status: 'missing',
    note: 'No evidence on your resume, so it was not added',
  },
]

export function TransformationFigure({ className }: { className?: string }) {
  return (
    <figure className={cn('w-full min-w-0', className)}>
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        {/* ------------------------------------------------------- header */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="eyebrow text-fg-subtle">Requirement match</p>
            <p className="mt-0.5 truncate text-meta font-semibold text-fg">
              Backend Engineer · Meridian Data
            </p>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-display-xs font-semibold tabular-nums text-fg">74</span>
            <span className="text-2xs font-medium text-fg-subtle">readiness</span>
          </div>
        </div>

        {/* --------------------------------------------------------- rows */}
        <ul className="divide-y divide-line">
          {ROWS.map((row) => {
            const matched = row.status === 'strong'
            return (
              <li key={row.requirement} className="flex gap-3 px-4 py-3">
                {/*
                  Icon and label both. The tick and the dash are the fast
                  channel; "Evidenced" and "Not added" are the channel that
                  survives a colour vision deficiency, and this figure is
                  making an argument about honesty, so it had better be
                  readable by everyone.
                */}
                <span
                  className={cn(
                    'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
                    matched ? 'bg-success-bg text-success-solid' : 'bg-danger-bg text-danger-solid',
                  )}
                  aria-hidden="true"
                >
                  {matched ? <Check className="size-2.5" /> : <Minus className="size-2.5" />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="min-w-0 text-meta font-medium text-fg">{row.requirement}</p>
                    <p
                      className={cn(
                        'shrink-0 text-2xs font-medium',
                        matched ? 'text-success-fg' : 'text-danger-fg',
                      )}
                    >
                      {matched ? 'Evidenced' : 'Not added'}
                    </p>
                  </div>

                  {/*
                    A left rule, not a quote glyph. The glyph was set at 10px
                    to sit with the text and at that size it reads as a
                    smudge — and the product already marks quoted resume text
                    with an accent rule everywhere else, so this now matches.
                  */}
                  {row.evidence ? (
                    <p className="mt-1.5 border-l-2 border-line-accent pl-2.5 text-2xs leading-relaxed text-fg-muted">
                      {row.evidence}
                    </p>
                  ) : null}

                  {row.note ? (
                    <p className="mt-1 text-2xs leading-relaxed text-fg-subtle">{row.note}</p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>

        {/* ------------------------------------------------------- footer */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line bg-sunken px-4 py-2.5">
          <p className="text-2xs text-fg-muted">
            <span className="font-medium text-fg">2 of 4</span> requirements evidenced
          </p>
          <p className="text-2xs font-medium text-success-fg">Nothing invented</p>
        </div>
      </div>

      <figcaption className="mt-3 measure text-2xs leading-relaxed text-fg-subtle">
        An example readout. Requirements you can evidence are strengthened using your own words; the
        rest are reported as gaps and left off the resume.
      </figcaption>
    </figure>
  )
}
