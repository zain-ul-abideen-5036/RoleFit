import type { Metadata } from 'next'
import Link from 'next/link'

import { ArrowRight, FileText, Gauge, History, Sparkles, Upload } from 'lucide-react'

import { PageBody, PageHeader } from '@/components/app/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { ScoreDisclaimer } from '@/components/ui/score'
import { scoreBand } from '@/lib/constants'
import { formatRelative, pluralize } from '@/lib/utils'
import { requirePageUser } from '@/server/auth/service'
import {
  getDashboardStats,
  listAnalyses,
  listOptimizationRuns,
  listResumes,
} from '@/server/repositories'

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await requirePageUser()

  const [stats, resumes, analyses, runs] = await Promise.all([
    getDashboardStats(user.userId),
    listResumes(user.userId, 5),
    listAnalyses(user.userId, 5),
    listOptimizationRuns(user.userId, 5),
  ])

  const isNewAccount = stats.resumeCount === 0

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          isNewAccount
            ? 'Upload a resume and a job description to see where you stand.'
            : 'Your resumes, analyses and optimization runs.'
        }
        actions={
          <Button asChild>
            <Link href="/optimize">
              <Sparkles className="size-4" aria-hidden="true" />
              New optimization
            </Link>
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {isNewAccount ? (
          <EmptyState
            icon={<Upload className="size-5" />}
            title="Upload your first resume to get started"
            description="RoleFit reads your resume and a job description, shows you exactly where you match, and rewrites what you already have to fit the role."
            action={
              <Button size="lg" asChild>
                <Link href="/optimize">
                  Start an optimization
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <section aria-label="Summary">
              {/*
                One strip divided by rules, not four separate cards.

                Four bordered boxes in a row give every number the same weight
                and the same visual container, which is the shape that makes a
                dashboard read as a template. Sharing one surface and separating
                by hairline says these belong to a single readout — and the
                readiness figure, the only one that is a judgement rather than a
                count, is free to sit differently within it.
              */}
              <Card className="overflow-hidden">
                <div className="grid grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-line lg:[&>*]:border-b-0 [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-line lg:[&>*]:border-r-0">
                  <StatCard
                    label="Resumes"
                    value={String(stats.resumeCount)}
                    hint={pluralize(stats.resumeCount, 'document', 'documents')}
                    Icon={FileText}
                  />
                  <StatCard
                    label="Analyses"
                    value={String(stats.analysisCount)}
                    hint="job descriptions compared"
                    Icon={Gauge}
                  />
                  <StatCard
                    label="Optimizations"
                    value={String(stats.optimizationCount)}
                    hint="runs completed"
                    Icon={Sparkles}
                  />
                  <StatCard
                    label="Average readiness"
                    value={stats.averageScore === null ? '—' : String(stats.averageScore)}
                    hint={
                      stats.averageScore === null
                        ? 'no analyses yet'
                        : scoreBand(stats.averageScore).label.toLowerCase()
                    }
                    Icon={Gauge}
                    tone={
                      stats.averageScore === null ? undefined : scoreBand(stats.averageScore).tone
                    }
                  />
                </div>
              </Card>
              <ScoreDisclaimer className="mt-3" />
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle as="h2">Recent analyses</CardTitle>
                    <CardDescription>How your resume scored against each role.</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/history">
                      View all
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  {analyses.length === 0 ? (
                    <p className="py-6 text-center text-sm text-fg-muted">
                      No analyses yet. Start one from the Optimize page.
                    </p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-line">
                      {analyses.map((analysis) => {
                        const band = scoreBand(analysis.overallScore)
                        return (
                          <li key={analysis.id}>
                            <Link
                              href={`/analysis/${analysis.id}`}
                              className="flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-fg">
                                  {analysis.report.counts.strong} strong,{' '}
                                  {analysis.report.counts.missing} missing
                                </p>
                                <p className="text-xs text-fg-subtle">
                                  {formatRelative(analysis.createdAt)}
                                </p>
                              </div>
                              <Badge
                                tone={
                                  band.tone === 'success'
                                    ? 'success'
                                    : band.tone === 'warning'
                                      ? 'warning'
                                      : 'danger'
                                }
                              >
                                {analysis.overallScore} · {band.label}
                              </Badge>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle as="h2">Recent optimizations</CardTitle>
                    <CardDescription>Runs you can review and export.</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/history">
                      View all
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  {runs.length === 0 ? (
                    <p className="py-6 text-center text-sm text-fg-muted">
                      No optimization runs yet.
                    </p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-line">
                      {runs.map((run) => (
                        <li key={run.id}>
                          <Link
                            href={`/resume/${run.resumeId}?run=${run.id}`}
                            className="flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-fg">
                                {run.changeSet?.changes.length ?? 0}{' '}
                                {pluralize(run.changeSet?.changes.length ?? 0, 'change')} proposed
                              </p>
                              <p className="text-xs text-fg-subtle">
                                {formatRelative(run.createdAt)} · {run.provider}
                              </p>
                            </div>
                            {run.projectedScore !== null ? (
                              <Badge tone="accent">{run.projectedScore} projected</Badge>
                            ) : (
                              <Badge tone="neutral">{run.status}</Badge>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle as="h2">Your resumes</CardTitle>
                  <CardDescription>Uploaded documents available to optimize.</CardDescription>
                </div>
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/optimize">
                    <Upload className="size-3.5" aria-hidden="true" />
                    Upload
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {resumes.map((resume) => (
                    <li key={resume.id}>
                      <Link
                        href={`/resume/${resume.id}`}
                        className="flex h-full flex-col gap-2 rounded-lg border border-line p-4 transition-colors hover:border-line-strong hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                          <Badge tone="neutral">{resume.sourceFormat.toUpperCase()}</Badge>
                        </div>
                        <p className="truncate text-sm font-medium text-fg">{resume.title}</p>
                        <p className="text-xs text-fg-subtle">
                          {resume.profile.experience.length}{' '}
                          {pluralize(resume.profile.experience.length, 'role')} ·{' '}
                          {formatRelative(resume.createdAt)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </PageBody>
    </>
  )
}

function StatCard({
  label,
  value,
  hint,
  Icon,
  tone,
}: {
  label: string
  value: string
  hint: string
  Icon: typeof History
  tone?: 'success' | 'warning' | 'danger'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success-fg'
      : tone === 'warning'
        ? 'text-warning-fg'
        : tone === 'danger'
          ? 'text-danger-fg'
          : 'text-fg'

  return (
    <div className="p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-fg-subtle">
          {label}
        </p>
        <Icon className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
      </div>
      {/*
        The serif carries the figure. A number is the one place a display face
        earns its keep in an interface: it is read as a value rather than as
        running text, and the optical sizing keeps it from looking spindly.
        `tabular-nums` so a changing figure does not shift the row.
      */}
      <p className={`mt-3 font-display text-[2rem] leading-none tabular-nums ${toneClass}`}>
        {value}
      </p>
      <p className="mt-2 text-xs text-fg-subtle">{hint}</p>
    </div>
  )
}
