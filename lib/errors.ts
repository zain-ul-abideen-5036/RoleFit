/**
 * Application error taxonomy.
 *
 * Every failure that reaches an API boundary is converted to an `AppError`.
 * The contract is deliberate: `message` is written for the end user and is safe
 * to render; `cause` and `context` never leave the server and exist only for
 * logs. Parser stack traces, SQL text and provider payloads must never appear
 * in an HTTP response body.
 */

export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_FILE: 'UNSUPPORTED_FILE',
  DOCUMENT_UNREADABLE: 'DOCUMENT_UNREADABLE',
  DOCUMENT_ENCRYPTED: 'DOCUMENT_ENCRYPTED',
  DOCUMENT_EMPTY: 'DOCUMENT_EMPTY',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  AI_INVALID_OUTPUT: 'AI_INVALID_OUTPUT',
  STORAGE_FAILURE: 'STORAGE_FAILURE',
  DOCUMENT_GENERATION_FAILED: 'DOCUMENT_GENERATION_FAILED',
  INTERNAL: 'INTERNAL',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_FILE: 415,
  DOCUMENT_UNREADABLE: 422,
  DOCUMENT_ENCRYPTED: 422,
  DOCUMENT_EMPTY: 422,
  AI_UNAVAILABLE: 503,
  AI_INVALID_OUTPUT: 502,
  STORAGE_FAILURE: 502,
  DOCUMENT_GENERATION_FAILED: 500,
  INTERNAL: 500,
}

/**
 * Default user-facing copy. Written to be actionable and to never hint at
 * internal implementation.
 */
const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Some of the information provided was not valid. Please review and try again.',
  UNAUTHENTICATED: 'Please sign in to continue.',
  FORBIDDEN: 'You do not have access to this resource.',
  NOT_FOUND: 'We could not find what you were looking for.',
  CONFLICT: 'That action conflicts with the current state of your account.',
  RATE_LIMITED: 'You have made too many requests. Please wait a moment and try again.',
  PAYLOAD_TOO_LARGE: 'That file is too large. Please upload a smaller document.',
  UNSUPPORTED_FILE: 'That file type is not supported. Please upload a PDF or DOCX file.',
  DOCUMENT_UNREADABLE:
    'Your resume could not be read. Please try exporting it again as a PDF or DOCX and re-uploading.',
  DOCUMENT_ENCRYPTED:
    'This document is password protected. Please remove the password and upload it again.',
  DOCUMENT_EMPTY:
    'We could not find any readable text in that document. If it is a scanned image, please upload a text-based PDF or DOCX instead.',
  AI_UNAVAILABLE: 'The optimization service is temporarily unavailable. Please try again shortly.',
  AI_INVALID_OUTPUT:
    'We could not produce a reliable result for this resume. Nothing was changed — please try again.',
  STORAGE_FAILURE: 'We could not save your document. Please try again.',
  DOCUMENT_GENERATION_FAILED:
    'We could not generate your document. Your optimized content has been saved — please try downloading again.',
  INTERNAL: 'Something went wrong on our end. Please try again.',
}

export interface AppErrorOptions {
  /** Overrides the default user-facing copy for this code. */
  message?: string
  /** Server-only diagnostic context. Never serialized to the client. */
  context?: Record<string, unknown>
  cause?: unknown
  /** Field-level messages for form errors, keyed by field path. */
  fieldErrors?: Record<string, string[]>
  /** Seconds until the caller may retry — used for 429 responses. */
  retryAfterSeconds?: number
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly context: Record<string, unknown> | undefined
  readonly fieldErrors: Record<string, string[]> | undefined
  readonly retryAfterSeconds: number | undefined
  /** Correlates the user-visible reference with the server log entry. */
  readonly incidentId: string

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? DEFAULT_MESSAGE[code])
    this.name = 'AppError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.context = options.context
    this.fieldErrors = options.fieldErrors
    this.retryAfterSeconds = options.retryAfterSeconds
    this.incidentId = generateIncidentId()
    if (options.cause !== undefined) this.cause = options.cause
    Error.captureStackTrace?.(this, AppError)
  }

  /** The only representation permitted to cross the network boundary. */
  toPublicJSON(): PublicErrorBody {
    const body: PublicErrorBody = {
      error: {
        code: this.code,
        message: this.message,
        incidentId: this.incidentId,
      },
    }
    if (this.fieldErrors) body.error.fieldErrors = this.fieldErrors
    return body
  }

  static isAppError(value: unknown): value is AppError {
    return value instanceof AppError
  }
}

export interface PublicErrorBody {
  error: {
    code: ErrorCode
    message: string
    incidentId: string
    fieldErrors?: Record<string, string[]>
  }
}

function generateIncidentId(): string {
  // Short, unambiguous, case-insensitive reference the user can quote to support.
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Normalizes any thrown value into an `AppError`. Unknown errors collapse to a
 * generic INTERNAL so implementation details cannot leak through `err.message`.
 */
export function toAppError(error: unknown): AppError {
  if (AppError.isAppError(error)) return error
  return new AppError(ERROR_CODES.INTERNAL, { cause: error })
}

/** Convenience constructors — keep call sites short and consistent. */
export const errors = {
  validation: (fieldErrors?: Record<string, string[]>, message?: string) =>
    new AppError(ERROR_CODES.VALIDATION_FAILED, {
      ...(fieldErrors ? { fieldErrors } : {}),
      ...(message ? { message } : {}),
    }),
  unauthenticated: () => new AppError(ERROR_CODES.UNAUTHENTICATED),
  forbidden: (context?: Record<string, unknown>) =>
    new AppError(ERROR_CODES.FORBIDDEN, context ? { context } : {}),
  notFound: (context?: Record<string, unknown>) =>
    new AppError(ERROR_CODES.NOT_FOUND, context ? { context } : {}),
  conflict: (message?: string) => new AppError(ERROR_CODES.CONFLICT, message ? { message } : {}),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError(ERROR_CODES.RATE_LIMITED, { retryAfterSeconds }),
  internal: (cause?: unknown, context?: Record<string, unknown>) =>
    new AppError(ERROR_CODES.INTERNAL, { cause, ...(context ? { context } : {}) }),
} as const
