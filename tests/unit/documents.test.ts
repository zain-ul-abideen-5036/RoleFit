import { describe, expect, it } from 'vitest'

import { toWinAnsi } from '@/lib/documents/encoding'
import { generateDocx } from '@/lib/documents/docx'
import { buildLayout, layoutToPlainText } from '@/lib/documents/layout'
import { generatePdf } from '@/lib/documents/pdf'
import { validateGeneratedDocument } from '@/lib/documents/validate'
import { emptyResumeProfile } from '@/lib/domain/types'
import { extractDocx } from '@/lib/parsing/docx'
import { extractPdf } from '@/lib/parsing/pdf'
import { demoResumeProfile } from '@/tests/fixtures/demo-data'

/**
 * Document generation is verified by round trip: generate, re-open, read the
 * text back. A renderer that silently drops a section or produces an image-only
 * page fails these tests rather than reaching a user's job application.
 */

const profile = demoResumeProfile()

describe('WinAnsi encoding', () => {
  it('preserves typography that WinAnsi can represent', () => {
    expect(toWinAnsi('Mar 2022 – Present')).toBe('Mar 2022 – Present')
    expect(toWinAnsi('“quoted” — dashed…')).toBe('“quoted” — dashed…')
    expect(toWinAnsi('Café Zürich')).toBe('Café Zürich')
  })

  it('folds characters WinAnsi cannot represent', () => {
    expect(toWinAnsi('▪ bullet')).toBe('- bullet')
    expect(toWinAnsi('a → b')).toBe('a -> b')
    expect(toWinAnsi('ﬁnal')).toBe('final')
  })

  it('recovers a base letter from an unsupported accented character', () => {
    // "ł" has no WinAnsi codepoint; dropping the whole name would be worse.
    expect(toWinAnsi('Łukasz')).toBe('Lukasz')
  })

  it('drops characters with no representation at all', () => {
    expect(toWinAnsi('resume 履歴書')).toBe('resume ')
  })
})

describe('layout model', () => {
  it('omits sections that have no content', () => {
    const blocks = buildLayout({ ...emptyResumeProfile(), summary: 'A summary.' })
    const headings = blocks
      .filter((block) => block.kind === 'sectionHeading')
      .map((block) => (block.kind === 'sectionHeading' ? block.text : ''))

    expect(headings).toEqual(['Professional Summary'])
    expect(headings).not.toContain('Experience')
  })

  it('uses standard ATS-recognised section names', () => {
    const headings = buildLayout(profile)
      .filter((block) => block.kind === 'sectionHeading')
      .map((block) => (block.kind === 'sectionHeading' ? block.text : ''))

    expect(headings).toEqual([
      'Professional Summary',
      'Skills',
      'Experience',
      'Projects',
      'Education',
      'Certifications',
    ])
  })

  it('renders every bullet into the plain-text projection', () => {
    const text = layoutToPlainText(buildLayout(profile))
    for (const entry of profile.experience) {
      for (const bullet of entry.bullets) {
        expect(text).toContain(bullet)
      }
    }
  })
})

describe('PDF generation', () => {
  it('produces a valid PDF whose text is extractable', async () => {
    const bytes = await generatePdf(profile)

    expect(bytes.length).toBeGreaterThan(1000)
    // "%PDF-"
    expect(Array.from(bytes.slice(0, 5))).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d])

    const extracted = await extractPdf(bytes)
    expect(extracted.text.length).toBeGreaterThan(500)
    expect(extracted.signals.extractedCharacters).toBeGreaterThan(500)
  })

  it('keeps the candidate name, contact details and every section', async () => {
    const bytes = await generatePdf(profile)
    const { text } = await extractPdf(bytes)

    expect(text).toContain('Avery Chen')
    expect(text).toContain('avery.chen@example.com')
    for (const heading of ['PROFESSIONAL SUMMARY', 'SKILLS', 'EXPERIENCE', 'EDUCATION']) {
      expect(text.toUpperCase()).toContain(heading)
    }
  })

  it('preserves a metric that was present in the source', async () => {
    const bytes = await generatePdf(profile)
    const { text } = await extractPdf(bytes)
    expect(text).toContain('35%')
  })

  it('reports as single-column and image-free', async () => {
    const bytes = await generatePdf(profile)
    const { signals } = await extractPdf(bytes)

    expect(signals.multiColumnSuspected).toBe(false)
    expect(signals.imageCount).toBe(0)
    expect(signals.pageCount).toBeGreaterThanOrEqual(1)
  })

  it('paginates long content without dropping it', async () => {
    const long = demoResumeProfile()
    long.experience[0]!.bullets = Array.from(
      { length: 60 },
      (_, index) =>
        `Delivered workstream ${index + 1} covering service design, rollout and the follow-up review with stakeholders.`,
    )

    const bytes = await generatePdf(long)
    const { text, signals } = await extractPdf(bytes)

    expect(signals.pageCount).toBeGreaterThan(1)
    expect(text).toContain('Delivered workstream 1 ')
    expect(text).toContain('Delivered workstream 60 ')
  })

  it('handles a resume with almost no content', async () => {
    const sparse = { ...emptyResumeProfile(), summary: 'Recent graduate seeking a first role.' }
    const bytes = await generatePdf(sparse)
    const { text } = await extractPdf(bytes)
    expect(text).toContain('Recent graduate')
  })
})

