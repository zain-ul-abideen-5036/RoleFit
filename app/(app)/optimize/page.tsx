import type { Metadata } from 'next'

import { OptimizeWizard } from '@/components/app/optimize-wizard'
import { PageBody, PageHeader } from '@/components/ui/layout'
import { requirePageUser } from '@/server/auth/service'
import { listResumes } from '@/server/repositories'

export const metadata: Metadata = {
  title: 'Optimize a resume',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * The wizard, optionally aimed at a resume already on the account.
 *
 * `?resume=<id>` preselects it. The analysis screen's "Optimize this resume"
 * used to link here bare, so a button naming a specific document dropped the
 * user at an empty step 1 and asked them which document they meant — a label
 * making a promise the link did not keep.
 *
 * The id is validated against the account's own resumes rather than trusted:
 * it arrives from the URL, and preselecting an id this user does not own would
 * be a (harmless, but real) information leak about which ids exist.
 */
export default async function OptimizePage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string }>
}) {
  const user = await requirePageUser()
  const [{ resume: requestedResumeId }, resumes] = await Promise.all([
    searchParams,
    listResumes(user.userId, 12),
  ])

  const preselected = resumes.some((resume) => resume.id === requestedResumeId)
    ? requestedResumeId
    : undefined

  return (
    <>
      <PageHeader
        title="Optimize a resume"
        description="Upload a resume and paste the job description. You will see exactly where you match before anything is rewritten."
      />
      <PageBody>
        <OptimizeWizard
          {...(preselected ? { initialResumeId: preselected } : {})}
          existingResumes={resumes.map((resume) => ({
            id: resume.id,
            title: resume.title,
            originalFilename: resume.originalFilename,
            sourceFormat: resume.sourceFormat,
            createdAt: resume.createdAt.toISOString(),
            experienceCount: resume.profile.experience.length,
            skillCount: resume.profile.skills.reduce((sum, group) => sum + group.items.length, 0),
          }))}
        />
      </PageBody>
    </>
  )
}
