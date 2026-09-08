import { describe, expect, it } from 'vitest'

import type { ResumeProfile } from '@/lib/domain/types'
import { emptyResumeProfile } from '@/lib/domain/types'
import { buildEvidenceIndex, evidenceCorpus, toEvidence } from '@/lib/matching/evidence'
import { demoResumeProfile } from '@/tests/fixtures/demo-data'

/**
 * The evidence index.
 *
 * Two things depend on it being right. Every match cites a span from here, so a
 * missing path means a match the anti-fabrication validator cannot verify. And
 * the section weights are what stop a keyword-stuffed skills block outscoring
 * someone who actually did the work.
 */

function sections(profile: ResumeProfile): string[] {
  return [...new Set(buildEvidenceIndex(profile).map((item) => item.section))]
}

describe('what gets indexed', () => {
  it('covers every content-bearing section of a full resume', () => {
    const found = sections(demoResumeProfile())

    // A section absent from the index is a section no match can ever cite.
    expect(found).toContain('experience')
    expect(found).toContain('skills')
    expect(found).toContain('summary')
  })

  it('indexes certifications with their issuer', () => {
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      certifications: [
        {
          id: 'cert-1',
          name: 'AWS Solutions Architect',
          issuer: 'Amazon Web Services',
          issued: null,
          expires: null,
          credentialId: null,
        },
      ],
    }

    const item = buildEvidenceIndex(profile).find((entry) => entry.section === 'certifications')
    expect(item?.excerpt).toContain('AWS Solutions Architect')
    expect(item?.excerpt).toContain('Amazon Web Services')
  })

  it('indexes a certification with no issuer without a dangling separator', () => {
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      certifications: [
        {
          id: 'cert-1',
          name: 'CKA',
          issuer: null,
          issued: null,
          expires: null,
          credentialId: null,
        },
      ],
    }

    const item = buildEvidenceIndex(profile).find((entry) => entry.section === 'certifications')
    expect(item?.excerpt).toBe('CKA')
  })

  it('indexes achievements', () => {
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      achievements: ['Cut deploy time from an hour to four minutes'],
    }

    expect(sections(profile)).toContain('achievements')
  })

  it('indexes custom sections', () => {
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      additionalSections: [{ id: 'sec-1', heading: 'Publications', items: ['A paper about X'] }],
    }

    expect(sections(profile)).toContain('additional')
  })

  it('skips blank and whitespace-only content rather than indexing empty spans', () => {
    // An empty span would be a citable piece of evidence that says nothing.
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      summary: '   ',
      achievements: ['', '  '],
      additionalSections: [{ id: 'sec-1', heading: 'Publications', items: ['', '   '] }],
    }

    expect(buildEvidenceIndex(profile)).toEqual([])
  })

  it('trims surrounding whitespace from what it indexes', () => {
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      achievements: ['   Cut deploy time   '],
    }

    expect(buildEvidenceIndex(profile)[0]?.excerpt).toBe('Cut deploy time')
  })

  it('returns nothing for an empty profile', () => {
    expect(buildEvidenceIndex(emptyResumeProfile())).toEqual([])
  })
})

describe('paths', () => {
  it('gives every span an addressable path', () => {
    // The path is how a rewrite is resolved back to the exact bullet it
    // targets, so a span without one cannot be acted on.
    for (const item of buildEvidenceIndex(demoResumeProfile())) {
      expect(item.path, item.excerpt).toMatch(/\S/)
    }
  })

  it('makes every path unique', () => {
    const paths = buildEvidenceIndex(demoResumeProfile()).map((item) => item.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('addresses a bullet by its entry id and index', () => {
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      experience: [
        {
          id: 'exp-1',
          title: 'Engineer',
          company: 'Acme',
          location: null,
          dates: { start: '2020-01', end: null, isCurrent: true },
          bullets: ['First bullet here', 'Second bullet here'],
        },
      ],
    }

    const paths = buildEvidenceIndex(profile).map((item) => item.path)
    expect(paths).toContain('experience.exp-1.bullets.0')
    expect(paths).toContain('experience.exp-1.bullets.1')
  })
})

describe('section weights', () => {
  it('weights an experience bullet above a skills-list entry', () => {
    // A skill listed is a claim; the same skill demonstrated in a bullet is
    // proof. This is what stops a keyword-stuffed skills block dominating.
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      skills: [{ id: 'grp-1', category: 'Languages', items: ['Python'] }],
      experience: [
        {
          id: 'exp-1',
          title: 'Engineer',
          company: 'Acme',
          location: null,
          dates: { start: '2020-01', end: null, isCurrent: true },
          bullets: ['Built the ingestion pipeline in Python'],
        },
      ],
    }

    const index = buildEvidenceIndex(profile)
    const skill = index.find((item) => item.section === 'skills')!
    const bullet = index.find((item) => item.section === 'experience')!

    expect(bullet.weight).toBeGreaterThan(skill.weight)
  })

  it('weights a summary mention below a skills-list entry', () => {
    // A summary is self-description; a skills list is at least a claim about
    // specifics.
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      summary: 'Python engineer.',
      skills: [{ id: 'grp-1', category: 'Languages', items: ['Python'] }],
    }

    const index = buildEvidenceIndex(profile)
    const summary = index.find((item) => item.section === 'summary')!
    const skill = index.find((item) => item.section === 'skills')!

    expect(summary.weight).toBeLessThan(skill.weight)
  })

  it('gives every span a weight in (0, 1]', () => {
    for (const item of buildEvidenceIndex(demoResumeProfile())) {
      expect(item.weight, item.section).toBeGreaterThan(0)
      expect(item.weight, item.section).toBeLessThanOrEqual(1)
    }
  })

  it('gives experience the maximum weight', () => {
    const index = buildEvidenceIndex(demoResumeProfile())
    const experience = index.find((item) => item.section === 'experience')!
    const highest = Math.max(...index.map((item) => item.weight))

    expect(experience.weight).toBe(highest)
  })
})

describe('evidenceCorpus', () => {
  it('joins every span for keyword counting', () => {
    const corpus = evidenceCorpus(buildEvidenceIndex(demoResumeProfile()))

    expect(corpus).toContain('Python')
    expect(corpus.split('\n').length).toBeGreaterThan(1)
  })

  it('returns an empty string for no spans', () => {
    expect(evidenceCorpus([])).toBe('')
  })

  it('separates spans, so two adjacent ones cannot form a phrase that is not there', () => {
    // Joined without a separator, "Java" ending one span and "Script" opening
    // the next would read as "JavaScript".
    const corpus = evidenceCorpus([
      { section: 'skills', path: 'a', excerpt: 'Java', weight: 0.75 },
      { section: 'skills', path: 'b', excerpt: 'Script', weight: 0.75 },
    ])

    expect(corpus).not.toContain('JavaScript')
  })
})

describe('toEvidence', () => {
  it('strips the internal weight before a span crosses the boundary', () => {
    const item = buildEvidenceIndex(demoResumeProfile())[0]!
    const evidence = toEvidence(item)

    // The weight is a scoring detail. Exposing it invites a caller to
    // reinterpret it, and it means nothing outside the matcher.
    expect(Object.keys(evidence).sort()).toEqual(['excerpt', 'path', 'section'])
  })

  it('preserves the excerpt verbatim', () => {
    const item = buildEvidenceIndex(demoResumeProfile())[0]!
    expect(toEvidence(item).excerpt).toBe(item.excerpt)
  })
})
