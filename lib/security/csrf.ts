import 'server-only'

import { getEnv } from '@/lib/config/env'
import { errors } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * CSRF protection by origin verification.
 *
 * The session cookie is `SameSite=Lax`, which already prevents it being sent on
 * a cross-site POST. This is the second layer: every state-changing request
 * must carry an `Origin` (or `Referer`) that matches the app's own origin.
 *
 * A token-based scheme would add a third layer but also a synchronisation
 * problem across server components and streamed responses; for a same-origin
 * JSON API, `SameSite=Lax` plus origin checking is the standard defense and has
 * no such failure mode.
 */

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.host}`
  } catch {
    return null
  }
}

/**
 * Hostnames the hosting platform assigns to this deployment.
 *
 * A preview deployment runs with `NODE_ENV=production` on a generated hostname
 * that cannot be known when the environment is configured. These variables are
 * injected by the platform itself, not by a request, so trusting them does not
 * hand an attacker anything: a forged `Host` header cannot change them.
 *
 * Deriving the set this way is what allows the `Host` header to stay untrusted
 * in production, which is the property that actually matters — `Host` is
 * attacker-controlled, and trusting it would defeat the check entirely.
 */
function platformOrigins(): string[] {
  const hosts = [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]

  return (
    hosts
      .filter((host): host is string => Boolean(host))
      // The platform supplies a bare hostname; deployments are always HTTPS.
      .map((host) => (host.includes('://') ? host : `https://${host}`))
      .map(normalizeOrigin)
      .filter((origin): origin is string => origin !== null)
  )
}

/** Origins permitted to make state-changing requests. */
function allowedOrigins(request: Request): Set<string> {
  const env = getEnv()
  const allowed = new Set<string>()

  const configured = normalizeOrigin(env.NEXT_PUBLIC_APP_URL)
  if (configured) allowed.add(configured)

  for (const origin of platformOrigins()) allowed.add(origin)

  // Outside production the `Host` header is trusted so that a developer can
  // reach the app on localhost, a LAN address or a tunnel without configuring
  // each one. It is never trusted in production, where it is attacker-supplied.
  const host = request.headers.get('host')
  if (host && env.NODE_ENV !== 'production') {
    allowed.add(`http://${host}`)
    allowed.add(`https://${host}`)
  }

  return allowed
}

/**
 * Throws when a state-changing request does not originate from this app.
 * Safe methods pass through untouched.
 */
export function assertSameOrigin(request: Request): void {
  if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) return

  const allowed = allowedOrigins(request)

  const originHeader = request.headers.get('origin')
  if (originHeader) {
    const origin = normalizeOrigin(originHeader)
    if (origin && allowed.has(origin)) return

    logger.warn('csrf.origin_rejected', { method: request.method })
    throw errors.forbidden({ reason: 'origin_mismatch' })
  }

  // Some clients omit Origin. Fall back to Referer before rejecting.
  const refererHeader = request.headers.get('referer')
  if (refererHeader) {
    const referer = normalizeOrigin(refererHeader)
    if (referer && allowed.has(referer)) return

    logger.warn('csrf.referer_rejected', { method: request.method })
    throw errors.forbidden({ reason: 'referer_mismatch' })
  }

  // Neither header present on a state-changing request: reject. A browser
  // always sends at least one; a client that sends neither is not a browser
  // and should be using a token-authenticated path instead.
  logger.warn('csrf.missing_origin', { method: request.method })
  throw errors.forbidden({ reason: 'missing_origin' })
}
