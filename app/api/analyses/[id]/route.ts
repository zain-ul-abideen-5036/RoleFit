import { NextResponse } from 'next/server'

import { requireUuidParam, route } from '@/server/api/handler'
import { requireAnalysis, requireJobDescription, requireResume } from '@/server/repositories'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Full analysis detail: score breakdown, matches, gaps and recommendations. */
export const GET = route<{ id: string }>(
  async ({ params, user }) => {
    const analysis = await requireAnalysis(user.userId, requireUuidParam(params.id, 'id'))
    const [resume, jobDescription] = await Promise.all([
      requireResume(user.userId, analysis.resumeId),
      requireJobDescription(user.userId, analysis.jobDescriptionId),
    ])

    return NextResponse.json({
      analysis: {
        id: analysis.id,
        overallScore: analysis.overallScore,
        report: analysis.report,
        atsReport: analysis.atsReport,
        createdAt: analysis.createdAt,
      },
      resume: { id: resume.id, title: resume.title, profile: resume.profile },
      jobDescription: {
        id: jobDescription.id,
        title: jobDescription.title,
        company: jobDescription.company,
        profile: jobDescription.profile,
      },
    })
  },
  { rateLimit: 'api:read' },
)
