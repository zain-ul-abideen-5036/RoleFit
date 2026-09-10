import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Sparkles } from 'lucide-react'

import { AnalysisDetail } from '@/components/app/analysis-detail'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/feedback'
import { PageBody, PageHeader, Panel, PanelHeader, Stack } from '@/components/ui/layout'
import { ScoreBreakdown, ScoreDisclaimer, ScoreRing } from '@/components/ui/score'
import { scoreBand } from '@/lib/constants'
import { AppError } from '@/lib/errors'
import { pluralize } from '@/lib/utils'
import { requirePageUser } from '@/server/auth/service'
import { requireAnalysis, requireJobDescription, requireResume } from '@/server/repositories'

export const metadata: Metadata = {
  title: 'Analysis',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePageUser()

  // A resource belonging to another account surfaces as 404, not 403.
  let analysis
  let jobDescription
  let resume
  try {
    analysis = await requireAnalysis(user.userId, id)
    ;[resume, jobDescription] = await Promise.all([
      requireResume(user.userId, analysis.resumeId),
      requireJobDescription(user.userId, analysis.jobDescriptionId),
    ])
  } catch (error) {
    if (AppError.isAppError(error) && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const { report } = analysis
  const band = scoreBand(report.overallScore)
  const tone = band.tone === 'success' ? 'success' : band.tone === 'warning' ? 'warning' : 'danger'

  return (
    <>
      <PageHeader
        title={jobDescription.title}
        description={
          jobDescription.company
            ? `${jobDescription.company} · analysed against “${resume.title}”`
            : `Analysed against “${resume.title}”`
        }
        breadcrumbs={[
          { href: '/history', label: 'History' },
          { href: `/analysis/${analysis.id}`, label: 'Analysis' },
        ]}
        meta={
          <Badge tone={tone}>
            {report.overallScore} · {band.label}
          </Badge>
        }
        actions={
          <Button asChild>
            <Link href={`/optimize?resume=${analysis.resumeId}`}>
              <Sparkles className="size-4" aria-hidden="true" />
              Optimize this resume
            </Link>
          </Button>
        }
      />

      <PageBody>
        <Stack gap="lg">
          {/*
            The verdict band.

            One row: the figure, the three tallies it decomposes into, and the
            seven weighted dimensions it was computed from. This was two
            separate cards, each with its own heading and padding, with the
            tallies boxed individually inside the left one — boxes inside a box
            inside a card, to state one measurement.
          */}
          {/*
            `items-start`, so the verdict panel is its natural height rather
            than stretched to match the breakdown beside it. Stretched, it left
            a 170px void under the disclaimer that read as missing content.
          */}
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-5">
            <Panel className="flex flex-col items-center gap-5">
              <ScoreRing score={report.overallScore} size="lg" caption="ATS Readiness estimate" />

              {/*
                One readout divided by rules, not three bordered tiles. The
                three counts are one measurement of the same thing, so they
                belong on one surface.
              */}
              <dl className="grid w-full grid-cols-3 divide-x divide-line border-y border-line">
                <Tally label="Strong" value={report.counts.strong} tone="success" />
                <Tally label="Partial" value={report.counts.partial} tone="warning" />
                <Tally label="Missing" value={report.counts.missing} tone="danger" />
              </dl>

              {/*
                Left-aligned, not centred. Centred prose in a 19rem column
                rags over five lines and makes the reader hunt for the start of
                each one — which is the opposite of what a short explanatory
                note is for.
              */}
              {report.counts.requiredMissing > 0 ? (
                <p className="w-full text-2xs leading-relaxed text-fg-muted">
                  <span className="font-medium text-warning-fg">
                    {report.counts.requiredMissing} of the missing{' '}
                    {pluralize(report.counts.requiredMissing, 'item')}{' '}
                    {report.counts.requiredMissing === 1 ? 'is' : 'are'} stated as required.
                  </span>{' '}
                  They will not be written in.
                </p>
              ) : null}

              <ScoreDisclaimer className="w-full border-t border-line pt-4 text-2xs" />
            </Panel>

            <Panel flush>
              <PanelHeader
                title="Score breakdown"
                description="Seven weighted dimensions, heaviest first. Every point traces back to something you can change."
              />
              <div className="px-4 py-4 sm:px-5">
                <ScoreBreakdown dimensions={report.dimensions} />
              </div>
            </Panel>
          </div>

          {/* ------------------------------------------------ requirements */}
          <AnalysisDetail report={report} />
        </Stack>
      </PageBody>
    </>
  )
}

function Tally({
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
    <div className="px-2 py-2.5 text-center">
      <dt className="eyebrow text-fg-subtle">{label}</dt>
      <dd className={`mt-0.5 text-display-xs font-semibold tabular-nums ${toneClass}`}>{value}</dd>
    </div>
  )
}
