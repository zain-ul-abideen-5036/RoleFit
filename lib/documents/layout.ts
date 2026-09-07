import type { ResumeProfile } from '@/lib/domain/types'

/**
 * The document layout model.
 *
 * Both renderers (DOCX and PDF) consume this list of blocks rather than the
 * resume profile directly. That is what guarantees the two exports are the same
 * document: section order, headings and wording are decided once, here, and
 * each renderer only decides how to draw a block.
 *
 * The model is intentionally flat and single-column. There are no table, column
 * or image blocks, so an ATS-hostile layout cannot be expressed at all.
 */

export type LayoutBlock =
  | { kind: 'name'; text: string }
  | { kind: 'contact'; parts: string[] }
  | { kind: 'sectionHeading'; text: string }
  | { kind: 'paragraph'; text: string }
  /** A role/project/degree header: title on the left, dates on the right. */
  | { kind: 'entryHeader'; primary: string; secondary: string | null; trailing: string | null }
  | { kind: 'entrySubheader'; text: string }
  | { kind: 'bullet'; text: string }
  /** "Languages: Python, Go" — label plus a comma-joined list. */
  | { kind: 'labelledList'; label: string | null; items: string[] }
  | { kind: 'spacer' }

/** Standard, ATS-recognised section names. Never creative. */
const SECTION_TITLES = {
  summary: 'Professional Summary',
  skills: 'Skills',
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  certifications: 'Certifications',
  achievements: 'Achievements',
} as const

function formatDateRange(dates: { start: string | null; end: string | null }): string | null {
  if (!dates.start && !dates.end) return null
  if (dates.start && dates.end) return `${dates.start} – ${dates.end}`
  return dates.start ?? dates.end
}

function joinNonEmpty(parts: ReadonlyArray<string | null | undefined>, separator: string): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(separator)
}

/**
 * Builds the block list for a resume.
 *
 * Sections with no content are omitted entirely rather than rendered as an
 * empty heading, which is one of the document-quality checks.
 */
