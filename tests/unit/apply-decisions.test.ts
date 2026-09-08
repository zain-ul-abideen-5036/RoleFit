import { describe, expect, it } from 'vitest'

import type { ResumeProfile } from '@/lib/domain/types'
import { emptyResumeProfile } from '@/lib/domain/types'
import { applyDecisions } from '@/lib/optimization/apply'
import type { ReviewableChange } from '@/lib/optimization/types'
import { resolvedText, summarizeChanges } from '@/lib/optimization/types'

/**
 * Applying the user's decisions.
 *
 * This is where the product's central promise is kept: nothing reaches a
 * document that the user did not explicitly accept. The default has to be
 * refusal, and the tests below are mostly about what does *not* happen —
 * pending changes, rejected changes, and changes pointing at paths that no
 * longer exist.
 */

const BULLET = 'Built the payments service on Node and PostgreSQL'
const REWRITE = 'Built and operated the payments service on Node.js and PostgreSQL'

function resume(): ResumeProfile {
  return {
    ...emptyResumeProfile(),
    summary: 'Backend engineer.',
    skills: [{ id: 'grp-1', category: 'Languages', items: ['Python', 'Go', 'SQL'] }],
    experience: [
      {
        id: 'exp-1',
        title: 'Engineer',
        company: 'Acme',
        location: null,
        dates: { start: '2020-01', end: null, isCurrent: true },
        bullets: [BULLET, 'Second bullet that is long enough to be real'],
      },
      {
        id: 'exp-2',
        title: 'Junior Engineer',
        company: 'Initech',
        location: null,
        dates: { start: '2018-01', end: '2019-12', isCurrent: false },
        bullets: ['Did earlier work of some description here'],
      },
    ],
  }
}

function change(overrides: Partial<ReviewableChange>): ReviewableChange {
  return {
    id: 'chg-1',
    targetPath: 'experience.exp-1.bullets.0',
    section: 'experience',
    action: 'modified',
    before: BULLET,
    after: REWRITE,
    rationale: 'Aligns terminology with the posting.',
    evidence: [],
    impact: 'medium',
    decision: 'pending',
    editedText: null,
    ...overrides,
  } as ReviewableChange
}

describe('the default is refusal', () => {
  it('does not write a pending change', () => {
    // The whole review step exists so a user decides. Silence is not consent.
    const result = applyDecisions(resume(), [change({ decision: 'pending' })])
    expect(result.experience[0]?.bullets[0]).toBe(BULLET)
  })

  it('does not write a rejected change', () => {
    const result = applyDecisions(resume(), [change({ decision: 'rejected' })])
    expect(result.experience[0]?.bullets[0]).toBe(BULLET)
  })

  it('leaves the resume byte-identical when everything is rejected', () => {
    const original = resume()
    const result = applyDecisions(original, [
      change({ id: 'a', decision: 'rejected' }),
      change({ id: 'b', targetPath: 'summary', decision: 'rejected', after: 'Rewritten.' }),
    ])

    expect(result).toEqual(original)
  })

  it('leaves the resume byte-identical for no changes at all', () => {
    const original = resume()
    expect(applyDecisions(original, [])).toEqual(original)
  })
})

describe('accepting a change', () => {
  it('writes the proposed text', () => {
    const result = applyDecisions(resume(), [change({ decision: 'accepted' })])
    expect(result.experience[0]?.bullets[0]).toBe(REWRITE)
  })

  it('leaves every other bullet untouched', () => {
    const original = resume()
    const result = applyDecisions(original, [change({ decision: 'accepted' })])

    expect(result.experience[0]?.bullets[1]).toBe(original.experience[0]?.bullets[1])
    expect(result.experience[1]).toEqual(original.experience[1])
  })

  it('rewrites the summary when that is the target', () => {
    const result = applyDecisions(resume(), [
      change({
        targetPath: 'summary',
        section: 'summary',
        before: 'Backend engineer.',
        after: 'Backend engineer focused on payments infrastructure.',
        decision: 'accepted',
      }),
    ])

    expect(result.summary).toBe('Backend engineer focused on payments infrastructure.')
  })

  it('applies several accepted changes together', () => {
    const result = applyDecisions(resume(), [
      change({ id: 'a', decision: 'accepted' }),
      change({
        id: 'b',
        targetPath: 'experience.exp-2.bullets.0',
        before: 'Did earlier work of some description here',
        after: 'Delivered earlier work of some description here',
        decision: 'accepted',
      }),
    ])

    expect(result.experience[0]?.bullets[0]).toBe(REWRITE)
    expect(result.experience[1]?.bullets[0]).toBe('Delivered earlier work of some description here')
  })
})

describe('editing a change', () => {
  it('writes the user text, not the proposal', () => {
    const result = applyDecisions(resume(), [
      change({ decision: 'edited', editedText: 'My own wording for this bullet entirely' }),
    ])

    expect(result.experience[0]?.bullets[0]).toBe('My own wording for this bullet entirely')
  })

  it('falls back to the proposal when the edit is empty', () => {
    const result = applyDecisions(resume(), [change({ decision: 'edited', editedText: null })])
    expect(result.experience[0]?.bullets[0]).toBe(REWRITE)
  })

  it('accepts a user edit that the optimizer would never have proposed', () => {
    // The user is allowed to write whatever they want about themselves. The
    // anti-fabrication rules constrain the model, not the person.
    const result = applyDecisions(resume(), [
      change({ decision: 'edited', editedText: 'Led the payments platform end to end' }),
    ])

    expect(result.experience[0]?.bullets[0]).toBe('Led the payments platform end to end')
  })
})

