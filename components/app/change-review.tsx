'use client'

import * as React from 'react'

import { useRouter } from 'next/navigation'
import { Check, Download, FileText, Info, Pencil, RotateCcw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel, Textarea } from '@/components/ui/field'
import { Alert, Badge, ChangeBadge, EmptyState } from '@/components/ui/feedback'
import { Panel, PanelHeader, Section, Stack, Toolbar } from '@/components/ui/layout'
import { ScoreDelta, ScoreDisclaimer } from '@/components/ui/score'
import { apiPatch, apiPost, toDisplayError } from '@/lib/client/api'
import { cn, pluralize } from '@/lib/utils'

/**
 * Change review.
 *
 * The screen where the product's "no silent changes" promise is kept. Every
 * proposed rewrite is shown with its original alongside, the reason for it, and
 * the source text that justifies it. Nothing is applied that the user has not
 * accepted, and every decision is reversible until they export.
 *
 * The screen is built as a *review queue* rather than a page of cards. The
 * distinction that matters: the summary and export controls stick to the top of
 * the viewport, and the list can be filtered by decision. On a run with
 * eighteen changes the previous layout meant scrolling to the top of the page
 * to find out how many were left, and there was no way to see only the ones
 * still awaiting a decision — so the way to use it was to scroll the whole list
 * looking for amber badges.
 */

export type Decision = 'pending' | 'accepted' | 'rejected' | 'edited'

export interface ReviewChange {
  id: string
  targetPath: string
  section: string
  action: 'added' | 'modified' | 'removed' | 'reordered'
  before: string | null
  after: string | null
  rationale: string
  evidence: string[]
  decision: Decision
  editedText: string | null
}

export interface UnaddressedRequirement {
  requirementId: string
  text: string
  reason: string
}

/**
 * What to say when the run produced nothing.
 *
 * There are two entirely different reasons for an empty result and they need
 * different words. The screen used to give the congratulatory one unconditionally
 * — "your resume already reads clearly for this role" — under a green tick, next
 * to a score of 36 and a list of requirements it had just declined to address.
 * That is not a reassurance, it is a contradiction, and it leaves the reader
 * assuming the feature is broken.
 *
 * The rule-based engine aligns terminology, removes filler and reorders. A
 * resume with none of those problems yields nothing from it, no matter how
 * poorly it matches the role — because closing that gap would mean writing
 * experience the resume does not evidence, which is the one thing this product
 * will not do.
 */
function describeNoChanges(args: {
  canRewriteProse: boolean
  baselineScore: number
  unaddressedCount: number
}): { title: string; description: string; goodNews: boolean } {
  const { canRewriteProse, baselineScore, unaddressedCount } = args

  if (!canRewriteProse) {
    return {
      goodNews: false,
      title: 'The rule-based engine found nothing it could change',
      description:
        unaddressedCount > 0
          ? `It aligns terminology, removes filler and reorders for relevance, and your resume had none of those problems. It does not rewrite sentences, so it cannot act on the ${unaddressedCount} ${pluralize(unaddressedCount, 'requirement')} below. Configure an AI provider for sentence-level rewriting.`
          : 'It aligns terminology, removes filler and reorders for relevance, and your resume had none of those problems. It does not rewrite sentences — configure an AI provider for that.',
    }
  }

  // A genuinely strong match with nothing left to do is the one case where an
  // empty result is good news.
  if (baselineScore >= 75 && unaddressedCount === 0) {
    return {
      goodNews: true,
      title: 'No changes were needed',
      description:
        'Your resume already reads clearly for this role, and every rewrite the engine considered was either unnecessary or could not be supported by your source text.',
    }
  }

  return {
    goodNews: false,
    title: 'No changes were proposed',
    description:
      unaddressedCount > 0
        ? `Every rewrite the engine considered would have needed source text your resume does not contain. The ${unaddressedCount} ${pluralize(unaddressedCount, 'requirement')} below are the gap, and closing it means adding real experience rather than rewording.`
        : 'Every rewrite the engine considered was either unnecessary or could not be supported by your source text.',
  }
}

