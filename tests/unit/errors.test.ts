import { describe, expect, it } from 'vitest'

import { AppError, ERROR_CODES, errors, toAppError } from '@/lib/errors'

/**
 * Errors.
 *
 * One property matters more than all the others here: `toPublicJSON` is the
 * only representation permitted to cross the network, and it must not carry a
 * cause, a context, or a stack. Everything an error knows that is useful for
 * debugging is also useful to an attacker, so the split between what is logged
 * and what is returned is the thing worth pinning.
 */

describe('what crosses the network', () => {
  it('carries only the code, message and incident id', () => {
    const error = new AppError(ERROR_CODES.INTERNAL, {
      cause: new Error('postgres: relation "users" does not exist'),
      context: { userId: 'a-real-user-id', query: 'select * from users' },
    })

    expect(Object.keys(error.toPublicJSON().error).sort()).toEqual([
      'code',
      'incidentId',
      'message',
    ])
  })

  it('never serialises the cause', () => {
    const error = new AppError(ERROR_CODES.INTERNAL, {
      cause: new Error('connection string: postgres://user:hunter2@db/rolefit'),
    })

    const serialised = JSON.stringify(error.toPublicJSON())
    expect(serialised).not.toContain('hunter2')
    expect(serialised).not.toContain('postgres://')
  })

  it('never serialises the context', () => {
    const error = new AppError(ERROR_CODES.NOT_FOUND, {
      context: { resumeId: 'someone-elses-resume-id' },
    })

    expect(JSON.stringify(error.toPublicJSON())).not.toContain('someone-elses-resume-id')
  })

  it('includes field errors, because a form needs them', () => {
    const error = errors.validation({ email: ['Enter a valid email address'] })

    expect(error.toPublicJSON().error.fieldErrors).toEqual({
      email: ['Enter a valid email address'],
    })
  })

  it('omits the fieldErrors key entirely when there are none', () => {
    // An empty object in the response invites a client to render an empty
    // error summary.
    expect('fieldErrors' in errors.unauthenticated().toPublicJSON().error).toBe(false)
  })
})

describe('incident ids', () => {
  it('are short, hex, and quotable over the phone', () => {
    expect(new AppError(ERROR_CODES.INTERNAL).incidentId).toMatch(/^[0-9a-f]{12}$/)
  })

  it('are unique per error, so two reports are distinguishable', () => {
    const ids = new Set(
      Array.from({ length: 500 }, () => new AppError(ERROR_CODES.INTERNAL).incidentId),
    )
    expect(ids.size).toBe(500)
  })

  it('appear in the public body, so a user can quote one', () => {
    const error = new AppError(ERROR_CODES.INTERNAL)
    expect(error.toPublicJSON().error.incidentId).toBe(error.incidentId)
  })
})

describe('status codes', () => {
  it.each([
    ['VALIDATION_FAILED', errors.validation(), 400],
    ['UNAUTHENTICATED', errors.unauthenticated(), 401],
    ['FORBIDDEN', errors.forbidden(), 403],
    ['NOT_FOUND', errors.notFound(), 404],
    ['CONFLICT', errors.conflict(), 409],
    ['RATE_LIMITED', errors.rateLimited(30), 429],
    ['INTERNAL', errors.internal(), 500],
  ])('maps %s to %i', (_label, error, status) => {
    expect(error.status).toBe(status)
  })
})

describe('default messages', () => {
  it('gives every code a message a user could act on', () => {
    for (const code of Object.values(ERROR_CODES)) {
      const message = new AppError(code).message
      expect(message, code).toMatch(/\S/)
      // No code names, no stack fragments, no "Error:".
      expect(message, code).not.toContain(code)
    }
  })

  it('lets a caller override the message', () => {
    expect(errors.conflict('That email is already in use.').message).toBe(
      'That email is already in use.',
    )
  })

  it('keeps the default when no override is given', () => {
    expect(errors.conflict().message).toBe(new AppError(ERROR_CODES.CONFLICT).message)
  })
})

describe('toAppError', () => {
  it('passes an AppError through unchanged, incident id included', () => {
    const original = errors.notFound()
    const converted = toAppError(original)

    // Re-wrapping would mint a second incident id for one event, so the log
    // and the user's reference would disagree.
    expect(converted).toBe(original)
    expect(converted.incidentId).toBe(original.incidentId)
  })

  it.each([
    ['an Error', new Error('relation "users" does not exist')],
    ['a string', 'something went wrong in the database'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['an object', { code: 'ECONNREFUSED', host: 'db.internal' }],
  ])('collapses %s to a generic INTERNAL', (_label, thrown) => {
    const converted = toAppError(thrown)

    expect(converted.code).toBe('INTERNAL')
    expect(converted.status).toBe(500)
    // The original is kept for the log and kept out of the message.
    expect(converted.cause).toBe(thrown)
  })

  it('does not leak the original message', () => {
    const converted = toAppError(new Error('relation "users" does not exist'))

    expect(converted.message).not.toContain('relation')
    expect(JSON.stringify(converted.toPublicJSON())).not.toContain('relation')
  })
})

describe('rate limiting', () => {
  it('carries the retry delay for the Retry-After header', () => {
    expect(errors.rateLimited(90).retryAfterSeconds).toBe(90)
  })

  it('does not put the delay in the public body', () => {
    // It belongs in a header, and duplicating it invites the two to disagree.
    expect(JSON.stringify(errors.rateLimited(90).toPublicJSON())).not.toContain('90')
  })
})

describe('isAppError', () => {
  it('recognises an AppError', () => {
    expect(AppError.isAppError(errors.notFound())).toBe(true)
  })

  it.each([
    ['a plain Error', new Error('nope')],
    ['a duck-typed lookalike', { code: 'NOT_FOUND', status: 404, message: 'nope' }],
    ['null', null],
    ['a string', 'NOT_FOUND'],
  ])('rejects %s', (_label, value) => {
    // A duck-typed object must not pass: the guard decides whether a value is
    // safe to serialise to a user.
    expect(AppError.isAppError(value)).toBe(false)
  })
})

describe('the error itself', () => {
  it('is a real Error, so it works with instanceof and stack traces', () => {
    const error = errors.internal()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('AppError')
    expect(error.stack).toMatch(/\S/)
  })

  it('keeps context available server-side for logging', () => {
    // Withheld from the response, not thrown away — the log needs it.
    const error = errors.forbidden({ reason: 'origin_mismatch' })
    expect(error.context).toEqual({ reason: 'origin_mismatch' })
  })

  it('omits context entirely when none was given', () => {
    expect(errors.forbidden().context).toBeUndefined()
  })
})
