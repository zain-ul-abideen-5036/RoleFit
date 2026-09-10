'use client'

import * as React from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, FileText, Sparkles, XCircle } from 'lucide-react'

import {
  ParsedResumeSummary,
  ResumeUploader,
  type UploadedResume,
} from '@/components/app/resume-uploader'
import { Stepper, type Step } from '@/components/app/stepper'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel, Input, Textarea } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { Panel, PanelHeader, Section, Stack } from '@/components/ui/layout'
import { ScoreDisclaimer, ScoreRing } from '@/components/ui/score'
import { apiGet, apiPost, toDisplayError } from '@/lib/client/api'
import { JOB_DESCRIPTION, OPTIMIZATION_STAGES } from '@/lib/constants'
import type { AnalysisReport } from '@/lib/domain/types'
import { cn, pluralize } from '@/lib/utils'

/**
 * The optimization workflow.
 *
 * Progress is reported by *stage*, not by a percentage. A fake progress bar
 * that advances on a timer is a lie about how far along the work is; naming the
 * step currently running is honest and more useful when something is slow.
 */

const STEPS: Step[] = [
  { id: 'resume', label: 'Resume' },
  { id: 'job', label: 'Job description' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'optimize', label: 'Optimize' },
]

interface ExistingResume {
  id: string
  title: string
  originalFilename: string
  sourceFormat: string
  createdAt: string
  experienceCount: number
  skillCount: number
}

interface AnalysisResponse {
  analysis: {
    id: string
    resumeId: string
    overallScore: number
    report: AnalysisReport
  }
  jobDescription: { id: string; title: string; company: string | null }
}

interface OptimizationResponse {
  run: {
    id: string
    resumeId: string
    /** `queued` when a worker will do the work; otherwise already finished. */
    status: 'queued' | 'running' | 'succeeded' | 'failed'
    projectedScore: number | null
    provider: string | null
  }
  rejectedCount: number
}

/** How long to keep polling a queued run before giving up. */
const POLL_TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 1_500

/**
 * Waits for a queued run to finish.
 *
 * Only reached when the deployment runs a worker (`QUEUE_DRIVER=database`); the
 * inline mode returns a finished run and never enters this. The client decides
 * by reading the status it was given rather than by knowing the mode.
 */
async function waitForRun(runId: string): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

    const { run } = await apiGet<{ run: { status: string } }>(`/api/optimizations/${runId}`)

    if (run.status === 'succeeded') return
    if (run.status === 'failed') {
      throw new Error('The optimization did not finish. Please try again.')
    }
  }

  // A run still going after two minutes is not going to finish while someone
  // watches. The run row survives, so it is visible in history either way.
  throw new Error(
    'This is taking longer than expected. Your run is still going — check your history in a moment.',
  )
}

type Stage = (typeof OPTIMIZATION_STAGES)[number]['key']

