import { NextResponse } from 'next/server'

import { UPLOAD } from '@/lib/constants'
import { AppError, ERROR_CODES } from '@/lib/errors'
import { route } from '@/server/api/handler'
import { listResumes } from '@/server/repositories'
import { ingestResume } from '@/server/services/resume-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Lists the caller's resumes. Never returns another user's rows. */
export const GET = route(
  async ({ user }) => {
    const resumes = await listResumes(user.userId)

    // Raw text and the full parsed profile are deliberately omitted from the
    // list response: it is rendered in a table and the payload would otherwise
    // carry every user's complete resume over the wire on a dashboard load.
    return NextResponse.json({
      resumes: resumes.map((resume) => ({
        id: resume.id,
        title: resume.title,
        originalFilename: resume.originalFilename,
        sourceFormat: resume.sourceFormat,
        sizeBytes: resume.sizeBytes,
        createdAt: resume.createdAt,
        experienceCount: resume.profile.experience.length,
        skillCount: resume.profile.skills.reduce((sum, group) => sum + group.items.length, 0),
      })),
    })
  },
  { rateLimit: 'api:read' },
)

/**
 * Uploads and parses a resume.
 *
 * Accepts multipart/form-data with a `file` field. The declared content type is
 * treated as a hint only — the byte signature decides.
 */
export const POST = route(
  async ({ request, user }) => {
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
        message: 'Upload the file as form data.',
      })
    }

    const file = form.get('file')
    if (!(file instanceof File)) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
        fieldErrors: { file: ['Choose a PDF or DOCX file to upload.'] },
      })
    }

    if (file.size > UPLOAD.maxBytes) {
      throw new AppError(ERROR_CODES.PAYLOAD_TOO_LARGE, {
        message: `That file is larger than ${UPLOAD.maxBytesLabel}. Please upload a smaller document.`,
      })
    }

    const title = form.get('title')
    const bytes = new Uint8Array(await file.arrayBuffer())

    const { resume, deduplicated } = await ingestResume({
      userId: user.userId,
      bytes,
      filename: file.name,
      declaredMimeType: file.type,
      title: typeof title === 'string' ? title : undefined,
    })

    return NextResponse.json(
      {
        resume: {
          id: resume.id,
          title: resume.title,
          originalFilename: resume.originalFilename,
          sourceFormat: resume.sourceFormat,
          createdAt: resume.createdAt,
          profile: resume.profile,
        },
        deduplicated,
      },
      { status: deduplicated ? 200 : 201 },
    )
  },
  { rateLimit: 'resume:upload' },
)
