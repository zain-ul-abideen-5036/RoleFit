import { describe, expect, it } from 'vitest'

import {
  hashPassword,
  needsRehash,
  performDummyVerification,
  verifyPassword,
} from '@/lib/security/password'

/**
 * Password hashing.
 *
 * The properties worth pinning are not "does bcrypt work" — that is bcrypt's
 * problem — but the three decisions this module makes on top of it: the cost
 * factor, failing closed on a corrupt hash, and the dummy verification that
 * keeps an unknown address indistinguishable from a wrong password.
 */

// Cost 12 is deliberately expensive, and every case here pays it. The suites
// below run concurrently so the work overlaps rather than queueing — the cases
// share no state, so nothing is traded away for the speed.
const TIMEOUT = 20_000

describe.concurrent('hashPassword', () => {
  it(
    'produces a bcrypt hash at cost 12',
    async () => {
      const hash = await hashPassword('correct horse battery staple')
      // $2<variant>$<cost>$<salt+digest>
      expect(hash).toMatch(/^\$2[aby]\$12\$/)
    },
    TIMEOUT,
  )

  it(
    'salts, so the same password never yields the same hash twice',
    async () => {
      const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')])
      expect(first).not.toBe(second)
      // Both must still verify: a salt is not a different password.
      expect(await verifyPassword('same', first)).toBe(true)
      expect(await verifyPassword('same', second)).toBe(true)
    },
    TIMEOUT,
  )
})

describe.concurrent('verifyPassword', () => {
  it(
    'accepts the right password and rejects a wrong one',
    async () => {
      const hash = await hashPassword('s3cret-passphrase')
      expect(await verifyPassword('s3cret-passphrase', hash)).toBe(true)
      expect(await verifyPassword('s3cret-passphras', hash)).toBe(false)
      expect(await verifyPassword('', hash)).toBe(false)
    },
    TIMEOUT,
  )

  it(
    'is case sensitive',
    async () => {
      const hash = await hashPassword('CaseSensitive')
      expect(await verifyPassword('casesensitive', hash)).toBe(false)
    },
    TIMEOUT,
  )

  it.each([
    ['empty', ''],
    ['not a hash at all', 'plaintext-password'],
    ['truncated', '$2a$12$'],
    ['unknown algorithm', '$9z$12$abcdefghijklmnopqrstuv'],
  ])('returns false rather than throwing on a %s stored hash', async (_label, stored) => {
    // A corrupted row must fail the login, not raise a 500 — a 500 where other
    // addresses give a clean rejection is itself a signal the row exists.
    await expect(verifyPassword('anything', stored)).resolves.toBe(false)
  })
})

describe.concurrent('needsRehash', () => {
  it(
    'says no for a hash already at the current cost',
    async () => {
      expect(needsRehash(await hashPassword('current'))).toBe(false)
    },
    TIMEOUT,
  )

  it('says yes for a hash below the current cost', () => {
    expect(needsRehash('$2a$10$C6UzMDM.H6dfI/f/IKcEe.MHz1zHnTgQrPGgQKrOoNSTfxsn8Wq7O')).toBe(true)
    expect(needsRehash('$2b$04$C6UzMDM.H6dfI/f/IKcEe.MHz1zHnTgQrPGgQKrOoNSTfxsn8Wq7O')).toBe(true)
  })

  it('says no for a hash above the current cost', () => {
    // Stronger than required is not a reason to weaken it on next login.
    expect(needsRehash('$2a$14$C6UzMDM.H6dfI/f/IKcEe.MHz1zHnTgQrPGgQKrOoNSTfxsn8Wq7O')).toBe(false)
  })

  it('accepts every bcrypt variant marker', () => {
    for (const variant of ['2a', '2b', '2y']) {
      expect(
        needsRehash(`$${variant}$12$C6UzMDM.H6dfI/f/IKcEe.MHz1zHnTgQrPGgQKrOoNSTfxsn8Wq7O`),
      ).toBe(false)
    }
  })

  it.each([
    ['empty', ''],
    ['plaintext', 'hunter2'],
    ['a different algorithm', '$argon2id$v=19$m=65536,t=3,p=4$abc$def'],
    ['a non-numeric cost', '$2a$xx$C6UzMDM.H6dfI/f/IKcEe.MHz1zHnTgQrPGgQKrOoNSTfxsn8Wq7O'],
  ])('says yes for %s, so anything unrecognised is upgraded', (_label, stored) => {
    // Failing towards rehashing is the safe direction: the worst case is one
    // extra hash on a successful login.
    expect(needsRehash(stored)).toBe(true)
  })
})

// Deliberately NOT concurrent: it measures elapsed time, and running it beside
// other bcrypt work would make the comparison meaningless.
describe('performDummyVerification', () => {
  it(
    'resolves without throwing, so the unknown-account path cannot 500',
    async () => {
      await expect(performDummyVerification()).resolves.toBeUndefined()
    },
    TIMEOUT,
  )

  it(
    'costs roughly what a real verification costs',
    async () => {
      // The point of the dummy hash is timing. If it were cheap — or worse, a
      // no-op — the response time would enumerate registered addresses.
      const hash = await hashPassword('a-real-password')

      const realStart = performance.now()
      await verifyPassword('a-wrong-password', hash)
      const real = performance.now() - realStart

      const dummyStart = performance.now()
      await performDummyVerification()
      const dummy = performance.now() - dummyStart

      // Generous bounds: this asserts the same order of magnitude, not a
      // constant-time guarantee, and must not flake on a loaded CI runner.
      expect(dummy).toBeGreaterThan(real * 0.25)
      expect(dummy).toBeLessThan(real * 4)
    },
    TIMEOUT,
  )
})
