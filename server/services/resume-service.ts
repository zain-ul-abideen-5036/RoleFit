import 'server-only'

import { createHash } from 'node:crypto'

import type { SourceDocumentSignals } from '@/lib/ats/types'
import { UPLOAD } from '@/lib/constants'
import type { ResumeProfile } from '@/lib/domain/types'
import { AppError, ERROR_CODES } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { extractDocx } from '@/lib/parsing/docx'
import { sanitizeFilename, validateUpload } from '@/lib/parsing/file-validation'
import { extractPdf } from '@/lib/parsing/pdf'
import { parseResumeText } from '@/lib/parsing/resume-parser'
import { RESUME_TEXT } from '@/lib/constants'
import { buildStorageKey, getStorage } from '@/lib/storage'
import { createResume, findResumeByHash, type CreateResumeInput } from '@/server/repositories'
import type { Resume } from '@/db/schema'

/**
 * Resume ingestion.
 *
 * Order matters: validate the bytes, extract text, confirm the text is usable,
 * parse it, and only then store anything. A document that cannot be read never
 * reaches storage or the database, so a failed upload leaves nothing behind.
 */

export interface IngestResumeInput {
  userId: string
  bytes: Uint8Array
  filename: string
  declaredMimeType?: string | undefined
  /** Optional user-supplied label. Defaults to the filename. */
  title?: string | undefined
}

export interface IngestResumeResult {
  resume: Resume
  signals: SourceDocumentSignals
  /** True when this exact file was already uploaded and was reused. */
  deduplicated: boolean
}

export async function ingestResume(input: IngestResumeInput): Promise<IngestResumeResult> {
  const validated = validateUpload({
    bytes: input.bytes,
    filename: input.filename,
    declaredMimeType: input.declaredMimeType,
    maxBytes: UPLOAD.maxBytes,
  })

  const contentHash = createHash('sha256').update(validated.bytes).digest('hex')

  // Re-uploading the same file returns the existing record rather than
  // creating a duplicate the user then has to tell apart in their history.
  const existing = await findResumeByHash(input.userId, contentHash)
  if (existing) {
    logger.info('resume.duplicate_upload_reused', { userId: input.userId, resumeId: existing.id })
    return {
      resume: existing,
      signals: {
        multiColumnSuspected: false,
        tableCount: 0,
        imageCount: 0,
        textBoxCount: 0,
        extractedCharacters: existing.rawText.length,
        pageCount: null,
      },
      deduplicated: true,
    }
  }

  const extraction =
    validated.format === 'pdf'
      ? await extractPdf(validated.bytes)
      : await extractDocx(validated.bytes)

  if (extraction.text.length < RESUME_TEXT.minLength) {
    throw new AppError(ERROR_CODES.DOCUMENT_EMPTY, {
      message:
        'We could only read a small amount of text from that file. If it is a scanned image, please upload a text-based PDF or DOCX instead.',
      context: { extractedCharacters: extraction.text.length },
    })
  }

  const profile: ResumeProfile = parseResumeText(extraction.text)

  // Store the original so the user can always retrieve exactly what they
  // uploaded. Failure here is not fatal: the parsed content is what the product
  // works from, and losing the original copy should not lose the upload.
  const storageKey = buildStorageKey('uploads', input.userId, validated.format)
  try {
    await getStorage().put(storageKey, validated.bytes, validated.mimeType)
  } catch (error) {
    logger.error('resume.original_store_failed', { userId: input.userId, error })
  }

  const record: CreateResumeInput = {
    userId: input.userId,
    title: (input.title?.trim() || stripExtension(validated.displayFilename)).slice(0, 200),
    originalFilename: validated.displayFilename,
    sourceFormat: validated.format,
    sizeBytes: validated.sizeBytes,
    contentHash,
    rawText: extraction.text,
    profile,
  }

  const resume = await createResume(record)

  logger.info('resume.ingested', {
    userId: input.userId,
    resumeId: resume.id,
    format: validated.format,
    sizeBytes: validated.sizeBytes,
    experienceEntries: profile.experience.length,
    skillCount: profile.skills.reduce((sum, group) => sum + group.items.length, 0),
  })

  return { resume, signals: extraction.signals, deduplicated: false }
}

function stripExtension(filename: string): string {
  return sanitizeFilename(filename).replace(/\.(pdf|docx)$/i, '')
}
