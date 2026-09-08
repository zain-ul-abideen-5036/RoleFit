import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  cn,
  formatBytes,
  formatDate,
  formatDateTime,
  formatRelative,
  pluralize,
  truncate,
} from '@/lib/utils'

/**
 * Display helpers.
 *
 * Small, but every one of them renders on both the server and the client, so a
 * disagreement between the two is a hydration mismatch rather than a cosmetic
 * bug. The locale-sensitive helpers are tested for exactly that: a fixed output
 * regardless of the machine's locale or timezone.
 */

describe('cn', () => {
  it('lets a later Tailwind utility win over an earlier one', () => {
    // The reason twMerge exists: plain concatenation leaves both classes on the
    // element and the winner is decided by stylesheet order, not by intent.
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('keeps utilities that do not conflict', () => {
    expect(cn('flex', 'items-center')).toBe('flex items-center')
  })

  it('drops falsy values so a conditional class can be inlined', () => {
    expect(cn('flex', false && 'hidden', null, undefined, '')).toBe('flex')
  })

  it('accepts arrays and conditional objects', () => {
    expect(cn(['flex', 'gap-2'], { hidden: false, 'font-bold': true })).toBe('flex gap-2 font-bold')
  })

  it('resolves conflicts across display utilities, not just identical prefixes', () => {
    // `flex` and `block` are both display, so the later one wins even though
    // the class names share no prefix.
    expect(cn('flex', 'block')).toBe('block')
  })

  it('returns an empty string for no input', () => {
    expect(cn()).toBe('')
  })
})

describe('formatBytes', () => {
  it('shows exact bytes below a kilobyte', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('switches to whole kilobytes at 1024', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('2 KB')
    expect(formatBytes(1024 * 1023)).toBe('1023 KB')
  })

  it('switches to one decimal of megabytes at a megabyte', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(4_500_000)).toBe('4.3 MB')
  })

  it('describes the upload limit the way the uploader does', () => {
    // MAX_UPLOAD_BYTES defaults to 4,500,000 — the number a user sees when a
    // file is rejected has to match the number in the copy.
    expect(formatBytes(4_500_000)).toBe('4.3 MB')
  })
})

describe('formatDate', () => {
  it('renders a fixed en-GB form regardless of the machine locale', () => {
    expect(formatDate(new Date('2026-03-09T12:00:00Z'))).toBe('9 Mar 2026')
  })

  it('accepts an ISO string as well as a Date', () => {
    expect(formatDate('2026-03-09T12:00:00Z')).toBe(formatDate(new Date('2026-03-09T12:00:00Z')))
  })
})

describe('formatDateTime', () => {
  it('adds a zero-padded 24-hour time', () => {
    expect(formatDateTime(new Date('2026-03-09T09:05:00Z'))).toMatch(/^9 Mar 2026, \d{2}:\d{2}$/)
  })

  it('accepts an ISO string as well as a Date', () => {
    const iso = '2026-03-09T09:05:00Z'
    expect(formatDateTime(iso)).toBe(formatDateTime(new Date(iso)))
  })
})

describe('formatRelative', () => {
  const NOW = new Date('2026-03-09T12:00:00Z')

  function ago(seconds: number): Date {
    return new Date(NOW.getTime() - seconds * 1000)
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  function at(date: Date): string {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    return formatRelative(date)
  }

  it('says "just now" under a minute', () => {
    expect(at(ago(0))).toBe('just now')
    expect(at(ago(59))).toBe('just now')
  })

  it('counts whole minutes up to an hour', () => {
    expect(at(ago(60))).toBe('1m ago')
    expect(at(ago(3599))).toBe('59m ago')
  })

  it('counts whole hours up to a day', () => {
    expect(at(ago(3600))).toBe('1h ago')
    expect(at(ago(86_399))).toBe('23h ago')
  })

  it('counts whole days up to thirty', () => {
    expect(at(ago(86_400))).toBe('1d ago')
    expect(at(ago(2_591_999))).toBe('29d ago')
  })

  it('falls back to an absolute date beyond thirty days', () => {
    // Past this point "47d ago" stops being easier to read than the date.
    expect(at(ago(2_592_000))).toBe('7 Feb 2026')
  })

  it('does not produce a negative age for a clock-skewed future timestamp', () => {
    // Server and client clocks disagree; a record written moments ago can carry
    // a timestamp slightly in the future. "-1m ago" would be visible nonsense.
    expect(at(new Date(NOW.getTime() + 30_000))).toBe('just now')
  })
})

describe('truncate', () => {
  it('returns short text untouched, with no ellipsis', () => {
    expect(truncate('Senior Engineer', 40)).toBe('Senior Engineer')
  })

  it('returns text of exactly the maximum length untouched', () => {
    expect(truncate('abcde', 5)).toBe('abcde')
  })

  it('cuts on a word boundary when one is close enough to the limit', () => {
    expect(truncate('Senior Software Engineer at Acme', 20)).toBe('Senior Software…')
  })

  it('cuts mid-word rather than losing most of the text', () => {
    // A boundary before 60% of the limit would throw away too much, so the
    // hard cut is preferred to an uninformative fragment.
    expect(truncate('Supercalifragilisticexpialidocious', 12)).toBe('Supercalifr…')
  })

  it('always ends with a single-character ellipsis, never three dots', () => {
    const result = truncate('a'.repeat(100), 20)
    expect(result.endsWith('…')).toBe(true)
    expect(result).not.toContain('...')
    expect(result.length).toBeLessThanOrEqual(20)
  })
})

describe('pluralize', () => {
  it('uses the singular for exactly one', () => {
    expect(pluralize(1, 'change')).toBe('change')
  })

  it('appends s for anything else, including zero', () => {
    expect(pluralize(0, 'change')).toBe('changes')
    expect(pluralize(2, 'change')).toBe('changes')
  })

  it('takes an explicit plural for irregular words', () => {
    expect(pluralize(2, 'match', 'matches')).toBe('matches')
    expect(pluralize(1, 'match', 'matches')).toBe('match')
  })
})
