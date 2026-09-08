/**
 * The app's public origin, for metadata, the sitemap and robots.txt.
 *
 * Deliberately separate from `getEnv()` and deliberately incapable of
 * throwing. This is read while Next.js collects page data during a build, and
 * a throw there fails the whole build with an error that names a webpack chunk
 * rather than the variable at fault. Configuration problems are reported by
 * the env schema at startup, where they can be read.
 *
 * Resolution order, first usable value wins:
 *
 *  1. `NEXT_PUBLIC_APP_URL`, when it is set to something parseable.
 *  2. The hostname the hosting platform assigned this deployment. Vercel sets
 *     these during the build, which is what lets a first deploy produce
 *     correct metadata before anyone has configured a URL.
 *  3. `http://localhost:3000`, for local development.
 *
 * Only step 1 is inlined into the browser bundle; the platform variables are
 * not `NEXT_PUBLIC_` and are read on the server and at build time.
 */

const LOCAL_FALLBACK = 'http://localhost:3000'

/** Parses a candidate origin, returning null rather than throwing. */
function toOrigin(value: string | undefined, assumeHttps = false): string | null {
  const trimmed = value?.trim()

  // The empty-string case is the one that matters. `??` does not catch it, and
  // a platform env var defined with no value arrives as '' rather than
  // undefined — which is how `new URL('')` came to fail a production build.
  if (!trimmed) return null

  const candidate = trimmed.includes('://') ? trimmed : assumeHttps ? `https://${trimmed}` : trimmed

  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return `${url.protocol}//${url.host}`
  } catch {
    return null
  }
}

/**
 * The origin to use in absolute URLs. Always a valid, parseable origin, with
 * no trailing slash.
 */
export function publicAppUrl(): string {
  const configured = toOrigin(process.env.NEXT_PUBLIC_APP_URL)
  if (configured) return configured

  // Production domain first: `VERCEL_URL` is the per-deployment hostname, so
  // preferring it would put a build-specific URL in canonical metadata.
  const platform =
    toOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL, true) ??
    toOrigin(process.env.VERCEL_BRANCH_URL, true) ??
    toOrigin(process.env.VERCEL_URL, true)

  return platform ?? LOCAL_FALLBACK
}

/** `publicAppUrl()` as a `URL`, for `metadataBase`. */
export function publicAppUrlObject(): URL {
  return new URL(publicAppUrl())
}
