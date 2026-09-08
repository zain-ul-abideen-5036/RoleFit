import { describe, expect, it } from 'vitest'

import { analyzeAtsReadiness, generatedDocumentSignals } from '@/lib/ats/analyzer'
import type { AtsCheck, SourceDocumentSignals } from '@/lib/ats/types'
import { emptySourceSignals } from '@/lib/ats/types'
import type { ResumeProfile } from '@/lib/domain/types'
import { emptyResumeProfile } from '@/lib/domain/types'
import { demoResumeProfile } from '@/tests/fixtures/demo-data'

/**
 * ATS readiness checks.
 *
 * The product's promise about this number is that it is an *estimate* produced
 * by named, inspectable checks — never a guarantee. So what these tests hold
 * are the two things that make that promise honest: every check says what it
 * observed, and every non-passing check says what to do about it.
 *
 * Layout checks depend on signals from the extractor rather than on the parsed
 * profile, because a resume's parsed content cannot reveal that it was laid out
 * in two columns.
 */

function signals(overrides: Partial<SourceDocumentSignals> = {}): SourceDocumentSignals {
  return { ...emptySourceSignals(), extractedCharacters: 4000, ...overrides }
}

function check(profile: ResumeProfile, id: string, source = signals()): AtsCheck {
  const found = analyzeAtsReadiness(profile, source).checks.find((entry) => entry.id === id)
  expect(found, `no check with id ${id}`).toBeDefined()
  return found!
}

