import type { ErrorCode } from '@/lib/errors'

/**
 * Browser-side API client.
 *
 * One place that knows how the API reports failure, so no component has to
 * parse an error body. Two properties matter:
 *
 *  - It never throws a raw `fetch` rejection at a component. Network failure
 *    and a 500 arrive in the same shape, so error rendering is uniform.
 *  - It surfaces `fieldErrors` separately from the summary message, so forms
 *    can render an error next to the field that caused it.
 */

export interface ApiFieldErrors {
  [field: string]: string[]
}

export class ApiError extends Error {
  readonly code: ErrorCode | 'NETWORK'
  readonly status: number
  readonly fieldErrors: ApiFieldErrors | undefined
  readonly incidentId: string | undefined

  constructor(options: {
    message: string
    code: ErrorCode | 'NETWORK'
    status: number
    fieldErrors?: ApiFieldErrors
    incidentId?: string
  }) {
    super(options.message)
    this.name = 'ApiError'
    this.code = options.code
    this.status = options.status
    this.fieldErrors = options.fieldErrors
    this.incidentId = options.incidentId
  }
}

interface ErrorBody {
  error?: {
    code?: ErrorCode
    message?: string
    incidentId?: string
    fieldErrors?: ApiFieldErrors
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ErrorBody = {}
  try {
    body = (await response.json()) as ErrorBody
  } catch {
    // Non-JSON error response — fall back to a generic message below.
  }

  return new ApiError({
    message: body.error?.message ?? 'Something went wrong. Please try again.',
    code: body.error?.code ?? 'INTERNAL',
    status: response.status,
    ...(body.error?.fieldErrors ? { fieldErrors: body.error.fieldErrors } : {}),
    ...(body.error?.incidentId ? { incidentId: body.error.incidentId } : {}),
  })
}

async function request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
  let response: Response
  try {
    response = await fetch(path, {
      // Session cookie must ride along on every call.
      credentials: 'same-origin',
      ...init,
    })
  } catch {
    throw new ApiError({
      message: 'We could not reach the server. Check your connection and try again.',
      code: 'NETWORK',
      status: 0,
    })
  }

  if (!response.ok) throw await toApiError(response)

  if (response.status === 204) return undefined as TResponse
  return (await response.json()) as TResponse
}

export function apiGet<TResponse>(path: string): Promise<TResponse> {
  return request<TResponse>(path, { method: 'GET' })
}

export function apiPost<TResponse>(path: string, body?: unknown): Promise<TResponse> {
  return request<TResponse>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

export function apiPatch<TResponse>(path: string, body: unknown): Promise<TResponse> {
  return request<TResponse>(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function apiDelete<TResponse>(path: string): Promise<TResponse> {
  return request<TResponse>(path, { method: 'DELETE' })
}

/** Multipart upload. The browser sets the boundary, so no content-type here. */
export function apiUpload<TResponse>(path: string, form: FormData): Promise<TResponse> {
  return request<TResponse>(path, { method: 'POST', body: form })
}

/** Narrows an unknown catch value to something renderable. */
export function toDisplayError(error: unknown): {
  message: string
  fieldErrors?: ApiFieldErrors
  incidentId?: string
} {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
      ...(error.incidentId ? { incidentId: error.incidentId } : {}),
    }
  }
  return { message: 'Something went wrong. Please try again.' }
}
