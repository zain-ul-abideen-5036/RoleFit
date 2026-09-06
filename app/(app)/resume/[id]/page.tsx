import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Eye, FileText } from 'lucide-react'

import { PageBody, PageHeader } from '@/components/app/app-shell'
import { ChangeReview, type ReviewChange } from '@/components/app/change-review'
import { ResumeDocument } from '@/components/app/resume-document'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { activeCapabilities } from '@/lib/ai'
import { AppError } from '@/lib/errors'
import { formatDate, pluralize } from '@/lib/utils'
import { requireUser } from '@/server/auth/service'
import {
  latestRunForResume,
  listChangeRecords,
  listResumeVersions,
  requireAnalysis,
  requireOptimizationRun,
  requireResume,
} from '@/server/repositories'
import { buildDecidedProfile } from '@/server/services/optimization-service'

export const metadata: Metadata = {
  title: 'Resume',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function ResumePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ run?: string }>
}) {
  const { id } = await params
  const { run: runParam } = await searchParams
  const user = await requireUser()

  let resume
  try {
    resume = await requireResume(user.userId, id)
  } catch (error) {
    if (AppError.isAppError(error) && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const versions = await listResumeVersions(user.userId, resume.id)

  // Prefer the run named in the URL; otherwise show the most recent one.
  const run = runParam
    ? await requireOptimizationRun(user.userId, runParam).catch(() => null)
    : await latestRunForResume(user.userId, resume.id)

  if (!run || run.status !== 'succeeded') {
    return (
      <>
        <PageHeader
          title={resume.title}
          description={`Uploaded ${formatDate(resume.createdAt)} · ${resume.sourceFormat.toUpperCase()}`}
          breadcrumb={{ href: '/dashboard', label: 'Dashboard' }}
          actions={
            <Button variant="secondary" asChild>
              <Link href={`/resume/${resume.id}/preview`}>
                <Eye className="size-4" aria-hidden="true" />
                Preview
              </Link>
            </Button>
          }
        />
        <PageBody className="flex flex-col gap-6">
          <EmptyState
            icon={<FileText className="size-5" />}
            title="No optimization has been run for this resume yet"
            description="Run an optimization against a job description to see proposed changes side by side with your original."
            action={
              <Button asChild>
                <Link href="/optimize">Start an optimization</Link>
              </Button>
            }
          />
          <ResumeDocument profile={resume.profile} title="Your resume as parsed" />
        </PageBody>
      </>
    )
  }

  const [changeRecords, analysis, decided] = await Promise.all([
    listChangeRecords(user.userId, run.id),
    requireAnalysis(user.userId, run.analysisId),
    buildDecidedProfile(user.userId, run.id),
  ])

  const changeSet = run.changeSet
  const byPath = new Map((changeSet?.changes ?? []).map((change) => [change.targetPath, change]))

  const changes: ReviewChange[] = changeRecords.map((record) => ({
    id: record.id,
    targetPath: record.targetPath,
    section: record.section,
    action: record.action,
    before: record.beforeText,
    after: record.afterText,
    rationale: record.rationale,
    evidence:
      byPath.get(record.targetPath)?.evidence.map((entry) => entry.excerpt) ?? record.evidence,
    decision: record.decision,
    editedText: record.editedText,
  }))

  return (
    <>
      <PageHeader
        title={resume.title}
        description={`Optimization run ${formatDate(run.createdAt)} · ${changes.length} ${pluralize(changes.length, 'change')} proposed`}
        breadcrumb={{ href: '/dashboard', label: 'Dashboard' }}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href={`/analysis/${run.analysisId}`}>View analysis</Link>
            </Button>
            <Button asChild>
              <Link href={`/resume/${resume.id}/preview?run=${run.id}`}>
                <Eye className="size-4" aria-hidden="true" />
                Preview &amp; export
              </Link>
            </Button>
          </>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <ChangeReview
          runId={run.id}
          resumeId={resume.id}
          changes={changes}
          unaddressed={changeSet?.unaddressedRequirements ?? []}
          baselineScore={analysis.overallScore}
          projectedScore={run.projectedScore ?? analysis.overallScore}
          provider={run.provider}
          canRewriteProse={activeCapabilities().canRewriteProse}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <ResumeDocument profile={resume.profile} title="Original" />
          <ResumeDocument
            profile={decided.profile}
            title="With your decisions applied"
            highlighted
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Version history</CardTitle>
            <CardDescription>
              Version 1 is always your original upload, kept untouched.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-line">
              {versions.map((version) => (
                <li key={version.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{version.label}</p>
                    <p className="text-xs text-fg-subtle">{formatDate(version.createdAt)}</p>
                  </div>
                  <Badge tone={version.versionNumber === 1 ? 'accent' : 'neutral'}>
                    v{version.versionNumber}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </PageBody>
    </>
  )
}
