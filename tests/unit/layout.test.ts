import { describe, expect, it } from 'vitest'

import { buildLayout, layoutToPlainText, type LayoutBlock } from '@/lib/documents/layout'
import type { ResumeProfile } from '@/lib/domain/types'
import { emptyResumeProfile } from '@/lib/domain/types'
import { demoResumeProfile } from '@/tests/fixtures/demo-data'

/**
 * The layout model.
 *
 * One block list feeds the PDF renderer, the DOCX renderer and the on-screen
 * preview, which is what stops the preview drifting from the downloaded file.
 * So the properties worth pinning are structural: what the model *cannot*
 * express, which sections appear, and in what order.
 *
 * There is deliberately no table, column or image block. An ATS-hostile layout
 * is not representable, rather than merely discouraged.
 */

function kinds(blocks: readonly LayoutBlock[]): string[] {
  return blocks.map((block) => block.kind)
}

function headings(blocks: readonly LayoutBlock[]): string[] {
  return blocks
    .filter(
      (block): block is Extract<LayoutBlock, { kind: 'sectionHeading' }> =>
        block.kind === 'sectionHeading',
    )
    .map((block) => block.text)
}

describe('what the model cannot express', () => {
  it('emits only known block kinds', () => {
    const allowed = new Set([
      'name',
      'contact',
      'sectionHeading',
      'paragraph',
      'entryHeader',
      'entrySubheader',
      'bullet',
      'labelledList',
      'spacer',
    ])

    for (const kind of kinds(buildLayout(demoResumeProfile()))) {
      expect(allowed.has(kind), kind).toBe(true)
    }
  })

  it('has no table, column or image block for a hostile layout to use', () => {
    const emitted = new Set(kinds(buildLayout(demoResumeProfile())))

    for (const forbidden of ['table', 'column', 'image', 'textBox']) {
      expect(emitted.has(forbidden), forbidden).toBe(false)
    }
  })
})

describe('section headings', () => {
  it('uses standard, ATS-recognised names rather than creative ones', () => {
    // A parser looks for "Experience", not "Where I've Made An Impact".
    const found = headings(buildLayout(demoResumeProfile()))

    expect(found).toContain('Experience')
    expect(found).toContain('Skills')
  })

  it('omits a section with no content rather than emitting an empty heading', () => {
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      personal: { ...emptyResumeProfile().personal, fullName: 'Avery Chen' },
      summary: 'Backend engineer.',
    }

    const found = headings(buildLayout(profile))
    expect(found).toContain('Professional Summary')
    for (const absent of ['Experience', 'Skills', 'Education', 'Projects', 'Certifications']) {
      expect(found, absent).not.toContain(absent)
    }
  })

  it('keeps a custom section under its own heading', () => {
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      additionalSections: [{ id: 'sec-1', heading: 'Publications', items: ['A paper about X'] }],
    }

    expect(headings(buildLayout(profile))).toContain('Publications')
  })

  it('drops a custom section whose items are all blank', () => {
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      additionalSections: [{ id: 'sec-1', heading: 'Publications', items: ['', '   '] }],
    }

    expect(headings(buildLayout(profile))).not.toContain('Publications')
  })

  it('includes achievements when there are any', () => {
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      achievements: ['Speaker at a conference nobody has heard of'],
    }

    expect(headings(buildLayout(profile))).toContain('Achievements')
  })

  it('drops achievements that are only whitespace', () => {
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      achievements: ['   ', ''],
    }

    expect(headings(buildLayout(profile))).not.toContain('Achievements')
  })
})

describe('ordering', () => {
  it('puts the name first', () => {
    expect(kinds(buildLayout(demoResumeProfile()))[0]).toBe('name')
  })

  it('puts contact details before any section heading', () => {
    const blocks = buildLayout(demoResumeProfile())
    const contactAt = kinds(blocks).indexOf('contact')
    const firstHeadingAt = kinds(blocks).indexOf('sectionHeading')

    expect(contactAt).toBeGreaterThanOrEqual(0)
    expect(contactAt).toBeLessThan(firstHeadingAt)
  })

  it('is deterministic for the same profile', () => {
    expect(buildLayout(demoResumeProfile())).toEqual(buildLayout(demoResumeProfile()))
  })
})

