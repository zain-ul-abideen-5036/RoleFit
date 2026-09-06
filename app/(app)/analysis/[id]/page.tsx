import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AlertTriangle, ArrowRight, CheckCircle2, Info, Sparkles } from 'lucide-react'

import { PageBody, PageHeader } from '@/components/app/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, Badge, MatchBadge } from '@/components/ui/feedback'
import { ScoreBreakdown, ScoreDisclaimer, ScoreRing } from '@/components/ui/score'
import { AppError } from '@/lib/errors'
import type { RequirementMatch } from '@/lib/domain/types'
import { pluralize } from '@/lib/utils'
import { requireUser } from '@/server/auth/service'
import { requireAnalysis, requireJobDescription, requireResume } from '@/server/repositories'

export const metadata: Metadata = {
  title: 'Analysis',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()

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
  const matches = report.requirementMatches

  const missing = matches.filter((match) => match.status === 'missing')
  const strong = matches.filter((match) => match.status === 'strong')
  const partial = matches.filter((match) => match.status === 'partial')

  return (
    <>
      <PageHeader
        title={jobDescription.title}
        description={
          jobDescription.company
            ? `${jobDescription.company} · analysed against “${resume.title}”`
            : `Analysed against “${resume.title}”`
        }
        breadcrumb={{ href: '/history', label: 'All analyses' }}
        actions={
          <Button asChild>
            <Link href="/optimize">
              <Sparkles className="size-4" aria-hidden="true" />
              Optimize this resume
            </Link>
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {/* ------------------------------------------------------- score */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <Card>
            <CardContent className="flex flex-col items-center gap-5 p-6">
              <ScoreRing score={report.overallScore} size="lg" caption="ATS Readiness estimate" />
              <div className="grid w-full grid-cols-3 gap-2">
                <Tally label="Strong" value={report.counts.strong} tone="success" />
                <Tally label="Partial" value={report.counts.partial} tone="warning" />
                <Tally label="Missing" value={report.counts.missing} tone="danger" />
              </div>
              <ScoreDisclaimer className="text-center" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Score breakdown</CardTitle>
              <CardDescription>
                Seven weighted dimensions. Every point traces back to something you can change.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScoreBreakdown dimensions={report.dimensions} />
            </CardContent>
          </Card>
        </div>

        {/* --------------------------------------------- missing / gaps */}
        {missing.length > 0 ? (
          <Card className="border-danger-line">
            <CardHeader>
              <CardTitle as="h2">
                {missing.length} {pluralize(missing.length, 'requirement')} your resume does not
                evidence
              </CardTitle>
              <CardDescription>
                These will never be written into your resume. They are shown so you know where the
                gap is, and can address it honestly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RequirementList matches={missing} />
            </CardContent>
          </Card>
        ) : (
          <Alert tone="success" title="Every extracted requirement is evidenced">
            Your resume supports each requirement this posting states.
          </Alert>
        )}

        {/* -------------------------------------------------- strong ---- */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Strong matches</CardTitle>
              <CardDescription>
                Requirements clearly demonstrated by your experience.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {strong.length === 0 ? (
                <p className="py-4 text-sm text-fg-muted">No strong matches were found.</p>
              ) : (
                <RequirementList matches={strong.slice(0, 12)} showEvidence />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Partial evidence</CardTitle>
              <CardDescription>
                Related experience, but not a clear demonstration of the requirement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {partial.length === 0 ? (
                <p className="py-4 text-sm text-fg-muted">Nothing partially matched.</p>
              ) : (
                <RequirementList matches={partial.slice(0, 12)} showEvidence />
              )}
            </CardContent>
          </Card>
        </div>

        {/* ------------------------------------------------- keywords ---- */}
        <Card>
          <CardHeader>
            <CardTitle as="h2">Keyword coverage</CardTitle>
            <CardDescription>
              Terms from the posting, and whether they appear in your resume. Use the posting&apos;s
              wording only where you genuinely have the experience.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {report.keywordCoverage.map((entry) => (
                <li key={entry.keyword}>
                  <Badge tone={entry.present ? 'success' : 'neutral'}>
                    {entry.present ? (
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="size-3.5" aria-hidden="true" />
                    )}
                    {entry.keyword}
                    <span className="sr-only">
                      {entry.present ? ' — present in your resume' : ' — not found'}
                    </span>
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* ------------------------------------------ recommendations ---- */}
        {report.recommendations.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle as="h2">Recommendations</CardTitle>
              <CardDescription>Ordered by how much each would move your score.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3">
                {report.recommendations.map((recommendation) => (
                  <li
                    key={recommendation.id}
                    className="flex gap-3 rounded-lg border border-line bg-canvas p-4"
                  >
                    <span className="mt-0.5 shrink-0">
                      {recommendation.severity === 'critical' ? (
                        <AlertTriangle className="size-4 text-danger-fg" aria-hidden="true" />
                      ) : recommendation.severity === 'important' ? (
                        <AlertTriangle className="size-4 text-warning-fg" aria-hidden="true" />
                      ) : (
                        <Info className="size-4 text-fg-subtle" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-fg">{recommendation.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-fg-muted">
                        {recommendation.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex justify-end">
          <Button size="lg" asChild>
            <Link href="/optimize">
              Optimize this resume
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
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
    <div className="rounded-lg border border-line bg-canvas px-2 py-2 text-center">
      <p className="text-xs text-fg-subtle">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  )
}

function RequirementList({
  matches,
  showEvidence = false,
}: {
  matches: readonly RequirementMatch[]
  showEvidence?: boolean
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {matches.map((match) => (
        <li
          key={match.requirementId}
          className="rounded-lg border border-line bg-canvas px-3.5 py-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 flex-1 text-sm text-fg">{match.text}</p>
            <div className="flex shrink-0 items-center gap-2">
              {match.priority === 'required' ? (
                <Badge tone="neutral">Required</Badge>
              ) : (
                <Badge tone="neutral">Preferred</Badge>
              )}
              <MatchBadge status={match.status} />
            </div>
          </div>

          {showEvidence && match.evidence.length > 0 ? (
            <blockquote className="mt-2.5 border-l-2 border-line-accent pl-3 text-xs leading-relaxed text-fg-muted">
              <span className="font-medium text-fg-subtle">
                From your {match.evidence[0]!.section}:{' '}
              </span>
              {match.evidence[0]!.excerpt}
            </blockquote>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
