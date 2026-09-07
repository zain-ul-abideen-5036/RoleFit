import { NextResponse } from 'next/server'
import { z } from 'zod'

import { parseJsonBody, route } from '@/server/api/handler'
import { listGeneratedDocuments } from '@/server/repositories'
import { generateDocument } from '@/server/services/document-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const generateSchema = z
  .object({
    format: z.enum(['pdf', 'docx']),
    runId: z.string().uuid().optional(),
    resumeId: z.string().uuid().optional(),
  })
  .refine((value) => Boolean(value.runId ?? value.resumeId), {
    message: 'Specify either an optimization run or a resume.',
    path: ['runId'],
  })

/** Generates, verifies and stores a resume document. */
export const POST = route(
  async ({ request, user }) => {
    const input = await parseJsonBody(request, generateSchema)

    const { document, warnings } = await generateDocument({
      userId: user.userId,
      format: input.format,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.resumeId ? { resumeId: input.resumeId } : {}),
    })

    return NextResponse.json(
      {
        document: {
          id: document.id,
          filename: document.filename,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          kind: document.kind,
          createdAt: document.createdAt,
          downloadUrl: `/api/documents/${document.id}/download`,
        },
        warnings,
      },
      { status: 201 },
    )
  },
  { rateLimit: 'document:generate' },
)

/** Lists generated documents, optionally filtered to one resume. */
export const GET = route(
  async ({ request, user }) => {
    const resumeId = new URL(request.url).searchParams.get('resumeId') ?? undefined
    const documents = await listGeneratedDocuments(user.userId, resumeId)

    return NextResponse.json({
      documents: documents.map((document) => ({
        id: document.id,
        resumeId: document.resumeId,
        filename: document.filename,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        kind: document.kind,
        createdAt: document.createdAt,
        downloadUrl: `/api/documents/${document.id}/download`,
      })),
    })
  },
  { rateLimit: 'api:read' },
)