export interface ChangeReviewProps {
  runId: string
  resumeId: string
  changes: ReviewChange[]
  unaddressed: UnaddressedRequirement[]
  baselineScore: number
  projectedScore: number
  provider: string
  /** False for the rule-based engine, which does not rewrite prose. */
  canRewriteProse: boolean
}

interface DocumentResponse {
  document: { id: string; filename: string; downloadUrl: string }
  warnings: string[]
}

type Filter = 'all' | 'pending' | 'accepted' | 'rejected'

export function ChangeReview({
  runId,
  resumeId,
  changes: initialChanges,
  unaddressed,
  baselineScore,
  projectedScore,
  provider,
  canRewriteProse,
}: ChangeReviewProps) {
  const router = useRouter()
  const [changes, setChanges] = React.useState(initialChanges)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [exporting, setExporting] = React.useState<'pdf' | 'docx' | null>(null)
  const [warnings, setWarnings] = React.useState<string[]>([])
  const [filter, setFilter] = React.useState<Filter>('all')

  const pending = changes.filter((change) => change.decision === 'pending')
  const accepted = changes.filter(
    (change) => change.decision === 'accepted' || change.decision === 'edited',
  )
  const rejected = changes.filter((change) => change.decision === 'rejected')

  const visible = changes.filter((change) => {
    if (filter === 'all') return true
    if (filter === 'pending') return change.decision === 'pending'
    if (filter === 'rejected') return change.decision === 'rejected'
    return change.decision === 'accepted' || change.decision === 'edited'
  })

  const noChanges = describeNoChanges({
    canRewriteProse,
    baselineScore,
    unaddressedCount: unaddressed.length,
  })

  async function decide(id: string, decision: Decision, editedText?: string): Promise<void> {
    setBusyId(id)
    setError(null)

    // Optimistic: the control should respond immediately, and the request is
    // small enough that a failure can simply roll the row back.
    const previous = changes
    setChanges((current) =>
      current.map((change) =>
        change.id === id
          ? { ...change, decision, editedText: editedText ?? change.editedText }
          : change,
      ),
    )

    try {
      await apiPatch(`/api/changes/${id}`, {
        decision,
        editedText: decision === 'edited' ? (editedText ?? null) : null,
      })
      router.refresh()
    } catch (caught) {
      setChanges(previous)
      setError(toDisplayError(caught).message)
    } finally {
      setBusyId(null)
    }
  }

  async function decideAll(decision: 'accepted' | 'rejected'): Promise<void> {
    setError(null)
    for (const change of changes.filter((entry) => entry.decision === 'pending')) {
      await decide(change.id, decision)
    }
  }

  async function exportDocument(format: 'pdf' | 'docx'): Promise<void> {
    setExporting(format)
    setError(null)
    setWarnings([])

    try {
      const result = await apiPost<DocumentResponse>('/api/documents', { runId, format })
      setWarnings(result.warnings)
      // Navigating rather than fetching lets the browser handle the download,
      // including the Content-Disposition filename.
      window.location.href = result.document.downloadUrl
    } catch (caught) {
      setError(toDisplayError(caught).message)
    } finally {
      setExporting(null)
    }
  }

  return (
    <Stack gap="lg">
      {error ? (
        <Alert tone="danger" live title="Something went wrong">
          {error}
        </Alert>
      ) : null}

      {warnings.length > 0 ? (
        <Alert tone="warning" title="Your document was generated with warnings">
          <ul className="ml-4 list-disc">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {/* ------------------------------------------------------ summary */}
      {/*
        Sticky.

        The projected score and the export buttons are the two things a
        reviewer refers back to constantly — the score because it moves with
        every decision, the buttons because finishing is the point. On a run
        with eighteen changes both were a full page-scroll away from wherever
        the user happened to be working.

        `top` clears the mobile header, which is the only sticky chrome above
        this on a phone.
      */}
      <div className="sticky top-[--header-height] z-[--z-sticky] -mx-4 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 md:top-0 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div>
              <p className="eyebrow text-fg-subtle">Projected ATS readiness</p>
              <ScoreDelta
                from={baselineScore}
                to={projectedScore}
                className="mt-0.5 text-display-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={pending.length > 0 ? 'warning' : 'success'}>
                {accepted.length} of {changes.length} accepted
              </Badge>
              {pending.length > 0 ? (
                <Badge tone="warning">{pending.length} awaiting you</Badge>
              ) : null}
              {rejected.length > 0 ? (
                <Badge tone="neutral">{rejected.length} rejected</Badge>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => void exportDocument('docx')}
              loading={exporting === 'docx'}
              loadingLabel="Preparing…"
              disabled={exporting !== null}
            >
              <FileText className="size-4" aria-hidden="true" />
              Download DOCX
            </Button>
            <Button
              onClick={() => void exportDocument('pdf')}
              loading={exporting === 'pdf'}
              loadingLabel="Preparing…"
              disabled={exporting !== null}
            >
              <Download className="size-4" aria-hidden="true" />
              Download PDF
            </Button>
          </div>
        </div>
      </div>

      <ScoreDisclaimer className="-mt-4 text-2xs" />

      {!canRewriteProse ? (
        <Alert tone="info">
          {/*
            The engine is named once on this screen, in the footer. Naming it
            here as well meant the same string appeared twice with no
            additional information — and "which engine ran" is a fact, so it
            belongs with the other facts rather than inside a paragraph
            explaining the consequence.
          */}
          This run used the rule-based engine, which aligns terminology, removes filler and reorders
          for relevance, but does not rewrite prose. Configure an AI provider for sentence-level
          rewriting.
        </Alert>
      ) : null}

      {/* ------------------------------------------------------ changes */}
      <Section
        title="Proposed changes"
        description="Substantive rewrites wait for your decision. Minor tidy-ups — a reorder, a single-word swap — start accepted so you are not clicking through trivia, and every one can be undone."
      >
        {changes.length === 0 ? (
          <EmptyState
            icon={noChanges.goodNews ? <Check className="size-5" /> : <Info className="size-5" />}
            title={noChanges.title}
            description={noChanges.description}
          />
        ) : (
          <Stack gap="md">
            <Toolbar
              actions={
                pending.length > 0 ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void decideAll('rejected')}
                    >
                      Reject all pending
                    </Button>
                    <Button size="sm" onClick={() => void decideAll('accepted')}>
                      Accept all pending
                    </Button>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-meta text-success-fg">
                    <Check className="size-4" aria-hidden="true" />
                    Every change has a decision
                  </span>
                )
              }
            >
              {/*
                Filter by decision.

                A radiogroup rather than a row of buttons: these are mutually
                exclusive views of one list, and arrow keys should move between
                them. The counts are in the labels because "Pending 4" is the
                reason to press it.
              */}
              <div
                role="radiogroup"
                aria-label="Filter changes by decision"
                className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-sunken p-0.5"
              >
                {(
                  [
                    ['all', 'All', changes.length],
                    ['pending', 'To review', pending.length],
                    ['accepted', 'Applied', accepted.length],
                    ['rejected', 'Rejected', rejected.length],
                  ] as const
                ).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={filter === value}
                    onClick={() => setFilter(value)}
                    className={cn(
                      'focus-ring cursor-pointer rounded-md px-2.5 py-1 text-2xs font-medium',
                      'transition-colors duration-[--duration-fast]',
                      filter === value
                        ? 'bg-surface text-fg shadow-xs'
                        : 'text-fg-subtle hover:text-fg',
                    )}
                  >
                    {/*
                      "To review" and "Applied" rather than "Pending" and
                      "Accepted".

                      A filter chip reading "Accepted" sits inches from a row
                      badge reading "Accepted" and means something different:
                      one is a view, the other is a state. "Applied" is also
                      the more accurate word, because this view holds both the
                      accepted changes and the ones the user rewrote
                      themselves — everything that ends up in the document.
                    */}
                    <span>{label}</span>
                    <span className="ml-1.5 tabular-nums text-fg-subtle">{count}</span>
                  </button>
                ))}
              </div>
            </Toolbar>

            {visible.length === 0 ? (
              <Panel tone="sunken" className="py-8 text-center">
                <p className="text-meta text-fg-muted">
                  No changes in this view. Switch the filter to see the rest.
                </p>
              </Panel>
            ) : (
              <ul className="flex flex-col gap-3">
                {visible.map((change) => (
                  <li key={change.id}>
                    <ChangeCard
                      change={change}
                      busy={busyId === change.id}
                      onDecide={(decision, editedText) =>
                        void decide(change.id, decision, editedText)
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </Stack>
        )}
      </Section>

      {/* -------------------------------------------------- unaddressed */}
      {/*
        An accent edge, not a filled amber panel.

        Twenty-three rows on a warning background floods a third of the screen
        with caution colour to deliver a message whose own text says "this is
        the product working as intended". A single 2px edge marks the region as
        a note; the tone is carried by the words, which is where it belongs.
      */}
      {unaddressed.length > 0 ? (
        <Panel flush className="border-l-2 border-l-warning-solid">
          <PanelHeader
            title={`${unaddressed.length} ${pluralize(unaddressed.length, 'requirement')} deliberately not addressed`}
            description="Your resume contains no evidence for these, so nothing was written about them. This is the product working as intended."
          />
          <div className="px-4 py-3 sm:px-5 sm:py-4">
            <UnaddressedList entries={unaddressed} />
          </div>
        </Panel>
      ) : null}

      <p className="text-center text-2xs text-fg-subtle">
        Reviewing resume <span className="font-mono">{resumeId.slice(0, 8)}</span> · engine{' '}
        <span className="font-mono">{provider}</span>
      </p>
    </Stack>
  )
}

/**
 * The gap list.
 *
 * A demanding posting can produce twenty or more gaps, and an undifferentiated
 * wall of them buries the changes the user is actually here to review. The
 * first few are shown and the rest are one disclosure away — every gap is still
 * reachable, none is hidden.
 */
const VISIBLE_GAPS = 6

function UnaddressedList({ entries }: { entries: UnaddressedRequirement[] }) {
  const [expanded, setExpanded] = React.useState(false)
  const visible = expanded ? entries : entries.slice(0, VISIBLE_GAPS)
  const hidden = entries.length - visible.length

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line">
        {visible.map((entry) => (
          <li key={entry.requirementId} className="py-2.5 first:pt-0 last:pb-0">
            <p className="measure-wide text-meta leading-relaxed text-fg">{entry.text}</p>
            {/*
              The per-requirement reason, which the panel's heading cannot give:
              "no evidence at all" and "mentioned once with no detail" are
              different situations and lead to different next steps.
            */}
            {entry.reason.trim() ? (
              <p className="mt-1 measure text-2xs leading-relaxed text-fg-muted">{entry.reason}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {hidden > 0 || expanded ? (
        <div>
          <Button variant="secondary" size="sm" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Show fewer' : `Show all ${entries.length}`}
          </Button>
        </div>
      ) : null}

      <p className="measure text-2xs leading-relaxed text-fg-subtle">
        If you do have this experience, add it to your resume and run the analysis again.
      </p>
    </div>
  )
}

/* ==========================================================================
   One change
   ========================================================================== */

function ChangeCard({
  change,
  busy,
  onDecide,
}: {
  change: ReviewChange
  busy: boolean
  onDecide: (decision: Decision, editedText?: string) => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(change.editedText ?? change.after ?? '')

  const decided = change.decision !== 'pending'
  const applied = change.decision === 'accepted' || change.decision === 'edited'

  const finalText = change.decision === 'edited' ? change.editedText : change.after

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border bg-surface',
        'transition-[border-color,opacity] duration-[--duration-fast] ease-[--ease-standard]',
        // A rejected change stays legible but recedes: it is a decision, not a
        // deletion, and it has to be findable again to be undone.
        change.decision === 'rejected'
          ? 'border-line opacity-70'
          : applied
            ? 'border-success-line'
            : // Pending is the one state that gets a stronger edge, because it
              // is the state that needs the user.
              'border-line-strong',
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <ChangeBadge action={change.action} />
          <span className="text-2xs text-fg-subtle">{describePath(change.targetPath)}</span>
        </div>
        <DecisionBadge decision={change.decision} />
      </header>

      <div className="flex flex-col gap-3 p-3.5">
        {change.action === 'reordered' ? (
          <p className="measure-wide text-meta leading-relaxed text-fg">{change.rationale}</p>
        ) : (
          <>
            {/*
              Before and after, side by side from `md`.

              Labelled and tinted, and the label is the thing carrying the
              meaning — the tint is a second channel, not the only one, which
              matters here more than anywhere else in the product: this is the
              screen someone with a colour vision deficiency uses to decide
              what goes on their resume.
            */}
            <div className="grid gap-2.5 md:grid-cols-2">
              <div className="rounded-lg border border-diff-removed-line bg-diff-removed-bg p-3">
                <p className="eyebrow text-diff-removed-fg">Before</p>
                <p className="mt-1.5 text-meta leading-relaxed text-fg">{change.before}</p>
              </div>
              <div className="rounded-lg border border-diff-added-line bg-diff-added-bg p-3">
                <p className="eyebrow text-diff-added-fg">
                  {change.decision === 'edited' ? 'Your version' : 'After'}
                </p>
                <p className="mt-1.5 text-meta leading-relaxed text-fg">{finalText}</p>
              </div>
            </div>

            <p className="measure-wide text-meta leading-relaxed text-fg-muted">
              <span className="font-medium text-fg">Why: </span>
              {change.rationale}
            </p>

            {change.evidence.length > 0 ? (
              <details className="group rounded-lg border border-line bg-canvas px-3 py-2">
                <summary className="focus-ring cursor-pointer list-none text-2xs font-medium text-fg-subtle transition-colors hover:text-fg-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="inline-block transition-transform duration-[--duration-fast] group-open:rotate-90"
                    >
                      ›
                    </span>
                    Source text this is based on
                  </span>
                </summary>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {change.evidence.map((quote) => (
                    <li
                      key={quote}
                      // Monospace: this is text lifted verbatim out of the
                      // user's document, and the face is what says so.
                      className="border-l-2 border-line-accent pl-2.5 font-mono text-2xs leading-relaxed text-fg-muted"
                    >
                      {quote}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        )}

        {editing ? (
          <div className="rounded-lg border border-line bg-canvas p-3">
            <Field id={`edit-${change.id}`}>
              <FieldLabel>Your wording</FieldLabel>
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                autoFocus
              />
            </Field>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={!draft.trim()}
                onClick={() => {
                  onDecide('edited', draft.trim())
                  setEditing(false)
                }}
              >
                Save my version
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {!applied ? (
              <Button size="sm" onClick={() => onDecide('accepted')} disabled={busy}>
                <Check className="size-3.5" aria-hidden="true" />
                Accept
              </Button>
            ) : null}

            {change.decision !== 'rejected' ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onDecide('rejected')}
                disabled={busy}
              >
                <X className="size-3.5" aria-hidden="true" />
                Reject
              </Button>
            ) : null}

            {change.action !== 'reordered' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(change.editedText ?? change.after ?? '')
                  setEditing(true)
                }}
                disabled={busy}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Edit
              </Button>
            ) : null}

            {decided ? (
              <Button size="sm" variant="ghost" onClick={() => onDecide('pending')} disabled={busy}>
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Undo
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </article>
  )
}

function DecisionBadge({ decision }: { decision: Decision }) {
  switch (decision) {
    case 'accepted':
      return <Badge tone="success">Accepted</Badge>
    case 'edited':
      return <Badge tone="accent">Edited by you</Badge>
    case 'rejected':
      return <Badge tone="neutral">Rejected</Badge>
    case 'pending':
      return <Badge tone="warning">Needs your decision</Badge>
  }
}

/** Turns `experience.exp-1.bullets.2` into "Experience · bullet 3". */
function describePath(path: string): string {
  if (path === 'summary') return 'Professional summary'
  if (path === 'experience') return 'Experience order'
  if (path === 'projects') return 'Project order'

  const bullet = /^(experience|projects)\.[^.]+\.bullets\.(\d+)$/.exec(path)
  if (bullet) {
    const section = bullet[1] === 'experience' ? 'Experience' : 'Projects'
    return `${section} · bullet ${Number(bullet[2]) + 1}`
  }

  // `skills.skill-2.items` — the group id alone is meaningless to a reader,
  // but two identically-labelled cards are worse, so surface the number.
  const skills = /^skills\.([A-Za-z0-9_-]+)\.items$/.exec(path)
  if (skills) {
    const ordinal = /(\d+)$/.exec(skills[1] ?? '')?.[1]
    return ordinal ? `Skills group ${ordinal}` : 'Skills order'
  }

  return path
}