export function OptimizeWizard({
  existingResumes,
  initialResumeId,
}: {
  existingResumes: ExistingResume[]
  /** Preselected from `?resume=<id>`, already checked against the account. */
  initialResumeId?: string
}) {
  const router = useRouter()

  const [stepIndex, setStepIndex] = React.useState(0)
  const [resume, setResume] = React.useState<UploadedResume | null>(null)
  const [selectedResumeId, setSelectedResumeId] = React.useState<string | null>(
    initialResumeId ?? null,
  )

  const [jobText, setJobText] = React.useState('')
  const [jobTitle, setJobTitle] = React.useState('')
  const [company, setCompany] = React.useState('')

  const [analysis, setAnalysis] = React.useState<AnalysisResponse | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [stage, setStage] = React.useState<Stage | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const resumeId = resume?.id ?? selectedResumeId

  /* ------------------------------------------------------------- analysis */

  async function runAnalysis(): Promise<void> {
    if (!resumeId || busy) return

    setBusy(true)
    setError(null)
    setStage('parsing_job')
    setStepIndex(2)

    try {
      setStage('matching')
      const result = await apiPost<AnalysisResponse>('/api/analyses', {
        resumeId,
        jobDescriptionText: jobText.trim(),
        ...(jobTitle.trim() ? { jobTitle: jobTitle.trim() } : {}),
        ...(company.trim() ? { company: company.trim() } : {}),
      })
      setAnalysis(result)
      setStage(null)
    } catch (caught) {
      setError(toDisplayError(caught).message)
      setStepIndex(1)
      setStage(null)
    } finally {
      setBusy(false)
    }
  }

  /* --------------------------------------------------------- optimization */

  async function runOptimization(): Promise<void> {
    if (!analysis || busy) return

    setBusy(true)
    setError(null)
    setStage('optimizing')
    setStepIndex(3)

    try {
      const result = await apiPost<OptimizationResponse>('/api/optimizations', {
        analysisId: analysis.analysis.id,
      })

      // Queued: a worker has the job, so wait for the run to report finished.
      if (result.run.status !== 'succeeded') {
        await waitForRun(result.run.id)
      }

      setStage('generating')
      router.push(`/resume/${result.run.resumeId}?run=${result.run.id}`)
    } catch (caught) {
      setError(toDisplayError(caught).message)
      setStepIndex(2)
      setStage(null)
      setBusy(false)
    }
  }

  /* -------------------------------------------------------------- render */

  return (
    <Stack gap="lg">
      {/*
        The stepper sits on a rule, above the panel rather than inside it, so
        the sequence reads as belonging to the page and the panel below is
        simply the current step's content.
      */}
      <div className="border-b border-line pb-4">
        <Stepper steps={STEPS} currentIndex={stepIndex} />
      </div>

      {error ? (
        <Alert tone="danger" live title="Something went wrong">
          {error}
        </Alert>
      ) : null}

      {/*
        Keyed on the step so React remounts the subtree and the entrance
        animation replays on every advance.

        Without the key, moving from step 2 to 3 swaps the contents of a node
        that never re-enters, so the panel changes silently and the eye has
        nothing telling it the change was the result of the button just pressed.
        This is the one place in the flow where motion carries information
        rather than decorating: it ties the press to the panel that replaced
        the last one.
      */}
      <div key={stepIndex} className="animate-enter">
        {stepIndex === 0 ? (
          <StepResume
            existingResumes={existingResumes}
            selectedResumeId={selectedResumeId}
            uploaded={resume}
            onSelectExisting={(id) => {
              setSelectedResumeId(id)
              setResume(null)
            }}
            onUploaded={(uploaded) => {
              setResume(uploaded)
              setSelectedResumeId(null)
            }}
            onContinue={() => setStepIndex(1)}
          />
        ) : null}

        {stepIndex === 1 ? (
          <StepJobDescription
            jobText={jobText}
            jobTitle={jobTitle}
            company={company}
            onJobText={setJobText}
            onJobTitle={setJobTitle}
            onCompany={setCompany}
            onBack={() => setStepIndex(0)}
            onSubmit={runAnalysis}
            busy={busy}
          />
        ) : null}

        {stepIndex === 2 ? (
          busy || !analysis ? (
            <ProcessingPanel stage={stage} />
          ) : (
            <StepAnalysis
              analysis={analysis}
              onBack={() => setStepIndex(1)}
              onOptimize={runOptimization}
              busy={busy}
            />
          )
        ) : null}

        {stepIndex === 3 ? <ProcessingPanel stage={stage} /> : null}
      </div>
    </Stack>
  )
}

/**
 * The footer of a wizard step: back on the left, forward on the right.
 *
 * One component so the two controls do not drift apart in size, order or
 * spacing between four steps — they had been written out inline each time,
 * with `justify-end` on one step and `justify-between` on the next.
 */
function StepActions({ back, forward }: { back?: React.ReactNode; forward: React.ReactNode }) {
  return (
    <div
      className={cn(
        // Reversed on mobile so the forward action sits under the thumb rather
        // than above a "Back" the thumb reaches first.
        'flex flex-col-reverse gap-2 sm:flex-row sm:items-center',
        back ? 'sm:justify-between' : 'sm:justify-end',
      )}
    >
      {back}
      {forward}
    </div>
  )
}