describe('the shape of every report', () => {
  it('runs every check and reports each one by name', () => {
    const report = analyzeAtsReadiness(demoResumeProfile(), signals())

    expect(report.checks.length).toBeGreaterThanOrEqual(16)
    for (const entry of report.checks) {
      expect(entry.id, 'id').toMatch(/\S/)
      expect(entry.label, entry.id).toMatch(/\S/)
      expect(['completeness', 'structure', 'formatting']).toContain(entry.group)
    }
  })

  it('gives every check a unique id', () => {
    const ids = analyzeAtsReadiness(demoResumeProfile(), signals()).checks.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('always says what it observed', () => {
    // A score with no explanation is exactly the thing this product refuses to
    // be. Every check carries its own evidence.
    for (const entry of analyzeAtsReadiness(emptyResumeProfile(), signals()).checks) {
      expect(entry.detail, entry.id).toMatch(/\S/)
    }
  })

  it('gives a recommendation for everything that did not pass, and none for what did', () => {
    const profiles = [emptyResumeProfile(), demoResumeProfile()]

    for (const profile of profiles) {
      for (const entry of analyzeAtsReadiness(profile, signals()).checks) {
        if (entry.status === 'pass') {
          expect(entry.recommendation, entry.id).toBeNull()
        } else {
          // Telling someone their resume is wrong without saying what to change
          // is worse than saying nothing.
          expect(entry.recommendation, entry.id).toMatch(/\S/)
        }
      }
    }
  })

  it('scores each group between 0 and 100', () => {
    const report = analyzeAtsReadiness(demoResumeProfile(), signals())

    for (const score of [report.structureScore, report.formattingScore, report.completenessScore]) {
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    }
  })

  it('counts every check exactly once across pass, warn and fail', () => {
    const report = analyzeAtsReadiness(demoResumeProfile(), signals())
    const { pass, warn, fail } = report.counts

    expect(pass + warn + fail).toBe(report.checks.length)
  })

  it('is deterministic', () => {
    const first = analyzeAtsReadiness(demoResumeProfile(), signals())
    const second = analyzeAtsReadiness(demoResumeProfile(), signals())
    expect(first).toEqual(second)
  })

  it('scores a complete resume higher than an empty one', () => {
    const complete = analyzeAtsReadiness(demoResumeProfile(), signals())
    const empty = analyzeAtsReadiness(emptyResumeProfile(), signals())

    expect(complete.completenessScore).toBeGreaterThan(empty.completenessScore)
  })
})

describe('completeness checks', () => {
  it('fails when there is no name to identify the candidate', () => {
    expect(check(emptyResumeProfile(), 'contact_name').status).toBe('fail')
  })

  it('fails when there is no email address', () => {
    expect(check(emptyResumeProfile(), 'contact_email').status).toBe('fail')
  })

  it('passes contact checks for a complete resume', () => {
    const profile = demoResumeProfile()

    expect(check(profile, 'contact_name').status).toBe('pass')
    expect(check(profile, 'contact_email').status).toBe('pass')
  })

  it('flags a missing experience section', () => {
    expect(check(emptyResumeProfile(), 'section_experience').status).not.toBe('pass')
  })

  it('flags a missing skills section', () => {
    expect(check(emptyResumeProfile(), 'section_skills').status).not.toBe('pass')
  })

  it('flags a missing summary without treating it as fatal', () => {
    // A resume with no summary is weaker, not unparseable.
    expect(check(emptyResumeProfile(), 'summary_present').status).not.toBe('fail')
  })
})

describe('structure checks', () => {
  function withBullets(bullets: string[]): ResumeProfile {
    return {
      ...demoResumeProfile(),
      experience: [
        {
          id: 'exp-1',
          title: 'Engineer',
          company: 'Acme',
          location: null,
          dates: { start: '2020-01', end: null, isCurrent: true },
          bullets,
        },
      ],
      projects: [],
    }
  }

  it('warns about a bullet that runs past three lines', () => {
    const entry = check(withBullets(['Did a thing. '.repeat(40)]), 'bullet_length')

    expect(entry.status).toBe('warn')
    expect(entry.detail).toContain('1')
  })

  it('warns about a bullet too short to say anything', () => {
    const entry = check(withBullets(['Did stuff.']), 'bullet_length')
    expect(entry.status).toBe('warn')
  })

  it('passes bullets of a readable length', () => {
    const entry = check(
      withBullets([
        'Cut p99 latency by 35% by adding a read-through cache in front of the orders service.',
      ]),
      'bullet_length',
    )
    expect(entry.status).toBe('pass')
  })

  it('does not complain about bullets a resume does not have', () => {
    expect(check(withBullets([]), 'bullet_length').status).toBe('pass')
  })
})

describe('layout checks read the extractor signals, not the parsed text', () => {
  it('fails a multi-column layout', () => {
    // A parser reads a two-column resume in the wrong order, interleaving the
    // columns. Nothing in the parsed profile can reveal this.
    const entry = check(
      demoResumeProfile(),
      'single_column',
      signals({ multiColumnSuspected: true }),
    )

    expect(entry.status).toBe('fail')
    expect(entry.recommendation).toMatch(/\S/)
  })

  it('passes a single-column layout', () => {
    expect(check(demoResumeProfile(), 'single_column', signals()).status).toBe('pass')
  })

  it('flags tables', () => {
    expect(check(demoResumeProfile(), 'no_tables', signals({ tableCount: 3 })).status).not.toBe(
      'pass',
    )
  })

  it('flags text boxes, whose content many parsers drop entirely', () => {
    expect(
      check(demoResumeProfile(), 'no_text_boxes', signals({ textBoxCount: 2 })).status,
    ).not.toBe('pass')
  })

  it('fails a document with no extractable text at all', () => {
    // Zero extracted characters means a scanned page — the resume is invisible
    // to an ATS no matter what it says, so this is fatal rather than advisory.
    const entry = check(
      demoResumeProfile(),
      'text_is_extractable',
      signals({ extractedCharacters: 0 }),
    )

    expect(entry.status).toBe('fail')
    expect(entry.recommendation).toContain('scanned')
  })

  it('only warns on a partial extraction, which may still be salvageable', () => {
    const entry = check(
      demoResumeProfile(),
      'text_is_extractable',
      signals({ extractedCharacters: 120 }),
    )

    expect(entry.status).toBe('warn')
    expect(entry.detail).toContain('120')
  })

  it('passes a document with plenty of extractable text', () => {
    expect(
      check(demoResumeProfile(), 'text_is_extractable', signals({ extractedCharacters: 4000 }))
        .status,
    ).toBe('pass')
  })
})

describe('formatting checks', () => {
  function withSummary(summary: string): ResumeProfile {
    return { ...demoResumeProfile(), summary }
  }

  it('fails on emoji, which carry no meaning to a parser', () => {
    const entry = check(withSummary('Senior engineer 🚀🔥 shipping fast'), 'safe_characters')

    expect(entry.status).toBe('fail')
    expect(entry.detail).toContain('2')
  })

  it('passes ordinary punctuation', () => {
    expect(
      check(
        withSummary('Engineer with 8 years across payments, search and platform.'),
        'safe_characters',
      ).status,
    ).toBe('pass')
  })

  it('warns when a resume is too short to clear a keyword filter', () => {
    const entry = check({ ...emptyResumeProfile(), summary: 'Engineer.' }, 'length_reasonable')
    expect(entry.status).toBe('warn')
  })

  it('warns when the source document runs past three pages', () => {
    const entry = check(demoResumeProfile(), 'length_reasonable', signals({ pageCount: 5 }))
    expect(entry.status).toBe('warn')
    expect(entry.detail).toContain('5')
  })
})

describe('generatedDocumentSignals', () => {
  it('reports the layout facts our own generator guarantees', () => {
    // These are facts about our output, not assumptions about someone's upload:
    // the layout model has no table, column or image block to begin with.
    const result = generatedDocumentSignals(demoResumeProfile())

    expect(result.multiColumnSuspected).toBe(false)
    expect(result.tableCount).toBe(0)
    expect(result.imageCount).toBe(0)
    expect(result.textBoxCount).toBe(0)
  })

  it('reports real extracted length, so a thin resume is still flagged as thin', () => {
    const full = generatedDocumentSignals(demoResumeProfile())
    const empty = generatedDocumentSignals(emptyResumeProfile())

    expect(full.extractedCharacters).toBeGreaterThan(empty.extractedCharacters)
  })

  it('claims no page count, because that is not known before rendering', () => {
    expect(generatedDocumentSignals(demoResumeProfile()).pageCount).toBeNull()
  })

  it('lets a generated document pass every layout check', () => {
    const profile = demoResumeProfile()
    const report = analyzeAtsReadiness(profile, generatedDocumentSignals(profile))

    for (const id of ['single_column', 'no_tables', 'no_text_boxes', 'no_images_for_content']) {
      expect(report.checks.find((entry) => entry.id === id)?.status, id).toBe('pass')
    }
  })
})
