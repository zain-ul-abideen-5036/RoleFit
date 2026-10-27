import { describe, expect, it } from 'vitest'

import { generateDocx } from '@/lib/documents/docx'
import { buildLayout, layoutToPlainText, SECTION_TITLES } from '@/lib/documents/layout'
import { generatePdf } from '@/lib/documents/pdf'
import {
  DEFAULT_TEMPLATE_ID,
  TEMPLATE_IDS,
  TEMPLATES,
  isTemplateId,
  resolveTemplate,
  type SectionKey,
} from '@/lib/documents/templates'
import { validateGeneratedDocument } from '@/lib/documents/validate'
import { demoResumeProfile } from '@/tests/fixtures/demo-data'

/**
 * Resume templates.
 *
 * A template is allowed to change how a resume looks and the order of its
 * sections, and nothing else. These tests hold every template to the same
 * export gate as the default, and check that no template can drop, add or
 * rename content.
 */

const ALL_SECTIONS: readonly SectionKey[] = [
  'summary',
  'skills',
  'experience',
  'projects',
  'education',
  'certifications',
  'achievements',
]

function headings(templateId: (typeof TEMPLATE_IDS)[number]): string[] {
  return buildLayout(demoResumeProfile(), TEMPLATES[templateId]).flatMap((block) =>
    block.kind === 'sectionHeading' ? [block.text] : [],
  )
}

describe('the template registry', () => {
  it('orders every standard section exactly once in every template', () => {
    for (const id of TEMPLATE_IDS) {
      expect([...TEMPLATES[id].sectionOrder].sort(), id).toEqual([...ALL_SECTIONS].sort())
    }
  })

  it('keys each template by its own id', () => {
    for (const id of TEMPLATE_IDS) expect(TEMPLATES[id].id).toBe(id)
  })

  it('falls back to the default for a missing or unknown id', () => {
    expect(resolveTemplate().id).toBe(DEFAULT_TEMPLATE_ID)
    expect(resolveTemplate(null).id).toBe(DEFAULT_TEMPLATE_ID)
    expect(resolveTemplate('two-column-sidebar').id).toBe(DEFAULT_TEMPLATE_ID)
    expect(isTemplateId('modern')).toBe(true)
    expect(isTemplateId('__proto__')).toBe(false)
  })
})

describe('layout under a template', () => {
  it('leaves the default layout unchanged', () => {
    const profile = demoResumeProfile()
    expect(buildLayout(profile, resolveTemplate())).toEqual(buildLayout(profile))
  })

  it('renders sections in the template order', () => {
    const graduate = headings('graduate')
    expect(graduate.indexOf(SECTION_TITLES.education)).toBeLessThan(
      graduate.indexOf(SECTION_TITLES.experience),
    )

    const executive = headings('executive')
    expect(executive.indexOf(SECTION_TITLES.experience)).toBeLessThan(
      executive.indexOf(SECTION_TITLES.skills),
    )
  })

  it('changes order only, never content', () => {
    const profile = demoResumeProfile()
    const lines = (id: (typeof TEMPLATE_IDS)[number]) =>
      layoutToPlainText(buildLayout(profile, TEMPLATES[id])).split('\n').filter(Boolean).sort()

    const baseline = lines(DEFAULT_TEMPLATE_ID)
    for (const id of TEMPLATE_IDS) expect(lines(id), id).toEqual(baseline)
  })
})

describe.each(TEMPLATE_IDS)('the %s template', (id) => {
  it('produces a PDF that passes export validation', async () => {
    const profile = demoResumeProfile()
    const result = await validateGeneratedDocument({
      bytes: await generatePdf(profile, TEMPLATES[id]),
      format: 'pdf',
      profile,
    })
    expect(result.valid, JSON.stringify(result.issues)).toBe(true)
    expect(result.textIsExtractable).toBe(true)
  }, 30_000)

  it('produces a DOCX that passes export validation', async () => {
    const profile = demoResumeProfile()
    const result = await validateGeneratedDocument({
      bytes: await generateDocx(profile, TEMPLATES[id]),
      format: 'docx',
      profile,
    })
    expect(result.valid, JSON.stringify(result.issues)).toBe(true)
    expect(result.textIsExtractable).toBe(true)
  }, 30_000)
})
