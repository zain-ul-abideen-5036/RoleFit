import 'server-only'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { AppError, toAppError, type PublicErrorBody } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { assertSameOrigin } from '@/lib/security/csrf'
import { clientIdentifier, enforceRateLimit, type RateLimitBucket } from '@/lib/security/rate-limit'
import { requireUser, type AuthContext } from '@/server/auth/service'

/**
 * The single entry point for every API route.
 *
 * Centralising this is what makes the security posture auditable: there is one
 * place where authentication, CSRF and rate limiting are applied, and one place
 * where errors are converted to a response. A route that forgets a check is not
 * possible, because the checks are the wrapper rather than the route body.
 *
 * Error handling has one rule: only `AppError` copy reaches the client. Any
 * other thrown value becomes a generic 500 with an incident id, and the real
 * error is logged server-side under that id.
 */

export interface RouteContext<TParams = Record<string, string>> {
  request: Request
  params: TParams
  /** Present only on routes declared `auth: true`. */
  user: AuthContext
}

export interface PublicRouteContext<TParams = Record<string, string>> {
  request: Request
  params: TParams
  user: AuthContext | null
}

interface RouteOptions {
  /** Rate-limit bucket to consume before the handler runs. */
  rateLimit?: RateLimitBucket
  /**
   * Skip the origin check. Only for routes that are safe to call cross-site,
   * which in practice means none of the state-changing ones.
   */
  skipCsrf?: boolean
}

type Handler<TParams, TResult> = (context: RouteContext<TParams>) => Promise<TResult>
type PublicHandler<TParams, TResult> = (context: PublicRouteContext<TParams>) => Promise<TResult>

/** Next.js passes route params as a promise in App Router route handlers. */
type NextRouteArgs<TParams> = { params: Promise<TParams> }

function errorResponse(error: AppError): NextResponse<PublicErrorBody> {
  const headers: Record<string, string> = {}
  if (error.retryAfterSeconds !== undefined) {
    headers['retry-after'] = String(error.retryAfterSeconds)
  }

  return NextResponse.json(error.toPublicJSON(), { status: error.status, headers })
}

function handleFailure(error: unknown, route: string): NextResponse<PublicErrorBody> {
  const appError = toAppError(error)

  // 5xx is our fault and gets a full log; 4xx is expected and gets one line.
  if (appError.status >= 500) {
    logger.error('api.request_failed', {
      route,
      code: appError.code,
      incidentId: appError.incidentId,
      context: appError.context,
      error: appError.cause ?? appError,
    })
  } else {
    logger.info('api.request_rejected', {
      route,
      code: appError.code,
      incidentId: appError.incidentId,
    })
  }

  return errorResponse(appError)
}

/** Wraps a handler that requires an authenticated user. */
export function route<
  TParams extends Record<string, string> = Record<string, string>,
  TResult = unknown,
>(handler: Handler<TParams, TResult>, options: RouteOptions = {}) {
  return async (request: Request, args?: NextRouteArgs<TParams>): Promise<NextResponse> => {
    const routeName = `${request.method} ${new URL(request.url).pathname}`

    try {
      if (!options.skipCsrf) assertSameOrigin(request)

      const user = await requireUser()

      if (options.rateLimit) {
        // Authenticated callers are limited per account, so rotating IPs does
        // not multiply an individual's quota.
        await enforceRateLimit(options.rateLimit, user.userId)
      }

      const params = ((await args?.params) ?? {}) as TParams
      const result = await handler({ request, params, user })

      return result instanceof NextResponse ? result : NextResponse.json(result)
    } catch (error) {
      return handleFailure(error, routeName)
    }
  }
}

/** Wraps a handler that may be called without a session. */
export function publicRoute<
  TParams extends Record<string, string> = Record<string, string>,
  TResult = unknown,
>(handler: PublicHandler<TParams, TResult>, options: RouteOptions = {}) {
  return async (request: Request, args?: NextRouteArgs<TParams>): Promise<NextResponse> => {
    const routeName = `${request.method} ${new URL(request.url).pathname}`

    try {
      if (!options.skipCsrf) assertSameOrigin(request)

      if (options.rateLimit) {
        // Unauthenticated: limit by truncated IP prefix.
        await enforceRateLimit(options.rateLimit, clientIdentifier(request))
      }

      const { getCurrentUser } = await import('@/server/auth/service')
      const user = await getCurrentUser()

      const params = ((await args?.params) ?? {}) as TParams
      const result = await handler({ request, params, user })

      return result instanceof NextResponse ? result : NextResponse.json(result)
    } catch (error) {
      return handleFailure(error, routeName)
    }
  }
}

/* ==========================================================================
   Body parsing
   ========================================================================== */

/** Largest JSON body accepted, well under Vercel's 4.5 MB function limit. */
const MAX_JSON_BYTES = 1_000_000

/**
 * Parses and validates a JSON body.
 * Zod issues are returned as field errors so forms can render them inline.
 */
export async function parseJsonBody<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > MAX_JSON_BYTES) {
    throw new AppError('PAYLOAD_TOO_LARGE', { message: 'That request was too large.' })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new AppError('VALIDATION_FAILED', { message: 'The request body was not valid JSON.' })
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', { fieldErrors: toFieldErrors(parsed.error) })
  }

  return parsed.data
}

export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {}

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form'
    ;(fieldErrors[key] ??= []).push(issue.message)
  }

  return fieldErrors
}

/** Parses and validates URL search params. */
export function parseSearchParams<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
): z.infer<TSchema> {
  const url = new URL(request.url)
  const raw = Object.fromEntries(url.searchParams.entries())

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', { fieldErrors: toFieldErrors(parsed.error) })
  }
  return parsed.data
}

/** UUID path parameter validation, so a malformed id never reaches a query. */
export const uuidParam = z.string().uuid('That identifier is not valid.')

export function requireUuidParam(value: string | undefined, name: string): string {
  const parsed = uuidParam.safeParse(value)
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', {
      fieldErrors: { [name]: ['Not a valid identifier.'] },
    })
  }
  return parsed.data
}