describe('a change that no longer fits the resume', () => {
  it.each([
    ['an unknown experience id', 'experience.exp-missing.bullets.0'],
    ['a bullet index past the end', 'experience.exp-1.bullets.99'],
    ['a nonsense path', 'not.a.real.path'],
    ['an empty path', ''],
    ['a path with traversal in it', 'experience.../../bullets.0'],
  ])('ignores %s rather than throwing', (_label, targetPath) => {
    // A stored change set can predate an edit to the resume. Applying a stale
    // path must be a no-op, not a crash and not a write somewhere else.
    const original = resume()
    const result = applyDecisions(original, [change({ targetPath, decision: 'accepted' })])

    expect(result).toEqual(original)
  })

  it('ignores an accepted change whose text is null', () => {
    const original = resume()
    const result = applyDecisions(original, [change({ decision: 'accepted', after: null })])

    expect(result).toEqual(original)
  })
})

describe('reordering', () => {
  it('reorders experience entries', () => {
    const result = applyDecisions(resume(), [
      change({
        targetPath: 'experience',
        action: 'reordered',
        before: null,
        after: null,
        decision: 'accepted',
        orderedItems: ['exp-2', 'exp-1'],
      }),
    ])

    expect(result.experience.map((entry) => entry.id)).toEqual(['exp-2', 'exp-1'])
  })

  it('reorders a skills group', () => {
    const result = applyDecisions(resume(), [
      change({
        targetPath: 'skills.grp-1.items',
        action: 'reordered',
        before: null,
        after: null,
        decision: 'accepted',
        orderedItems: ['SQL', 'Python', 'Go'],
      }),
    ])

    expect(result.skills[0]?.items).toEqual(['SQL', 'Python', 'Go'])
  })

  it.each([
    ['drops an entry', ['exp-1']],
    ['duplicates an entry', ['exp-1', 'exp-1']],
    ['introduces an unknown entry', ['exp-1', 'exp-2', 'exp-3']],
    ['is empty', []],
  ])('refuses an order that %s', (_label, orderedItems) => {
    // A stale order that is not a permutation would drop or duplicate a role.
    // Losing a job off someone's resume silently is the worst outcome here.
    const original = resume()
    const result = applyDecisions(original, [
      change({
        targetPath: 'experience',
        action: 'reordered',
        before: null,
        after: null,
        decision: 'accepted',
        orderedItems,
      }),
    ])

    expect(result.experience.map((entry) => entry.id)).toEqual(
      original.experience.map((entry) => entry.id),
    )
  })

  it('does not reorder on a pending decision', () => {
    const result = applyDecisions(resume(), [
      change({
        targetPath: 'experience',
        action: 'reordered',
        before: null,
        after: null,
        decision: 'pending',
        orderedItems: ['exp-2', 'exp-1'],
      }),
    ])

    expect(result.experience.map((entry) => entry.id)).toEqual(['exp-1', 'exp-2'])
  })

  it('refuses a reorder of an unknown skills group', () => {
    const original = resume()
    const result = applyDecisions(original, [
      change({
        targetPath: 'skills.grp-missing.items',
        action: 'reordered',
        before: null,
        after: null,
        decision: 'accepted',
        orderedItems: ['Go', 'Python'],
      }),
    ])

    expect(result).toEqual(original)
  })
})

describe('the input is never mutated', () => {
  it('leaves the caller original untouched', () => {
    const original = resume()
    const snapshot = structuredClone(original)

    applyDecisions(original, [change({ decision: 'accepted' })])

    // The base profile is a stored row. Mutating it in place would write an
    // accepted change into the resume the user never asked to change.
    expect(original).toEqual(snapshot)
  })
})

describe('resolvedText', () => {
  it.each([
    ['accepted', 'accepted', REWRITE],
    ['rejected', 'rejected', BULLET],
    ['pending', 'pending', BULLET],
  ] as const)('returns the right text for %s', (_label, decision, expected) => {
    expect(resolvedText(change({ decision }))).toBe(expected)
  })

  it('prefers the user edit', () => {
    expect(resolvedText(change({ decision: 'edited', editedText: 'Mine' }))).toBe('Mine')
  })

  it('falls back to the proposal when an edit is empty', () => {
    expect(resolvedText(change({ decision: 'edited', editedText: null }))).toBe(REWRITE)
  })
})

describe('summarizeChanges', () => {
  it('counts each action separately', () => {
    const summary = summarizeChanges([
      change({ action: 'added' }),
      change({ action: 'modified' }),
      change({ action: 'modified' }),
      change({ action: 'removed' }),
      change({ action: 'reordered' }),
    ])

    expect(summary).toEqual({ added: 1, modified: 2, removed: 1, reordered: 1 })
  })

  it('returns zeroes for no changes', () => {
    expect(summarizeChanges([])).toEqual({ added: 0, modified: 0, removed: 0, reordered: 0 })
  })
})
