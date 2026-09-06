import type { Evidence, EvidenceSection, ResumeProfile } from '@/lib/domain/types'

/**
 * A flattened, addressable view of every piece of text in a resume.
 *
 * The matching engine never sees the nested profile — it sees this list. That
 * keeps two properties true: every claim the product makes can be traced back
 * to an exact source span, and no matcher can accidentally invent a field that
 * did not exist in the upload.
 */
export interface EvidenceItem extends Evidence {
  /** Weight applied when this span supports a requirement. */
  weight: number
}

/**
 * Relative trust in each section as evidence of a skill.
 *
 * A skill listed in a Skills section is a claim; the same skill demonstrated in
 * an experience bullet is proof. Bullets therefore outweigh skill lists — this
 * is what stops a keyword-stuffed skills block from dominating the score.
 */
const SECTION_WEIGHT: Record<EvidenceSection, number> = {
  experience: 1,
  projects: 0.9,
  summary: 0.6,
  skills: 0.75,
  certifications: 0.85,
  education: 0.7,
  achievements: 0.8,
  additional: 0.5,
}

function push(
  items: EvidenceItem[],
  section: EvidenceSection,
  path: string,
  excerpt: string | null | undefined,
): void {
  const trimmed = excerpt?.trim()
  if (!trimmed) return
  items.push({ section, path, excerpt: trimmed, weight: SECTION_WEIGHT[section] })
}

/** Flattens a resume profile into an addressable evidence index. */
export function buildEvidenceIndex(profile: ResumeProfile): EvidenceItem[] {
  const items: EvidenceItem[] = []

  push(items, 'summary', 'summary', profile.summary)

  for (const group of profile.skills) {
    group.items.forEach((skill, index) => {
      push(items, 'skills', `skills.${group.id}.items.${index}`, skill)
    })
  }

  for (const entry of profile.experience) {
    push(items, 'experience', `experience.${entry.id}.title`, entry.title)
    push(items, 'experience', `experience.${entry.id}.company`, entry.company)
    entry.bullets.forEach((bullet, index) => {
      push(items, 'experience', `experience.${entry.id}.bullets.${index}`, bullet)
    })
  }

  for (const entry of profile.projects) {
    push(items, 'projects', `projects.${entry.id}.name`, entry.name)
    push(items, 'projects', `projects.${entry.id}.description`, entry.description)
    entry.bullets.forEach((bullet, index) => {
      push(items, 'projects', `projects.${entry.id}.bullets.${index}`, bullet)
    })
    entry.technologies.forEach((tech, index) => {
      push(items, 'projects', `projects.${entry.id}.technologies.${index}`, tech)
    })
  }

  for (const entry of profile.education) {
    const label = [entry.degree, entry.field].filter(Boolean).join(' ')
    push(items, 'education', `education.${entry.id}.degree`, label || null)
    push(items, 'education', `education.${entry.id}.institution`, entry.institution)
    entry.details.forEach((detail, index) => {
      push(items, 'education', `education.${entry.id}.details.${index}`, detail)
    })
  }

  for (const entry of profile.certifications) {
    const label = [entry.name, entry.issuer].filter(Boolean).join(' — ')
    push(items, 'certifications', `certifications.${entry.id}.name`, label)
  }

  profile.achievements.forEach((achievement, index) => {
    push(items, 'achievements', `achievements.${index}`, achievement)
  })

  for (const section of profile.additionalSections) {
    section.items.forEach((item, index) => {
      push(items, 'additional', `additionalSections.${section.id}.items.${index}`, item)
    })
  }

  return items
}

/** The full resume as one searchable string. Used for keyword coverage counts. */
export function evidenceCorpus(items: readonly EvidenceItem[]): string {
  return items.map((item) => item.excerpt).join('\n')
}

/** Strips the internal weight before an evidence span is returned to callers. */
export function toEvidence(item: EvidenceItem): Evidence {
  return { path: item.path, section: item.section, excerpt: item.excerpt }
}