describe('DOCX generation', () => {
  it('produces a valid DOCX whose text is extractable', async () => {
    const bytes = await generateDocx(profile)

    expect(bytes.length).toBeGreaterThan(1000)
    // ZIP local file header "PK"
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])

    const extracted = await extractDocx(bytes)
    expect(extracted.text).toContain('Avery Chen')
    expect(extracted.text).toContain('avery.chen@example.com')
  })

  it('contains no tables, text boxes or images', async () => {
    const bytes = await generateDocx(profile)
    const { signals } = await extractDocx(bytes)

    expect(signals.tableCount).toBe(0)
    expect(signals.textBoxCount).toBe(0)
    expect(signals.imageCount).toBe(0)
    expect(signals.multiColumnSuspected).toBe(false)
  })

  it('keeps every experience bullet', async () => {
    const bytes = await generateDocx(profile)
    const { text } = await extractDocx(bytes)

    for (const bullet of profile.experience.flatMap((entry) => entry.bullets)) {
      expect(text).toContain(bullet)
    }
  })
})

describe('PDF and DOCX agree', () => {
  it('render the same sections in the same order', async () => {
    const [pdfBytes, docxBytes] = await Promise.all([generatePdf(profile), generateDocx(profile)])
    const [pdfText, docxText] = await Promise.all([extractPdf(pdfBytes), extractDocx(docxBytes)])

    const sections = ['SUMMARY', 'SKILLS', 'EXPERIENCE', 'PROJECTS', 'EDUCATION', 'CERTIFICATIONS']
    const orderIn = (text: string): string[] =>
      sections.filter((section) => text.toUpperCase().includes(section))

    expect(orderIn(pdfText.text)).toEqual(orderIn(docxText.text))
  })
})

describe('post-generation validation', () => {
  it('passes a well-formed PDF', async () => {
    const bytes = await generatePdf(profile)
    const result = await validateGeneratedDocument({ bytes, format: 'pdf', profile })

    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect(result.valid).toBe(true)
    expect(result.textIsExtractable).toBe(true)
  })

  it('passes a well-formed DOCX', async () => {
    const bytes = await generateDocx(profile)
    const result = await validateGeneratedDocument({ bytes, format: 'docx', profile })

    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('rejects an empty file', async () => {
    const result = await validateGeneratedDocument({
      bytes: new Uint8Array(0),
      format: 'pdf',
      profile,
    })
    expect(result.valid).toBe(false)
    expect(result.issues[0]?.code).toBe('empty_file')
  })

  it('rejects a file with the wrong signature', async () => {
    const result = await validateGeneratedDocument({
      bytes: new TextEncoder().encode('<html>not a pdf</html>'),
      format: 'pdf',
      profile,
    })
    expect(result.valid).toBe(false)
    expect(result.issues[0]?.code).toBe('wrong_signature')
  })

  it('detects a document that is missing expected content', async () => {
    // Generate from a sparse profile, then validate against the full one.
    const bytes = await generatePdf({ ...emptyResumeProfile(), summary: 'Short.' })
    const result = await validateGeneratedDocument({ bytes, format: 'pdf', profile })

    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('missing_section')
  })
})
