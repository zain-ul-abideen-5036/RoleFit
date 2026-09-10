import type { Metadata } from 'next'
import Link from 'next/link'

import { History as HistoryIcon, Sparkles } from 'lucide-react'

import { HistoryView } from '@/components/app/history-view'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { PageBody, PageHeader } from '@/components/ui/layout'
import { requirePageUser } from '@/server/auth/service'
import {
  listAnalysesWithContext,
  listGeneratedDocuments,
  listOptimizationRunsWithContext,
} from '@/server/repositories'

export const metadata: Metadata = {
  title: 'History',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function HistoryPage() {
  const user = await requirePageUser()

  const [analyses, runs, documents] = await Promise.all([
    listAnalysesWithContext(user.userId, 50),
    listOptimizationRunsWithContext(user.userId, 50),
    listGeneratedDocuments(user.userId),
  ])

  const isEmpty = analyses.length === 0 && runs.length === 0 && documents.length === 0

  return (
    <>
      <PageHeader
        title="History"
        description="Every analysis, optimization run and exported document on your account."
        actions={
          /*
            Hidden from `md` up, where the sidebar carries this exact button —
            same label, same icon, same destination, a hand's width apart.
            Below `md` the sidebar is behind the drawer, so here it is the only
            way to start a run and it stays.
          */
          <Button className="md:hidden" asChild>
            <Link href="/optimize">
              <Sparkles className="size-4" aria-hidden="true" />
              New optimization
            </Link>
          </Button>
        }
      />

      <PageBody>
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
          <HistoryView
            analyses={analyses.map((analysis) => ({
              id: analysis.id,
              createdAt: analysis.createdAt,
              overallScore: analysis.overallScore,
              jobTitle: analysis.jobTitle,
              company: analysis.company,
              resumeTitle: analysis.resumeTitle,
              strong: analysis.report.counts.strong,
              partial: analysis.report.counts.partial,
              missing: analysis.report.counts.missing,
              requiredMissing: analysis.report.counts.requiredMissing,
            }))}
            runs={runs.map((run) => ({
              id: run.id,
              resumeId: run.resumeId,
              createdAt: run.createdAt,
              status: run.status,
              provider: run.provider,
              baselineScore: run.baselineScore,
              projectedScore: run.projectedScore,
              changeCount: run.changeCount,
              jobTitle: run.jobTitle,
              company: run.company,
              resumeTitle: run.resumeTitle,
            }))}
            documents={documents.map((document) => ({
              id: document.id,
              filename: document.filename,
              createdAt: document.createdAt,
              sizeBytes: document.sizeBytes,
              kind: document.kind,
            }))}
          />
        )}
      </PageBody>
    </>
  )
}
