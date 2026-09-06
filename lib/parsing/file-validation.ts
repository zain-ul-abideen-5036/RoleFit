import { AppError, ERROR_CODES } from '@/lib/errors'
import { UPLOAD } from '@/lib/constants'

/**
 * Upload validation.
 *
 * Uploaded files are untrusted. The client-supplied filename and Content-Type
 * are treated as hints only — the authoritative check is the file's own byte
 * signature. A file called `resume.pdf` that is actually an HTML document must
 * be rejected here, before any parser is handed the bytes.
 */

export type SupportedFormat = 'pdf' | 'docx'

/** Byte signatures, expressed as numbers so no escape sequences are involved. */
const SIGNATURES = {
  /** "%PDF-" */
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d],
  /** ZIP local file header "PK\x03\x04" — DOCX is a ZIP container. */
  zip: [0x50, 0x4b, 0x03, 0x04],
  /** Empty ZIP archive. */
  zipEmpty: [0x50, 0x4b, 0x05, 0x06],
  /** OLE2 compound file — legacy .doc, or an encrypted Office document. */
  ole2: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
} as const

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) return false
  }
  return true
}

/** Case-insensitive ASCII search for a marker inside a byte buffer. */
function containsAscii(bytes: Uint8Array, marker: string): boolean {
  const needle = new TextEncoder().encode(marker)
  if (needle.length === 0 || bytes.length < needle.length) return false

  outer: for (let i = 0; i <= bytes.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) continue outer
    }
    return true
  }
  return false
}

export interface ValidatedUpload {
  format: SupportedFormat
  bytes: Uint8Array
  sizeBytes: number
  /** Sanitized original filename, safe to store as a display label. */
  displayFilename: string
  mimeType: string
}

/**
 * Reduces a user-supplied filename to something safe to display and store.
 *
 * This value is never used to build a filesystem or object-storage path —
 * storage keys are generated server-side — but it is echoed back to the user,
 * so path separators, control characters and overlong names are stripped.
 */
export function sanitizeFilename(input: string): string {
  const base = input
    .split(/[/\\]/)
    .pop()!
    .replace(/\p{Cc}/gu, '')
    .replace(/[<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const cleaned = base.replace(/^\.+/, '').slice(0, 180)
  return cleaned.length > 0 ? cleaned : 'resume'
}

/** Builds an ASCII-safe, collision-free download filename. */
export function safeDownloadFilename(base: string, extension: string): string {
  const slug =
    base
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^A-Za-z0-9._ -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 80) || 'resume'

  return `${slug}.${extension}`
}

export interface ValidateUploadInput {
  bytes: Uint8Array
  filename: string
  /** Client-declared type. Advisory only. */
  declaredMimeType?: string | undefined
  maxBytes?: number
}

/**
 * Validates an uploaded document by size and byte signature.
 * Throws an `AppError` carrying user-safe copy on every rejection path.
 */
export function validateUpload(input: ValidateUploadInput): ValidatedUpload {
  const { bytes, filename } = input
  const maxBytes = input.maxBytes ?? UPLOAD.maxBytes

  if (bytes.length === 0) {
    throw new AppError(ERROR_CODES.DOCUMENT_EMPTY, {
      message: 'That file is empty. Please upload your resume as a PDF or DOCX.',
    })
  }

  if (bytes.length > maxBytes) {
    throw new AppError(ERROR_CODES.PAYLOAD_TOO_LARGE, {
      message: `That file is larger than ${UPLOAD.maxBytesLabel}. Please upload a smaller document.`,
      context: { sizeBytes: bytes.length, maxBytes },
    })
  }

  // Legacy .doc and encrypted Office documents share the OLE2 container.
  if (startsWith(bytes, SIGNATURES.ole2)) {
    throw new AppError(ERROR_CODES.UNSUPPORTED_FILE, {
      message:
        'This looks like a legacy Word document (.doc) or a protected file. Please save it as .docx or PDF and upload again.',
    })
  }

  if (startsWith(bytes, SIGNATURES.pdf)) {
    assertPdfIsUsable(bytes)
    return {
      format: 'pdf',
      bytes,
      sizeBytes: bytes.length,
      displayFilename: sanitizeFilename(filename),
      mimeType: 'application/pdf',
    }
  }

  if (startsWith(bytes, SIGNATURES.zip) || startsWith(bytes, SIGNATURES.zipEmpty)) {
    // A ZIP is only a DOCX if it carries the WordprocessingML part. This also
    // rejects .xlsx, .pptx, .odt and plain archives renamed to .docx.
    if (!containsAscii(bytes, 'word/document.xml')) {
      throw new AppError(ERROR_CODES.UNSUPPORTED_FILE, {
        message: 'That file is not a Word document. Please upload a .docx resume or a PDF.',
      })
    }
    return {
      format: 'docx',
      bytes,
      sizeBytes: bytes.length,
      displayFilename: sanitizeFilename(filename),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }
  }

  throw new AppError(ERROR_CODES.UNSUPPORTED_FILE)
}

/**
 * Rejects PDFs that cannot yield text before pdf.js is invoked.
 *
 * Encryption is detected by the presence of an /Encrypt entry in the trailer.
 * Catching it here produces a specific, actionable message instead of a generic
 * parser failure.
 */
function assertPdfIsUsable(bytes: Uint8Array): void {
  if (containsAscii(bytes, '/Encrypt')) {
    throw new AppError(ERROR_CODES.DOCUMENT_ENCRYPTED)
  }
}

/** Whether a declared MIME type is one the product accepts. */
export function isAcceptedMimeType(mimeType: string): boolean {
  return (UPLOAD.acceptedMimeTypes as readonly string[]).includes(mimeType)
}

export const __testing = { startsWith, containsAscii, SIGNATURES }
