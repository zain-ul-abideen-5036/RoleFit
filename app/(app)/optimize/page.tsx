import type { Metadata } from 'next'

import { PageBody, PageHeader } from '@/components/app/app-shell'
import { OptimizeWizard } from '@/components/app/optimize-wizard'
import { requirePageUser } from '@/server/auth/service'
import { listResumes } from '@/server/repositories'

export const metadata: Metadata = {
  title: 'Optimize a resume',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function OptimizePage() {
  const user = await requirePageUser()
  const resumes = await listResumes(user.userId, 12)

  return (
    <>
      <PageHeader
        title="Optimize a resume"
        description="Upload a resume and paste the job description. You will see exactly where you match before anything is rewritten."
      />
      <PageBody>
        <OptimizeWizard
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
