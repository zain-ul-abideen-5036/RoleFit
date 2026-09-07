import type { Metadata } from 'next'
import Link from 'next/link'

import { FileText, History as HistoryIcon, Sparkles } from 'lucide-react'

import { PageBody, PageHeader } from '@/components/app/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { ScoreDisclaimer } from '@/components/ui/score'
import { scoreBand } from '@/lib/constants'
import { formatBytes, formatDateTime, pluralize } from '@/lib/utils'
import { requirePageUser } from '@/server/auth/service'
import { listAnalyses, listGeneratedDocuments, listOptimizationRuns } from '@/server/repositories'

export const metadata: Metadata = {
  title: 'History',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function HistoryPage() {
  const user = await requirePageUser()

  const [analyses, runs, documents] = await Promise.all([
    listAnalyses(user.userId, 50),
    listOptimizationRuns(user.userId, 50),
    listGeneratedDocuments(user.userId),
  ])

  const isEmpty = analyses.length === 0 && runs.length === 0 && documents.length === 0

  return (
    <>
      <PageHeader
        title="History"
        description="Every analysis, optimization run and exported document on your account."
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
        {isEmpty ? (
          <EmptyState
            icon={<HistoryIcon className="size-5" />}
            title="Nothing here yet"
            description="Once you analyse a resume against a job description, your runs and exports will appear here."
            action={
              <Button asChild>
                <Link href="/optimize">Start an optimization</Link>
              </Button>
            }
          />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle as="h2">Analyses</CardTitle>
                <CardDescription>
                  How your resume scored against each job description.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analyses.length === 0 ? (
                  <p className="py-4 text-sm text-fg-muted">No analyses yet.</p>
                ) : (
                  <>
                    {/* A list rather than a table: it reflows on narrow screens
                        without horizontal scrolling or a hidden column. */}
                    <ul className="flex flex-col divide-y divide-line">
                      {analyses.map((analysis) => {
                        const band = scoreBand(analysis.overallScore)
                        return (
                          <li key={analysis.id}>
                            <Link
                              href={`/analysis/${analysis.id}`}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-fg">
                                  {analysis.report.counts.strong} strong ·{' '}
                                  {analysis.report.counts.partial} partial ·{' '}
                                  {analysis.report.counts.missing} missing
                                </p>
                                <p className="text-xs text-fg-subtle">
                                  {formatDateTime(analysis.createdAt)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {analysis.report.counts.requiredMissing > 0 ? (
                                  <Badge tone="warning">
                                    {analysis.report.counts.requiredMissing} required gap
                                    {analysis.report.counts.requiredMissing === 1 ? '' : 's'}
                                  </Badge>
                                ) : null}
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
                              </div>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                    <ScoreDisclaimer className="mt-4" />
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle as="h2">Optimization runs</CardTitle>
                <CardDescription>Return to any run to review or change decisions.</CardDescription>
              </CardHeader>
              <CardContent>
                {runs.length === 0 ? (
                  <p className="py-4 text-sm text-fg-muted">No optimization runs yet.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-line">
                    {runs.map((run) => (
                      <li key={run.id}>
                        <Link
                          href={`/resume/${run.resumeId}?run=${run.id}`}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-fg">
                              {run.changeSet?.changes.length ?? 0}{' '}
                              {pluralize(run.changeSet?.changes.length ?? 0, 'change')} proposed
                            </p>
                            <p className="text-xs text-fg-subtle">
                              {formatDateTime(run.createdAt)} · engine: {run.provider}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              tone={
                                run.status === 'succeeded'
                                  ? 'success'
                                  : run.status === 'failed'
                                    ? 'danger'
                                    : 'neutral'
                              }
                            >
                              {run.status}
                            </Badge>
                            {run.projectedScore !== null ? (
                              <Badge tone="accent">{run.projectedScore} projected</Badge>
                            ) : null}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle as="h2">Exported documents</CardTitle>
                <CardDescription>
                  Every file you generated. Downloads are private to your account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <p className="py-4 text-sm text-fg-muted">No documents exported yet.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-line">
                    {documents.map((document) => (
                      <li
                        key={document.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-fg">
                              {document.filename}
                            </p>
                            <p className="text-xs text-fg-subtle">
                              {formatDateTime(document.createdAt)} ·{' '}
                              {formatBytes(document.sizeBytes)}
                            </p>
                          </div>
                        </div>
                        <Button variant="secondary" size="sm" asChild>
                          <a href={`/api/documents/${document.id}/download`}>Download</a>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </PageBody>
    </>
  )
}
