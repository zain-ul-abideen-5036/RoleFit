import { describe, expect, it } from 'vitest'

import { generateDocx } from '@/lib/documents/docx'
import { generatePdf } from '@/lib/documents/pdf'
import { validateGeneratedDocument } from '@/lib/documents/validate'
import { emptyResumeProfile } from '@/lib/domain/types'
import { demoResumeProfile } from '@/tests/fixtures/demo-data'

/**
 * Post-generation validation.
 *
 * This runs on a file the product has just produced and is about to hand to
 * someone applying for a job. It is the last point at which a silently broken
 * export can be caught, so the tests are about failing loudly rather than
 * about the happy path — a validator that only recognises good files is not
 * doing anything.
 */

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]
const ZIP_HEADER = [0x50, 0x4b, 0x03, 0x04]

function codes(issues: { code: string }[]): string[] {
  return issues.map((issue) => issue.code)
}

describe('a document we actually generated', () => {
  it('passes for a real PDF', async () => {
    const profile = demoResumeProfile()
    const result = await validateGeneratedDocument({
      bytes: await generatePdf(profile),
      format: 'pdf',
      profile,
    })

    expect(result.valid, JSON.stringify(result.issues)).toBe(true)
    expect(result.textIsExtractable).toBe(true)
    expect(result.extractedCharacters).toBeGreaterThan(0)
  }, 30_000)

  it('passes for a real DOCX', async () => {
    const profile = demoResumeProfile()
    const result = await validateGeneratedDocument({
      bytes: await generateDocx(profile),
      format: 'docx',
      profile,
    })

    expect(result.valid, JSON.stringify(result.issues)).toBe(true)
    expect(result.textIsExtractable).toBe(true)
  }, 30_000)

  it('reports a page count for a PDF', async () => {
    const profile = demoResumeProfile()
    const result = await validateGeneratedDocument({
      bytes: await generatePdf(profile),
      format: 'pdf',
      profile,
    })

    expect(result.pageCount).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it('finds the candidate name in what it read back', async () => {
    // The point of re-opening the file: proving the content survived the
    // renderer rather than trusting that it did.
    const profile = demoResumeProfile()
    const result = await validateGeneratedDocument({
      bytes: await generatePdf(profile),
      format: 'pdf',
      profile,
    })

    expect(codes(result.issues)).not.toContain('missing_contact')
  }, 30_000)
})

describe('a file that is not a document at all', () => {
  it('refuses an empty file', async () => {
    const result = await validateGeneratedDocument({
      bytes: new Uint8Array(0),
      format: 'pdf',
      profile: demoResumeProfile(),
    })

    expect(result.valid).toBe(false)
    expect(codes(result.issues)).toContain('empty_file')
  })

  it('refuses bytes with no PDF signature', async () => {
    // A renderer that fell over could plausibly produce an HTML error page.
    const result = await validateGeneratedDocument({
      bytes: new TextEncoder().encode('<html><body>500</body></html>'),
      format: 'pdf',
      profile: demoResumeProfile(),
    })

    expect(result.valid).toBe(false)
    expect(codes(result.issues)).toContain('wrong_signature')
  })

  it('refuses bytes with no ZIP signature for a DOCX', async () => {
    const result = await validateGeneratedDocument({
      bytes: new TextEncoder().encode('not a docx'),
      format: 'docx',
      profile: demoResumeProfile(),
    })

    expect(codes(result.issues)).toContain('wrong_signature')
  })

  it('names the format in the signature message, so a mix-up is obvious', async () => {
    const result = await validateGeneratedDocument({
      bytes: new TextEncoder().encode('nope'),
      format: 'docx',
      profile: demoResumeProfile(),
    })

    expect(result.issues[0]?.message).toContain('DOCX')
  })

  it('stops at the signature rather than trying to parse further', async () => {
    // No point reporting "no extractable text" about a file that is not a PDF.
    // One clear cause beats three symptoms.
    const result = await validateGeneratedDocument({
      bytes: new TextEncoder().encode('nope'),
      format: 'pdf',
      profile: demoResumeProfile(),
    })

    expect(result.issues).toHaveLength(1)
  })

  it('refuses a PDF that is only a header', async () => {
    // Correct signature, no content — the shape a truncated write takes.
    const result = await validateGeneratedDocument({
      bytes: new Uint8Array(PDF_HEADER),
      format: 'pdf',
      profile: demoResumeProfile(),
    })

    expect(result.valid).toBe(false)
  })

  it('refuses a DOCX that is only a header', async () => {
    const result = await validateGeneratedDocument({
      bytes: new Uint8Array(ZIP_HEADER),
      format: 'docx',
      profile: demoResumeProfile(),
    })

    expect(result.valid).toBe(false)
  })

  it('does not throw on a file it cannot parse', async () => {
    // A parser exception here would surface to the user as a 500 on a
    // download, with no indication of what went wrong.
    const bytes = new Uint8Array([...PDF_HEADER, ...new Array(200).fill(0xff)])

    await expect(
      validateGeneratedDocument({ bytes, format: 'pdf', profile: demoResumeProfile() }),
    ).resolves.toBeDefined()
  })
})

describe('severity', () => {
  it('marks a structural failure as an error, not a warning', async () => {
    const result = await validateGeneratedDocument({
      bytes: new Uint8Array(0),
      format: 'pdf',
      profile: demoResumeProfile(),
    })

    expect(result.issues.every((issue) => issue.severity === 'error')).toBe(true)
  })

  it('never reports valid alongside an error', async () => {
    // The two must not be able to disagree: a caller checks `valid` and sends
    // the file.
    const result = await validateGeneratedDocument({
      bytes: new TextEncoder().encode('nope'),
      format: 'pdf',
      profile: demoResumeProfile(),
    })

    const hasError = result.issues.some((issue) => issue.severity === 'error')
    expect(hasError && result.valid).toBe(false)
  })

  it('gives every issue a message a person could act on', async () => {
    const result = await validateGeneratedDocument({
      bytes: new Uint8Array(0),
      format: 'pdf',
      profile: demoResumeProfile(),
    })

    for (const issue of result.issues) {
      expect(issue.message, issue.code).toMatch(/\S/)
      // Not the enum name dressed up as prose.
      expect(issue.message, issue.code).not.toBe(issue.code)
    }
  })
})

describe('an empty profile', () => {
  it('generates and validates without throwing', async () => {
    // A resume that parsed to almost nothing still has to produce a file
    // rather than an exception; the issues explain what is missing.
    const profile = emptyResumeProfile()
    const result = await validateGeneratedDocument({
      bytes: await generatePdf(profile),
      format: 'pdf',
      profile,
    })

    expect(result.issues.length).toBeGreaterThan(0)
    expect(result).toHaveProperty('extractedCharacters')
  }, 30_000)
})
