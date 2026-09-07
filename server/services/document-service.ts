import 'server-only'

import type { GeneratedDocument } from '@/db/schema'
import { DOCX_MIME_TYPE, generateDocx } from '@/lib/documents/docx'
import { PDF_MIME_TYPE, generatePdf } from '@/lib/documents/pdf'
import { validateGeneratedDocument } from '@/lib/documents/validate'
import type { ResumeProfile } from '@/lib/domain/types'
import { AppError, ERROR_CODES } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { safeDownloadFilename } from '@/lib/parsing/file-validation'
import { buildStorageKey, getStorage } from '@/lib/storage'
import {
  createGeneratedDocument,
  createResumeVersion,
  recordUsage,
  requireGeneratedDocument,
  requireResume,
} from '@/server/repositories'
import { buildDecidedProfile } from '@/server/services/optimization-service'

/**
 * Document generation and delivery.
 *
 * Every generated file is verified before it is stored: re-opened, its text
 * read back, and checked for the sections it should contain. A file that fails
 * verification is never persisted and never offered for download — a broken
 * resume reaching an employer is the worst outcome this product has.
 */

export type DocumentFormat = 'pdf' | 'docx'

export interface GenerateDocumentInput {
  userId: string
  /** Generate from a completed optimization run's accepted changes… */
  runId?: string
  /** …or directly from a resume's current content. */
  resumeId?: string
  format: DocumentFormat
}

export interface GenerateDocumentResult {
  document: GeneratedDocument
  warnings: string[]
}

export async function generateDocument(
  input: GenerateDocumentInput,
): Promise<GenerateDocumentResult> {
  const startedAt = Date.now()

  const { profile, resumeId, label } = await resolveSource(input)

  const bytes = input.format === 'pdf' ? await generatePdf(profile) : await generateDocx(profile)

  const validation = await validateGeneratedDocument({ bytes, format: input.format, profile })

  if (!validation.valid) {
    logger.error('document.validation_failed', {
      userId: input.userId,
      format: input.format,
      issues: validation.issues.map((issue) => issue.code),
    })
    throw new AppError(ERROR_CODES.DOCUMENT_GENERATION_FAILED, {
      context: { issues: validation.issues.map((issue) => issue.code) },
    })
  }

  const mimeType = input.format === 'pdf' ? PDF_MIME_TYPE : DOCX_MIME_TYPE
  const storageKey = buildStorageKey('generated', input.userId, input.format)
  const stored = await getStorage().put(storageKey, bytes, mimeType)

  const baseName = profile.personal.fullName
    ? `${profile.personal.fullName} Resume`
    : `${label} Resume`

  // A version snapshot is written alongside the file so the exact content a
  // user downloaded can always be reconstructed later.
  const version = await createResumeVersion({
    userId: input.userId,
    resumeId,
    label,
    profile,
    optimizationRunId: input.runId ?? null,
  })

  const document = await createGeneratedDocument({
    userId: input.userId,
    resumeId,
    resumeVersionId: version.id,
    kind: input.format === 'pdf' ? 'generated_pdf' : 'generated_docx',
    storageKey: stored.key,
    filename: safeDownloadFilename(baseName, input.format),
    mimeType,
    sizeBytes: stored.sizeBytes,
    checksum: stored.checksum,
    validation: {
      extractedCharacters: validation.extractedCharacters,
      pageCount: validation.pageCount,
      textIsExtractable: validation.textIsExtractable,
      warnings: validation.issues.filter((issue) => issue.severity === 'warning'),
    },
  })

  await recordUsage({
    userId: input.userId,
    kind: 'document_export',
    provider: 'local',
    durationMs: Date.now() - startedAt,
  })

  logger.info('document.generated', {
    userId: input.userId,
    documentId: document.id,
    format: input.format,
    sizeBytes: stored.sizeBytes,
    pageCount: validation.pageCount,
    durationMs: Date.now() - startedAt,
  })

  return {
    document,
    warnings: validation.issues
      .filter((issue) => issue.severity === 'warning')
      .map((issue) => issue.message),
  }
}

async function resolveSource(
  input: GenerateDocumentInput,
): Promise<{ profile: ResumeProfile; resumeId: string; label: string }> {
  if (input.runId) {
    const { run, profile } = await buildDecidedProfile(input.userId, input.runId)
    return { profile, resumeId: run.resumeId, label: 'Optimized' }
  }

  if (input.resumeId) {
    const resume = await requireResume(input.userId, input.resumeId)
    return { profile: resume.profile, resumeId: resume.id, label: resume.title }
  }

  throw new AppError('VALIDATION_FAILED', {
    message: 'Specify which resume or optimization to export.',
  })
}

/* ==========================================================================
   Delivery
   ========================================================================== */

export interface DocumentDownload {
  bytes: Uint8Array
  filename: string
  mimeType: string
}

/**
 * Loads a document's bytes for an authenticated download.
 *
 * Ownership is verified through the repository before storage is touched, and
 * the stored checksum is re-verified on read so a corrupted object is caught
 * rather than delivered.
 */
export async function loadDocumentForDownload(
  userId: string,
  documentId: string,
): Promise<DocumentDownload> {
  const document = await requireGeneratedDocument(userId, documentId)
  const bytes = await getStorage().get(document.storageKey)

  const { checksumOf } = await import('@/lib/storage')
  if (checksumOf(bytes) !== document.checksum) {
    logger.error('document.checksum_mismatch', { userId, documentId })
    throw new AppError(ERROR_CODES.STORAGE_FAILURE, {
      message: 'That file could not be verified. Please generate it again.',
    })
  }

  return { bytes, filename: document.filename, mimeType: document.mimeType }
}

/**
 * A direct URL for the browser, where the storage driver supports one.
 * Returns null for the local driver, whose objects stream through the app.
 */
export async function documentSignedUrl(
  userId: string,
  documentId: string,
): Promise<string | null> {
  const document = await requireGeneratedDocument(userId, documentId)
  return getStorage().signedUrl(document.storageKey, document.filename, document.mimeType)
}
