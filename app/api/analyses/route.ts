import { NextResponse } from 'next/server'
import { z } from 'zod'

import { JOB_DESCRIPTION } from '@/lib/constants'
import { parseJsonBody, route } from '@/server/api/handler'
import { listAnalyses } from '@/server/repositories'
import { createAnalysisForResume } from '@/server/services/analysis-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const createAnalysisSchema = z.object({
  resumeId: z.string().uuid('Choose a resume to analyze.'),
  jobDescriptionText: z
    .string()
    .trim()
    .min(JOB_DESCRIPTION.minLength, 'Paste the full job description.')
    .max(JOB_DESCRIPTION.maxLength, 'That job description is too long.'),
  jobTitle: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
})

/** Runs a deterministic analysis of a resume against a job description. */
export const POST = route(
  async ({ request, user }) => {
    const input = await parseJsonBody(request, createAnalysisSchema)

    const { analysis, jobDescription } = await createAnalysisForResume({
      userId: user.userId,
      resumeId: input.resumeId,
      jobDescriptionText: input.jobDescriptionText,
      jobTitle: input.jobTitle,
      company: input.company,
    })

    return NextResponse.json(
      {
        analysis: {
          id: analysis.id,
          resumeId: analysis.resumeId,
          jobDescriptionId: analysis.jobDescriptionId,
          overallScore: analysis.overallScore,
          report: analysis.report,
          atsReport: analysis.atsReport,
          createdAt: analysis.createdAt,
        },
        jobDescription: {
          id: jobDescription.id,
          title: jobDescription.title,
          company: jobDescription.company,
        },
      },
      { status: 201 },
    )
  },
  { rateLimit: 'analysis:create' },
)

/** Lists the caller's analyses, newest first. */
export const GET = route(
  async ({ user }) => {
    const rows = await listAnalyses(user.userId)
    return NextResponse.json({
      analyses: rows.map((analysis) => ({
        id: analysis.id,
        resumeId: analysis.resumeId,
        overallScore: analysis.overallScore,
        createdAt: analysis.createdAt,
        counts: analysis.report.counts,
      })),
    })
  },
  { rateLimit: 'api:read' },
)