export function buildLayout(profile: ResumeProfile): LayoutBlock[] {
  const blocks: LayoutBlock[] = []

  /* ------------------------------------------------------------- header */
  if (profile.personal.fullName) {
    blocks.push({ kind: 'name', text: profile.personal.fullName })
  }

  const contactParts = [
    profile.personal.email,
    profile.personal.phone,
    profile.personal.location,
    ...profile.personal.links.map((link) => link.url),
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))

  if (contactParts.length > 0) {
    blocks.push({ kind: 'contact', parts: contactParts })
  }

  /* ------------------------------------------------------------ summary */
  if (profile.summary?.trim()) {
    blocks.push({ kind: 'sectionHeading', text: SECTION_TITLES.summary })
    blocks.push({ kind: 'paragraph', text: profile.summary.trim() })
  }

  /* ------------------------------------------------------------- skills */
  const skillGroups = profile.skills.filter((group) => group.items.length > 0)
  if (skillGroups.length > 0) {
    blocks.push({ kind: 'sectionHeading', text: SECTION_TITLES.skills })
    for (const group of skillGroups) {
      const label = group.category.trim().toLowerCase() === 'skills' ? null : group.category.trim()
      blocks.push({ kind: 'labelledList', label, items: group.items })
    }
  }

  /* --------------------------------------------------------- experience */
  if (profile.experience.length > 0) {
    blocks.push({ kind: 'sectionHeading', text: SECTION_TITLES.experience })
    for (const entry of profile.experience) {
      blocks.push({
        kind: 'entryHeader',
        primary: entry.title.trim() || entry.company.trim(),
        secondary: entry.company.trim() || null,
        trailing: formatDateRange(entry.dates),
      })
      if (entry.location?.trim()) {
        blocks.push({ kind: 'entrySubheader', text: entry.location.trim() })
      }
      for (const bullet of entry.bullets) {
        if (bullet.trim()) blocks.push({ kind: 'bullet', text: bullet.trim() })
      }
      blocks.push({ kind: 'spacer' })
    }
  }

  /* ----------------------------------------------------------- projects */
  if (profile.projects.length > 0) {
    blocks.push({ kind: 'sectionHeading', text: SECTION_TITLES.projects })
    for (const entry of profile.projects) {
      blocks.push({
        kind: 'entryHeader',
        primary: entry.name.trim(),
        secondary: null,
        trailing: entry.link?.trim() ?? null,
      })
      if (entry.description?.trim()) {
        blocks.push({ kind: 'paragraph', text: entry.description.trim() })
      }
      for (const bullet of entry.bullets) {
        if (bullet.trim()) blocks.push({ kind: 'bullet', text: bullet.trim() })
      }
      if (entry.technologies.length > 0) {
        blocks.push({ kind: 'labelledList', label: 'Technologies', items: entry.technologies })
      }
      blocks.push({ kind: 'spacer' })
    }
  }

  /* ---------------------------------------------------------- education */
  if (profile.education.length > 0) {
    blocks.push({ kind: 'sectionHeading', text: SECTION_TITLES.education })
    for (const entry of profile.education) {
      const degree = joinNonEmpty([entry.degree, entry.field], ', ')
      blocks.push({
        kind: 'entryHeader',
        primary: degree || entry.institution.trim(),
        secondary: degree ? entry.institution.trim() : null,
        trailing: formatDateRange(entry.dates),
      })
      for (const detail of entry.details) {
        if (detail.trim()) blocks.push({ kind: 'bullet', text: detail.trim() })
      }
      blocks.push({ kind: 'spacer' })
    }
  }

  /* ----------------------------------------------------- certifications */
  const certifications = profile.certifications.filter((entry) => entry.name.trim())
  if (certifications.length > 0) {
    blocks.push({ kind: 'sectionHeading', text: SECTION_TITLES.certifications })
    for (const entry of certifications) {
      const trailing = joinNonEmpty([entry.issued], '')
      blocks.push({
        kind: 'entryHeader',
        primary: entry.name.trim(),
        secondary: entry.issuer?.trim() ?? null,
        trailing: trailing || null,
      })
    }
    blocks.push({ kind: 'spacer' })
  }

  /* ------------------------------------------------------- achievements */
  const achievements = profile.achievements.filter((item) => item.trim())
  if (achievements.length > 0) {
    blocks.push({ kind: 'sectionHeading', text: SECTION_TITLES.achievements })
    for (const item of achievements) {
      blocks.push({ kind: 'bullet', text: item.trim() })
    }
    blocks.push({ kind: 'spacer' })
  }

  /* --------------------------------------------------- custom sections */
  for (const section of profile.additionalSections) {
    const items = section.items.filter((item) => item.trim())
    if (items.length === 0) continue
    blocks.push({ kind: 'sectionHeading', text: section.heading.trim() })
    for (const item of items) {
      blocks.push({ kind: 'bullet', text: item.trim() })
    }
    blocks.push({ kind: 'spacer' })
  }

  return trimTrailingSpacers(blocks)
}

function trimTrailingSpacers(blocks: LayoutBlock[]): LayoutBlock[] {
  let end = blocks.length
  while (end > 0 && blocks[end - 1]?.kind === 'spacer') end -= 1
  return blocks.slice(0, end)
}

/** Plain-text rendering of the layout. Used by document quality validation. */
export function layoutToPlainText(blocks: readonly LayoutBlock[]): string {
  const lines: string[] = []

  for (const block of blocks) {
    switch (block.kind) {
      case 'name':
        lines.push(block.text)
        break
      case 'contact':
        lines.push(block.parts.join(' | '))
        break
      case 'sectionHeading':
        lines.push('', block.text.toUpperCase())
        break
      case 'paragraph':
        lines.push(block.text)
        break
      case 'entryHeader':
        lines.push(joinNonEmpty([block.primary, block.secondary, block.trailing], ' | '))
        break
      case 'entrySubheader':
        lines.push(block.text)
        break
      case 'bullet':
        lines.push(`- ${block.text}`)
        break
      case 'labelledList':
        lines.push(
          block.label ? `${block.label}: ${block.items.join(', ')}` : block.items.join(', '),
        )
        break
      case 'spacer':
        lines.push('')
        break
    }
  }

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export { SECTION_TITLES }
