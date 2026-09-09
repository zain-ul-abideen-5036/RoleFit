'use client'

import * as React from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, FileText, Sparkles, XCircle } from 'lucide-react'

import {
  ParsedResumeSummary,
  ResumeUploader,
  type UploadedResume,
} from '@/components/app/resume-uploader'
import { Stepper, type Step } from '@/components/app/stepper'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel, Input, Textarea } from '@/components/ui/field'
import { Alert, Badge } from '@/components/ui/feedback'
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

export function OptimizeWizard({ existingResumes }: { existingResumes: ExistingResume[] }) {
  const router = useRouter()

  const [stepIndex, setStepIndex] = React.useState(0)
  const [resume, setResume] = React.useState<UploadedResume | null>(null)
  const [selectedResumeId, setSelectedResumeId] = React.useState<string | null>(null)

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
    <div className="flex flex-col gap-8">
      <Stepper steps={STEPS} currentIndex={stepIndex} />

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
        This is the one place in the flow where motion is carrying information
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
            <ProcessingCard stage={stage} />
          ) : (
            <StepAnalysis
              analysis={analysis}
              onBack={() => setStepIndex(1)}
              onOptimize={runOptimization}
              busy={busy}
            />
          )
        ) : null}

        {stepIndex === 3 ? <ProcessingCard stage={stage} /> : null}
      </div>
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
    <div className="flex flex-col gap-6">
      {existingResumes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Use a resume you have already uploaded</CardTitle>
            <CardDescription>Or upload a new one below.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-2">
              {existingResumes.map((item) => {
                const selected = selectedResumeId === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelectExisting(item.id)}
                      aria-pressed={selected}
                      className={cn(
                        'flex w-full cursor-pointer flex-col gap-1 rounded-lg border p-4 text-left transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                        selected
                          ? 'border-accent bg-accent-subtle'
                          : 'border-line hover:border-line-strong hover:bg-sunken',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <FileText className="size-4 text-fg-subtle" aria-hidden="true" />
                        <Badge tone={selected ? 'accent' : 'neutral'}>
                          {selected ? 'Selected' : item.sourceFormat.toUpperCase()}
                        </Badge>
                      </span>
                      <span className="truncate text-sm font-medium text-fg">{item.title}</span>
                      <span className="text-xs text-fg-subtle">
                        {item.experienceCount} {pluralize(item.experienceCount, 'role')} ·{' '}
                        {item.skillCount} {pluralize(item.skillCount, 'skill')}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {uploaded ? (
        <ParsedResumeSummary resume={uploaded} />
      ) : (
        <ResumeUploader onUploaded={(resume) => onUploaded(resume)} />
      )}

      <div className="flex justify-end">
        <Button size="lg" disabled={!ready} onClick={onContinue}>
          Continue
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
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
    <Card>
      <CardHeader>
        <CardTitle as="h2">Paste the job description</CardTitle>
        <CardDescription>
          Include the whole posting — requirements, responsibilities and qualifications. The more
          complete it is, the more accurate the match.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="jobTitle">
            <FieldLabel optional>Job title</FieldLabel>
            <Input
              value={jobTitle}
              onChange={(event) => onJobTitle(event.target.value)}
              placeholder="Backend Engineer"
            />
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
          <Textarea
            value={jobText}
            onChange={(event) => onJobText(event.target.value)}
            rows={14}
            placeholder="Paste the full job posting here…"
            className="min-h-64 font-mono text-meta"
          />
          <FieldDescription>
            <span className="tabular-nums">{length.toLocaleString('en-GB')}</span> characters.
            Anything pasted here is treated strictly as data — a posting cannot instruct the
            optimizer.
          </FieldDescription>
        </Field>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={onBack} disabled={busy}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
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
        </div>
      </CardContent>
    </Card>
  )
}

/* ==========================================================================
   Processing
   ========================================================================== */

function ProcessingCard({ stage }: { stage: Stage | null }) {
  const activeIndex = OPTIMIZATION_STAGES.findIndex((entry) => entry.key === stage)

  return (
    <Card className="relative overflow-hidden">
      {/*
        An indeterminate rail across the top edge rather than a spinning disc
        in the middle.

        The spinner said only "something is happening", which the stage list
        below already says, and better. A rail sits where progress belongs on a
        panel, occupies no vertical space, and leaves the centre of the card
        for the thing worth reading. It is also honest: the travel does not
        pretend to encode a percentage, because the duration here is not known.
      */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-sunken">
        <span className="block h-full w-1/3 animate-indeterminate rounded-full bg-accent" />
      </span>

      <CardContent className="flex flex-col items-center gap-6 py-14">
        <div className="text-center">
          <p className="font-display text-xl font-medium text-fg" aria-live="polite">
            {activeIndex >= 0 ? OPTIMIZATION_STAGES[activeIndex]!.label : 'Working…'}
          </p>
          <p className="mt-1.5 text-sm text-fg-muted">
            This usually takes a few seconds. Please keep this tab open.
          </p>
        </div>

        {/* Stage list, not a percentage: we report what is running, not a guess. */}
        <ol className="flex w-full max-w-sm flex-col gap-2">
          {OPTIMIZATION_STAGES.map((entry, index) => {
            const done = activeIndex >= 0 && index < activeIndex
            const active = index === activeIndex
            return (
              <li
                key={entry.key}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm',
                  'transition-colors duration-[--duration-fast] ease-[--ease-standard]',
                  active && 'bg-sunken font-medium text-fg',
                  done && 'text-fg-subtle',
                  !active && !done && 'text-fg-disabled',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    'transition-[background-color,transform] duration-[--duration-fast] ease-[--ease-standard]',
                    active ? 'scale-125 bg-accent' : done ? 'bg-success-solid' : 'bg-line-bold',
                  )}
                  aria-hidden="true"
                />
                {entry.label}
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
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
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-start sm:p-8">
          <ScoreRing score={overallScore} size="lg" caption="ATS Readiness estimate" />

          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold tracking-tight text-fg">
              {analysis.jobDescription.title}
              {analysis.jobDescription.company ? ` at ${analysis.jobDescription.company}` : ''}
            </h2>

            {/*
              One readout divided by rules, not three bordered boxes inside a
              bordered card. Boxes nested in boxes is the single loudest source
              of visual noise on this screen, and the three counts are one
              measurement of the same thing — they belong on one surface.
            */}
            <dl className="mt-5 grid grid-cols-3 divide-x divide-line border-y border-line">
              <SummaryStat label="Strong" value={report.counts.strong} tone="success" />
              <SummaryStat label="Partial" value={report.counts.partial} tone="warning" />
              <SummaryStat label="Missing" value={report.counts.missing} tone="danger" />
            </dl>

            <ScoreDisclaimer className="mt-4" />

            <Button variant="link" className="mt-2 px-0" asChild>
              <Link href={`/analysis/${id}`}>
                See the full breakdown
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {missingRequired.length > 0 ? (
        <Card className="border-warning-line">
          <CardHeader>
            <CardTitle as="h2">
              {missingRequired.length} required {pluralize(missingRequired.length, 'item')} your
              resume does not evidence
            </CardTitle>
            <CardDescription>
              These will not be added to your resume. They are listed so you know where the gap is.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/*
              A rule-separated list, and the per-row badge is gone.
              Every row carried an identical "Missing / not verified" pill under
              a heading that already said these are the items the resume does
              not evidence — eight repetitions of one fact, each in its own
              bordered box, with a stretch of dead space between the label and
              the badge. The status is stated once, by the section.
              The marker keeps the rows scannable without colour doing the work.
            */}
            <ul className="-mt-1 divide-y divide-line">
              {missingRequired.slice(0, 8).map((match) => (
                <li key={match.requirementId} className="flex gap-3 py-2.5">
                  <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger-fg" aria-hidden="true" />
                  <span className="min-w-0 text-sm text-fg">{match.text}</span>
                </li>
              ))}
            </ul>
            {missingRequired.length > 8 ? (
              <p className="mt-3 text-meta text-fg-subtle">
                and {missingRequired.length - 8} more — see the full analysis.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Change job description
        </Button>
        <Button size="lg" onClick={onOptimize} loading={busy} loadingLabel="Optimizing…">
          <Sparkles className="size-4" aria-hidden="true" />
          Optimize my resume
        </Button>
      </div>
    </div>
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
    <div className="py-3 pr-3 pl-0 first:pl-0 [&:not(:first-child)]:pl-4">
      <dt className="text-2xs font-medium uppercase text-fg-subtle">{label}</dt>
      <dd className={cn('mt-1 font-display text-2xl tabular-nums', toneClass)}>{value}</dd>
    </div>
  )
}
