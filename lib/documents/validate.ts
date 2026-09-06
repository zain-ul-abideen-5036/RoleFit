import 'server-only'

import type { ResumeProfile } from '@/lib/domain/types'
import { buildLayout, layoutToPlainText } from '@/lib/documents/layout'
import { extractDocx } from '@/lib/parsing/docx'
import { extractPdf } from '@/lib/parsing/pdf'
import { logger } from '@/lib/logger'
import { normalizeText } from '@/lib/matching/normalize'

/**
 * Post-generation quality gate.
 *
 * A document is not handed to the user until it has been re-opened and read
 * back. This catches the failures that are invisible at render time — text that
 * did not survive encoding, a section that silently rendered empty, a trailing
 * blank page, or content duplicated by a layout bug.
 */

export interface DocumentValidationIssue {
  code:
    | 'empty_file'
    | 'wrong_signature'
    | 'no_extractable_text'
    | 'text_too_short'
    | 'missing_section'
    | 'missing_contact'
    | 'duplicate_content'
    | 'blank_page'
    | 'unreadable'
  message: string
  severity: 'error' | 'warning'
}

export interface DocumentValidationResult {
  valid: boolean
  issues: DocumentValidationIssue[]
  extractedCharacters: number
  pageCount: number | null
  /** True when text could be read back out of the generated file. */
  textIsExtractable: boolean
}

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]

function hasSignature(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

/**
 * Sections the generated document must contain, given what the profile holds.
 * Only sections with real content are required — a resume with no projects is
 * not expected to have a Projects heading.
 */
function expectedSections(profile: ResumeProfile): string[] {
  const expected: string[] = []
  if (profile.summary?.trim()) expected.push('professional summary')
  if (profile.skills.some((group) => group.items.length > 0)) expected.push('skills')
  if (profile.experience.length > 0) expected.push('experience')
  if (profile.projects.length > 0) expected.push('projects')
  if (profile.education.length > 0) expected.push('education')
  if (profile.certifications.length > 0) expected.push('certifications')
  return expected
}

/**
 * Detects content repeated verbatim.
 *
 * Compares the set of substantial lines against their count: a pagination bug
 * that re-renders a block shows up as many identical long lines.
 */
function findDuplicateContent(text: string): number {
  const lines = text
    .split('\n')
    .map((line) => normalizeText(line))
    .filter((line) => line.length > 40)

  if (lines.length === 0) return 0

  const counts = new Map<string, number>()
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1)

  let duplicated = 0
  for (const count of counts.values()) if (count > 1) duplicated += count - 1
  return duplicated
}

interface ValidateInput {
  bytes: Uint8Array
  format: 'pdf' | 'docx'
  profile: ResumeProfile
}

/** Re-opens a generated document and verifies it is fit to send to an employer. */
export async function validateGeneratedDocument(
  input: ValidateInput,
): Promise<DocumentValidationResult> {
  const { bytes, format, profile } = input
  const issues: DocumentValidationIssue[] = []

  const result: DocumentValidationResult = {
    valid: false,
    issues,
    extractedCharacters: 0,
    pageCount: null,
    textIsExtractable: false,
  }

  if (bytes.length === 0) {
    issues.push({ code: 'empty_file', message: 'The generated file is empty.', severity: 'error' })
    return result
  }

  const signatureOk =
    format === 'pdf' ? hasSignature(bytes, PDF_SIGNATURE) : hasSignature(bytes, ZIP_SIGNATURE)

  if (!signatureOk) {
    issues.push({
      code: 'wrong_signature',
      message: `The generated file does not carry a valid ${format.toUpperCase()} signature.`,
      severity: 'error',
    })
    return result
  }

  let text: string
  try {
    if (format === 'pdf') {
      const extraction = await extractPdf(bytes)
      text = extraction.text
      result.pageCount = extraction.signals.pageCount
    } else {
      const extraction = await extractDocx(bytes)
      text = extraction.text
    }
  } catch (cause) {
    logger.error('document.validation_readback_failed', { format, error: cause })
    issues.push({
      code: 'unreadable',
      message: 'The generated file could not be re-opened for verification.',
      severity: 'error',
    })
    return result
  }

  result.extractedCharacters = text.length
  result.textIsExtractable = text.length > 0

  if (text.length === 0) {
    issues.push({
      code: 'no_extractable_text',
      message: 'No selectable text could be read back from the generated file.',
      severity: 'error',
    })
    return result
  }

  const sourceText = layoutToPlainText(buildLayout(profile))
  // Allow generous slack: extractors drop layout whitespace and reflow lines.
  if (text.length < sourceText.length * 0.55) {
    issues.push({
      code: 'text_too_short',
      message: `Only ${text.length} of roughly ${sourceText.length} expected characters were read back.`,
      severity: 'error',
    })
  }

  const haystack = normalizeText(text)
  for (const section of expectedSections(profile)) {
    if (!haystack.includes(normalizeText(section))) {
      issues.push({
        code: 'missing_section',
        message: `The "${section}" section is missing from the generated document.`,
        severity: 'error',
      })
    }
  }

  const email = profile.personal.email?.trim()
  if (email && !haystack.includes(normalizeText(email))) {
    issues.push({
      code: 'missing_contact',
      message: 'The contact email did not survive into the generated document.',
      severity: 'error',
    })
  }

  const duplicates = findDuplicateContent(text)
  if (duplicates > 2) {
    issues.push({
      code: 'duplicate_content',
      message: `${duplicates} lines appear more than once, which suggests duplicated content.`,
      severity: 'warning',
    })
  }

  if (format === 'pdf' && result.pageCount !== null) {
    const perPage = text.length / result.pageCount
    if (result.pageCount > 1 && perPage < 120) {
      issues.push({
        code: 'blank_page',
        message: 'One or more pages appear to be effectively blank.',
        severity: 'warning',
      })
    }
  }

  result.valid = !issues.some((issue) => issue.severity === 'error')
  return result
}