/* ==========================================================================
   Step 1 — resume
   ========================================================================== */

function StepResume({
  existingResumes,
  selectedResumeId,
  uploaded,
  onSelectExisting,
  onUploaded,
  onContinue,
}: {
  existingResumes: ExistingResume[]
  selectedResumeId: string | null
  uploaded: UploadedResume | null
  onSelectExisting: (id: string) => void
  onUploaded: (resume: UploadedResume) => void
  onContinue: () => void
}) {
  const ready = Boolean(uploaded ?? selectedResumeId)

  return (
    <Stack gap="lg">
      {existingResumes.length > 0 ? (
        <Section
          title="Use a resume you have already uploaded"
          description="Or upload a new one below."
        >
          <ul
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
            role="radiogroup"
            aria-label="Choose an existing resume"
          >
            {existingResumes.map((item) => {
              const selected = selectedResumeId === item.id
              return (
                <li key={item.id}>
                  {/*
                    `role="radio"` inside a radiogroup, not `aria-pressed` on a
                    button. These are mutually exclusive — picking one deselects
                    the rest — and a row of toggle buttons announces four
                    independently-pressable controls, which describes the wrong
                    interaction.
                  */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onSelectExisting(item.id)}
                    className={cn(
                      'focus-ring flex w-full cursor-pointer flex-col gap-1.5 rounded-lg border p-3 text-left',
                      'transition-[border-color,background-color] duration-[--duration-fast] ease-[--ease-standard]',
                      selected
                        ? 'border-line-accent bg-selected'
                        : 'border-line bg-surface hover:border-line-strong hover:bg-hover',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <FileText
                        className={cn(
                          'size-4 shrink-0',
                          selected ? 'text-fg-accent' : 'text-fg-subtle',
                        )}
                        aria-hidden="true"
                      />
                      {selected ? (
                        <span className="inline-flex items-center gap-1 text-2xs font-medium text-fg-accent">
                          <Check className="size-3.5" aria-hidden="true" />
                          Selected
                        </span>
                      ) : (
                        <span className="text-2xs text-fg-subtle">
                          {item.sourceFormat.toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-meta font-medium text-fg">{item.title}</span>
                    <span className="text-2xs text-fg-subtle">
                      {item.experienceCount} {pluralize(item.experienceCount, 'role')} ·{' '}
                      {item.skillCount} {pluralize(item.skillCount, 'skill')}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}

      {uploaded ? (
        <ParsedResumeSummary resume={uploaded} />
      ) : (
        <ResumeUploader onUploaded={(resume) => onUploaded(resume)} />
      )}

      <StepActions
        forward={
          <Button size="lg" disabled={!ready} onClick={onContinue}>
            Continue
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        }
      />
    </Stack>
  )
}

/* ==========================================================================
   Step 2 — job description
   ========================================================================== */

function StepJobDescription({
  jobText,
  jobTitle,
  company,
  onJobText,
  onJobTitle,
  onCompany,
  onBack,
  onSubmit,
  busy,
}: {
  jobText: string
  jobTitle: string
  company: string
  onJobText: (value: string) => void
  onJobTitle: (value: string) => void
  onCompany: (value: string) => void
  onBack: () => void
  onSubmit: () => void
  busy: boolean
}) {
  const length = jobText.trim().length
  const tooShort = length > 0 && length < JOB_DESCRIPTION.minLength
  const tooLong = length > JOB_DESCRIPTION.maxLength
  const ready = length >= JOB_DESCRIPTION.minLength && !tooLong

  return (
    <Stack gap="lg">
      <Section
        title="Paste the job description"
        description="Include the whole posting — requirements, responsibilities and qualifications. The more complete it is, the more accurate the match."
      >
        <Stack gap="md">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="jobTitle">
              <FieldLabel optional>Job title</FieldLabel>
              <Input
                value={jobTitle}
                onChange={(event) => onJobTitle(event.target.value)}
                placeholder="Backend Engineer"
              />
              <FieldDescription>Used to label this run in your history.</FieldDescription>
            </Field>
            <Field id="company">
              <FieldLabel optional>Company</FieldLabel>
              <Input
                value={company}
                onChange={(event) => onCompany(event.target.value)}
                placeholder="Meridian Data"
              />
            </Field>
          </div>

          <Field
            id="jobDescription"
            error={
              tooShort
                ? `Add more of the posting — at least ${JOB_DESCRIPTION.minLength} characters.`
                : tooLong
                  ? 'That is longer than a job posting should be. Paste only the posting itself.'
                  : undefined
            }
          >
            <FieldLabel>Job description</FieldLabel>
            {/*
              Monospace, because this is pasted source text rather than the
              product's own prose — the same reason evidence excerpts are set
              in it. It also makes it obvious at a glance whether the paste
              picked up the formatting or arrived as one run-on block.
            */}
            <Textarea
              value={jobText}
              onChange={(event) => onJobText(event.target.value)}
              rows={16}
              placeholder="Paste the full job posting here…"
              className="min-h-72 font-mono text-meta leading-relaxed"
            />
            <FieldDescription>
              <span className="tabular-nums">{length.toLocaleString('en-GB')}</span> characters.
              Anything pasted here is treated strictly as data — a posting cannot instruct the
              optimizer.
            </FieldDescription>
          </Field>
        </Stack>
      </Section>

      <StepActions
        back={
          <Button variant="ghost" onClick={onBack} disabled={busy}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
        }
        forward={
          <Button
            size="lg"
            onClick={onSubmit}
            disabled={!ready}
            loading={busy}
            loadingLabel="Analyzing…"
          >
            Analyze match
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        }
      />
    </Stack>
  )
}

/* ==========================================================================
   Processing
   ========================================================================== */

function ProcessingPanel({ stage }: { stage: Stage | null }) {
  const activeIndex = OPTIMIZATION_STAGES.findIndex((entry) => entry.key === stage)

  return (
    <Panel flush className="relative overflow-hidden">
      {/*
        An indeterminate rail across the top edge rather than a spinning disc
        in the middle.

        The spinner said only "something is happening", which the stage list
        below already says, and better. A rail sits where progress belongs on a
        panel, occupies no vertical space, and leaves the centre of the panel
        for the thing worth reading. It is also honest: the travel does not
        pretend to encode a percentage, because the duration here is not known.
      */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-sunken">
        <span className="block h-full w-1/3 animate-indeterminate rounded-full bg-accent" />
      </span>

      <div className="flex flex-col items-center gap-6 px-5 py-12">
        <div className="text-center">
          <p className="text-title font-semibold text-fg" aria-live="polite">
            {activeIndex >= 0 ? OPTIMIZATION_STAGES[activeIndex]!.label : 'Working…'}
          </p>
          <p className="mt-1 text-meta text-fg-muted">
            This usually takes a few seconds. Please keep this tab open.
          </p>
        </div>

        {/* Stage list, not a percentage: we report what is running, not a guess. */}
        <ol className="flex w-full max-w-xs flex-col gap-1">
          {OPTIMIZATION_STAGES.map((entry, index) => {
            const done = activeIndex >= 0 && index < activeIndex
            const active = index === activeIndex
            return (
              <li
                key={entry.key}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-meta',
                  'transition-colors duration-[--duration-fast] ease-[--ease-standard]',
                  active && 'bg-sunken font-medium text-fg',
                  done && 'text-fg-subtle',
                  !active && !done && 'text-fg-disabled',
                )}
              >
                <span
                  className={cn(
                    'flex size-3.5 shrink-0 items-center justify-center rounded-full',
                    'transition-[background-color] duration-[--duration-fast] ease-[--ease-standard]',
                    done
                      ? 'bg-success-solid text-white'
                      : active
                        ? 'bg-accent'
                        : 'border border-line-strong',
                  )}
                  aria-hidden="true"
                >
                  {done ? <Check className="size-2.5" /> : null}
                </span>
                {entry.label}
                <span className="sr-only">
                  {done ? '(done)' : active ? '(running)' : '(waiting)'}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </Panel>
  )
}

/* ==========================================================================
   Step 3 — analysis summary
   ========================================================================== */

function StepAnalysis({
  analysis,
  onBack,
  onOptimize,
  busy,
}: {
  analysis: AnalysisResponse
  onBack: () => void
  onOptimize: () => void
  busy: boolean
}) {
  const { report, id, overallScore } = analysis.analysis
  const missingRequired = report.requirementMatches.filter(
    (match) => match.status === 'missing' && match.priority === 'required',
  )

  return (
    <Stack gap="lg">
      <Panel className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-7">
        <ScoreRing score={overallScore} size="lg" caption="ATS Readiness estimate" />

        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold text-fg">
            {analysis.jobDescription.title}
            {analysis.jobDescription.company ? ` at ${analysis.jobDescription.company}` : ''}
          </h2>

          {/*
            One readout divided by rules, not three bordered boxes inside a
            bordered panel. Boxes nested in boxes is the loudest source of
            visual noise on this screen, and the three counts are one
            measurement of the same thing — they belong on one surface.
          */}
          <dl className="mt-4 grid grid-cols-3 divide-x divide-line border-y border-line">
            <SummaryStat label="Strong" value={report.counts.strong} tone="success" />
            <SummaryStat label="Partial" value={report.counts.partial} tone="warning" />
            <SummaryStat label="Missing" value={report.counts.missing} tone="danger" />
          </dl>

          <ScoreDisclaimer className="mt-3 text-2xs" />

          <Button variant="link" size="sm" className="mt-1.5 px-0" asChild>
            <Link href={`/analysis/${id}`}>
              See the full breakdown
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </Panel>

      {/* An accent edge rather than a filled amber panel — same reasoning as
          the gap list on the review screen. */}
      {missingRequired.length > 0 ? (
        <Panel flush className="border-l-2 border-l-warning-solid">
          <PanelHeader
            title={`${missingRequired.length} required ${pluralize(missingRequired.length, 'item')} your resume does not evidence`}
            description="These will not be added to your resume. They are listed so you know where the gap is."
          />
          <div className="px-4 py-3 sm:px-5">
            {/*
              A rule-separated list, and the per-row badge is gone. Every row
              carried an identical "Missing / not verified" pill under a heading
              that already said these are the items the resume does not
              evidence — eight repetitions of one fact, each in its own bordered
              box. The status is stated once, by the section.
            */}
            <ul className="divide-y divide-line">
              {missingRequired.slice(0, 8).map((match) => (
                <li key={match.requirementId} className="flex gap-2.5 py-2 first:pt-0 last:pb-0">
                  <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger-fg" aria-hidden="true" />
                  <span className="min-w-0 text-meta leading-relaxed text-fg">{match.text}</span>
                </li>
              ))}
            </ul>
            {missingRequired.length > 8 ? (
              <p className="mt-2.5 text-2xs text-fg-subtle">
                and {missingRequired.length - 8} more —{' '}
                <Link
                  href={`/analysis/${id}`}
                  className="focus-ring rounded text-fg-accent underline underline-offset-2"
                >
                  see the full analysis
                </Link>
                .
              </p>
            ) : null}
          </div>
        </Panel>
      ) : (
        <Alert tone="success" title="Every required item is evidenced">
          Your resume supports each requirement this posting states as required.
        </Alert>
      )}

      <StepActions
        back={
          <Button variant="ghost" onClick={onBack} disabled={busy}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Change job description
          </Button>
        }
        forward={
          <Button size="lg" onClick={onOptimize} loading={busy} loadingLabel="Optimizing…">
            <Sparkles className="size-4" aria-hidden="true" />
            Optimize my resume
          </Button>
        }
      />
    </Stack>
  )
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'success' | 'warning' | 'danger'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success-fg'
      : tone === 'warning'
        ? 'text-warning-fg'
        : 'text-danger-fg'

  return (
    <div className="px-3 py-2.5 first:pl-0">
      <dt className="eyebrow text-fg-subtle">{label}</dt>
      <dd className={cn('mt-0.5 text-display-xs font-semibold tabular-nums', toneClass)}>
        {value}
      </dd>
    </div>
  )
}
