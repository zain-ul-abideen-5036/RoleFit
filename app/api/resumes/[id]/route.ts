import { NextResponse } from 'next/server'

import { requireUuidParam, route } from '@/server/api/handler'
import { listResumeVersions, requireResume, softDeleteResume } from '@/server/repositories'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Returns one resume with its version history. 404s for another user's row. */
export const GET = route<{ id: string }>(
  async ({ params, user }) => {
    const resumeId = requireUuidParam(params.id, 'id')
    const resume = await requireResume(user.userId, resumeId)
    const versions = await listResumeVersions(user.userId, resumeId)

    return NextResponse.json({
      resume: {
        id: resume.id,
        title: resume.title,
        originalFilename: resume.originalFilename,
        sourceFormat: resume.sourceFormat,
        sizeBytes: resume.sizeBytes,
        createdAt: resume.createdAt,
        profile: resume.profile,
      },
      versions: versions.map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        label: version.label,
        createdAt: version.createdAt,
      })),
    })
  },
  { rateLimit: 'api:read' },
)

/** Soft-deletes a resume so it disappears from the product immediately. */
export const DELETE = route<{ id: string }>(async ({ params, user }) => {
  await softDeleteResume(user.userId, requireUuidParam(params.id, 'id'))
  return NextResponse.json({ ok: true })
})
