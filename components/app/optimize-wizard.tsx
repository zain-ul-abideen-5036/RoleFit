'use client'

import * as React from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, FileText, Loader2, Sparkles } from 'lucide-react'

import {
  ParsedResumeSummary,
  ResumeUploader,
  type UploadedResume,
} from '@/components/app/resume-uploader'
import { Stepper, type Step } from '@/components/app/stepper'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel, Input, Textarea } from '@/components/ui/field'
import { Alert, Badge, MatchBadge } from '@/components/ui/feedback'
import { ScoreDisclaimer, ScoreRing } from '@/components/ui/score'
import { apiPost, toDisplayError } from '@/lib/client/api'
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
  run: { id: string; resumeId: string; projectedScore: number; provider: string }
  rejectedCount: number
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
            className="min-h-64 font-mono text-[0.8125rem]"
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
    <Card>
      <CardContent className="flex flex-col items-center gap-6 py-14">
        <Loader2 className="size-8 animate-spin text-accent" aria-hidden="true" />

        <div className="text-center">
          <p className="text-lg font-semibold text-fg" aria-live="polite">
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
                  'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                  active && 'bg-accent-subtle font-medium text-fg-accent',
                  done && 'text-fg-subtle',
                  !active && !done && 'text-fg-disabled',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    active ? 'bg-accent' : done ? 'bg-success-solid' : 'bg-line-bold',
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

            <dl className="mt-4 grid grid-cols-3 gap-3">
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
            <ul className="flex flex-col gap-2">
              {missingRequired.slice(0, 8).map((match) => (
                <li
                  key={match.requirementId}
                  className="flex items-start justify-between gap-3 rounded-lg border border-line bg-canvas px-3 py-2.5"
                >
                  <span className="min-w-0 text-sm text-fg">{match.text}</span>
                  <MatchBadge status="missing" className="shrink-0" />
                </li>
              ))}
            </ul>
            {missingRequired.length > 8 ? (
              <p className="mt-3 text-xs text-fg-subtle">
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
    <div className="rounded-lg border border-line bg-canvas px-3 py-2.5">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className={cn('text-2xl font-bold tabular-nums', toneClass)}>{value}</dd>
    </div>
  )
}
