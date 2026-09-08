import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { publicAppUrl, publicAppUrlObject } from '@/lib/config/public-url'

/**
 * The public origin.
 *
 * This is read while Next.js collects page data during a build, which is the
 * one place a throw is least affordable: the build fails with an error naming
 * a webpack chunk rather than the variable at fault. That is exactly what
 * happened — an empty `NEXT_PUBLIC_APP_URL` reached `new URL('')` and killed a
 * production deploy with `ERR_INVALID_URL` on `/_not-found`.
 *
 * So the property under test is not "does it return the right URL" but "does
 * it always return *a* usable URL, whatever it is handed".
 */

const KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'VERCEL_URL',
  'VERCEL_BRANCH_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
] as const

const ORIGINAL_ENV = { ...process.env }

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>): void {
  const env = process.env as Record<string, string | undefined>
  for (const key of KEYS) delete env[key]
  for (const [key, value] of Object.entries(values)) env[key] = value
}

beforeEach(() => {
  setEnv({})
})

afterEach(() => {
  const env = process.env as Record<string, string | undefined>
  for (const key of Object.keys(env)) {
    if (!(key in ORIGINAL_ENV)) delete env[key]
  }
  Object.assign(env, ORIGINAL_ENV)
})

describe('it never throws', () => {
  it.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['not a URL at all', 'not a url'],
    ['a bare hostname', 'rolefit.app'],
    ['a scheme with no host', 'https://'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,hi'],
    ['a file: URL', 'file:///etc/passwd'],
  ])('survives %s', (_label, value) => {
    setEnv({ NEXT_PUBLIC_APP_URL: value })

    // The regression: this exact call is what failed the Vercel build.
    expect(() => publicAppUrlObject()).not.toThrow()
    expect(publicAppUrl()).toMatch(/^https?:\/\//)
  })

  it('survives every variable being absent', () => {
    expect(() => publicAppUrlObject()).not.toThrow()
    expect(publicAppUrl()).toBe('http://localhost:3000')
  })

  it('refuses a non-http scheme rather than propagating it into metadata', () => {
    // A `javascript:` metadataBase would be an injected scheme in a canonical
    // link tag, so it falls back rather than being passed through.
    setEnv({ NEXT_PUBLIC_APP_URL: 'javascript:alert(1)' })
    expect(publicAppUrl()).toBe('http://localhost:3000')
  })
})

describe('the empty-string case specifically', () => {
  it('falls back rather than producing an empty origin', () => {
    // `??` does not catch '', and a platform variable defined with no value
    // arrives as '' rather than undefined. That is the whole bug.
    setEnv({ NEXT_PUBLIC_APP_URL: '' })
    expect(publicAppUrl()).toBe('http://localhost:3000')
  })

  it('still reaches the platform URL when the configured one is empty', () => {
    // The case that makes a first deploy work with nothing configured.
    setEnv({ NEXT_PUBLIC_APP_URL: '', VERCEL_PROJECT_PRODUCTION_URL: 'rolefit.vercel.app' })
    expect(publicAppUrl()).toBe('https://rolefit.vercel.app')
  })
})

describe('precedence', () => {
  it('prefers an explicitly configured URL over the platform', () => {
    setEnv({
      NEXT_PUBLIC_APP_URL: 'https://rolefit.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'rolefit.vercel.app',
    })

    expect(publicAppUrl()).toBe('https://rolefit.app')
  })

  it('prefers the production domain over a per-deployment hostname', () => {
    // VERCEL_URL is unique per build. Using it in canonical metadata would
    // point every deploy's canonical link at that one deployment.
    setEnv({
      VERCEL_PROJECT_PRODUCTION_URL: 'rolefit.vercel.app',
      VERCEL_URL: 'rolefit-git-abc123.vercel.app',
    })

    expect(publicAppUrl()).toBe('https://rolefit.vercel.app')
  })

  it('falls to the branch alias before the per-deployment hostname', () => {
    setEnv({
      VERCEL_BRANCH_URL: 'rolefit-git-main.vercel.app',
      VERCEL_URL: 'rolefit-git-abc123.vercel.app',
    })

    expect(publicAppUrl()).toBe('https://rolefit-git-main.vercel.app')
  })

  it('uses the per-deployment hostname when it is all there is', () => {
    setEnv({ VERCEL_URL: 'rolefit-git-abc123.vercel.app' })
    expect(publicAppUrl()).toBe('https://rolefit-git-abc123.vercel.app')
  })

  it('skips a platform variable that is empty', () => {
    setEnv({ VERCEL_PROJECT_PRODUCTION_URL: '', VERCEL_URL: 'rolefit-abc.vercel.app' })
    expect(publicAppUrl()).toBe('https://rolefit-abc.vercel.app')
  })
})

describe('normalisation', () => {
  it('assumes https for a bare platform hostname', () => {
    // Vercel supplies a hostname, not a URL.
    setEnv({ VERCEL_URL: 'rolefit.vercel.app' })
    expect(publicAppUrl()).toBe('https://rolefit.vercel.app')
  })

  it('does not assume a scheme for the configured variable', () => {
    // A bare hostname there is a mistake worth falling back on rather than
    // silently guessing, since the operator meant to paste a full URL.
    setEnv({ NEXT_PUBLIC_APP_URL: 'rolefit.app' })
    expect(publicAppUrl()).toBe('http://localhost:3000')
  })

  it('strips a trailing slash', () => {
    setEnv({ NEXT_PUBLIC_APP_URL: 'https://rolefit.app/' })
    expect(publicAppUrl()).toBe('https://rolefit.app')
  })

  it('strips a path, keeping only the origin', () => {
    setEnv({ NEXT_PUBLIC_APP_URL: 'https://rolefit.app/dashboard?x=1' })
    expect(publicAppUrl()).toBe('https://rolefit.app')
  })

  it('keeps a non-default port', () => {
    setEnv({ NEXT_PUBLIC_APP_URL: 'http://localhost:3100' })
    expect(publicAppUrl()).toBe('http://localhost:3100')
  })

  it('trims surrounding whitespace', () => {
    setEnv({ NEXT_PUBLIC_APP_URL: '  https://rolefit.app  ' })
    expect(publicAppUrl()).toBe('https://rolefit.app')
  })

  it('preserves http for local development', () => {
    setEnv({ NEXT_PUBLIC_APP_URL: 'http://192.168.1.20:3000' })
    expect(publicAppUrl()).toBe('http://192.168.1.20:3000')
  })
})

describe('publicAppUrlObject', () => {
  it('returns a URL matching the string form', () => {
    setEnv({ NEXT_PUBLIC_APP_URL: 'https://rolefit.app' })

    const url = publicAppUrlObject()
    expect(url).toBeInstanceOf(URL)
    expect(url.origin).toBe(publicAppUrl())
  })
})