describe('spacing', () => {
  it('leaves no trailing spacer, so a page does not end in blank space', () => {
    const blocks = buildLayout(demoResumeProfile())
    expect(blocks.at(-1)?.kind).not.toBe('spacer')
  })

  it('leaves no trailing spacer for a single-section resume either', () => {
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      achievements: ['One achievement worth mentioning'],
    }

    expect(buildLayout(profile).at(-1)?.kind).not.toBe('spacer')
  })

  it('emits nothing at all for a wholly empty profile', () => {
    // Not a spacer, not an empty heading — nothing.
    const blocks = buildLayout(emptyResumeProfile())
    expect(blocks.every((block) => block.kind !== 'spacer')).toBe(true)
  })
})

describe('entry headers', () => {
  it('carries the role, the company and the dates separately', () => {
    // Kept as three fields rather than one pre-joined string so each renderer
    // can align the dates to its own right margin.
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      experience: [
        {
          id: 'exp-1',
          title: 'Senior Engineer',
          company: 'Acme',
          location: null,
          dates: { start: '2020-01', end: '2024-03', isCurrent: false },
          bullets: ['Did the work'],
        },
      ],
    }

    const header = buildLayout(profile).find(
      (block): block is Extract<LayoutBlock, { kind: 'entryHeader' }> =>
        block.kind === 'entryHeader',
    )

    expect(header?.primary).toContain('Senior Engineer')
    expect(header?.trailing).toContain('2020-01')
    expect(header?.trailing).toContain('2024-03')
  })

  it('omits the date range entirely when there are no dates', () => {
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      experience: [
        {
          id: 'exp-1',
          title: 'Engineer',
          company: 'Acme',
          location: null,
          dates: { start: null, end: null, isCurrent: false },
          bullets: ['Did the work'],
        },
      ],
    }

    const header = buildLayout(profile).find(
      (block): block is Extract<LayoutBlock, { kind: 'entryHeader' }> =>
        block.kind === 'entryHeader',
    )

    // An empty date column would leave a dangling separator.
    expect(header?.trailing).toBeNull()
  })

  it('shows a single date when only one end is known', () => {
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      education: [
        {
          id: 'edu-1',
          institution: 'State University',
          degree: 'BSc',
          field: null,
          location: null,
          dates: { start: null, end: '2018', isCurrent: false },
          details: [],
        },
      ],
    }

    const header = buildLayout(profile).find(
      (block): block is Extract<LayoutBlock, { kind: 'entryHeader' }> =>
        block.kind === 'entryHeader',
    )

    expect(header?.trailing).toBe('2018')
  })
})

describe('layoutToPlainText', () => {
  it('renders every text-bearing block', () => {
    const text = layoutToPlainText(buildLayout(demoResumeProfile()))

    expect(text.length).toBeGreaterThan(100)
    expect(text).toContain('Built')
  })

  it('uppercases section headings, which is the ATS-friendly plain-text form', () => {
    const text = layoutToPlainText(buildLayout(demoResumeProfile()))

    expect(text).toContain('EXPERIENCE')
    expect(text).toContain('SKILLS')
  })

  it('prefixes bullets so a flat reader can still see the list structure', () => {
    const text = layoutToPlainText(buildLayout(demoResumeProfile()))
    expect(text).toMatch(/^- \S/m)
  })

  it('is what the validator reads back, so it must include the name', () => {
    const profile = demoResumeProfile()
    const text = layoutToPlainText(buildLayout(profile))

    expect(text).toContain(profile.personal.fullName ?? '')
  })

  it('joins a labelled list so the label stays with its items', () => {
    const profile: ResumeProfile = {
      ...emptyResumeProfile(),
      skills: [{ id: 'grp-1', category: 'Languages', items: ['Python', 'Go'] }],
    }

    const text = layoutToPlainText(buildLayout(profile))
    expect(text).toMatch(/Languages.*Python.*Go/)
  })

  it('returns an empty string for no blocks', () => {
    expect(layoutToPlainText([])).toBe('')
  })

  it('does not emit the word "spacer"', () => {
    // Spacers are geometry, not content. Leaking the kind name into the text
    // would put it into the extracted-text check as well.
    expect(layoutToPlainText(buildLayout(demoResumeProfile()))).not.toContain('spacer')
  })
})
