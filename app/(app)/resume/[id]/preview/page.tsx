import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ExportBar } from '@/components/app/export-bar'
import { ResumeDocument } from '@/components/app/resume-document'
import { PageBody, PageHeader, Stack } from '@/components/ui/layout'
import { AppError } from '@/lib/errors'
import { requirePageUser } from '@/server/auth/service'
import { latestRunForResume, requireOptimizationRun, requireResume } from '@/server/repositories'
import { buildDecidedProfile } from '@/server/services/optimization-service'

export const metadata: Metadata = {
  title: 'Preview',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * Print / export preview.
 *
 * Renders the resume at document proportions from the same layout model the
 * PDF and DOCX renderers use, so what is on screen is what gets exported. The
 * page is print-styled: `Ctrl/Cmd+P` produces a clean sheet with the app chrome
 * removed.
 */
export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ run?: string }>
}) {
  const { id } = await params
  const { run: runParam } = await searchParams
  const user = await requirePageUser()

  let resume
  try {
    resume = await requireResume(user.userId, id)
  } catch (error) {
    if (AppError.isAppError(error) && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const run = runParam
    ? await requireOptimizationRun(user.userId, runParam).catch(() => null)
    : await latestRunForResume(user.userId, resume.id)

  // With a completed run, preview the resume as the user's decisions leave it;
  // otherwise preview the original as parsed.
  const profile =
    run && run.status === 'succeeded'
      ? (await buildDecidedProfile(user.userId, run.id)).profile
      : resume.profile

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Preview"
          description={
            run
              ? 'Your resume with the changes you accepted. This is exactly what will be exported.'
              : 'Your resume as uploaded and parsed.'
          }
          breadcrumbs={[
            { href: '/dashboard', label: 'Dashboard' },
            { href: `/resume/${resume.id}`, label: resume.title },
            { href: `/resume/${resume.id}/preview`, label: 'Preview' },
          ]}
        />
      </div>

      <PageBody>
        <Stack gap="md">
          <div className="no-print">
            <ExportBar resumeId={resume.id} runId={run?.status === 'succeeded' ? run.id : null} />
          </div>

          <ResumeDocument profile={profile} paper />
        </Stack>
      </PageBody>
    </>
  )
}
