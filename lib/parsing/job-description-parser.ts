import type { ExperienceRequirement, JobDescriptionProfile, Requirement } from '@/lib/domain/types'
import { emptyJobDescriptionProfile } from '@/lib/domain/types'
import { knownSkillTokens, skillLabel, surfaceFormsFor } from '@/lib/matching/aliases'
import {
  cleanDocumentText,
  haystackContains,
  normalizeBulletGlyphs,
  normalizeText,
  toTokenHaystack,
  toTokenNeedle,
} from '@/lib/matching/normalize'

/**
 * Deterministic job description parser.
 *
 * Runs before any model is consulted, and its output is the floor: the AI layer
 * may enrich this profile but the requirements extracted here always survive.
 * A job posting is untrusted user input — a posting that says "ignore previous
 * instructions" is parsed as ordinary text by this module and can influence
 * nothing, because there are no instructions here to override.
 */

type JdSection =
  | 'responsibilities'
  | 'required'
  | 'preferred'
  | 'qualifications'
  | 'education'
  | 'benefits'
  | 'about'
  | 'other'

const SECTION_PATTERNS: ReadonlyArray<readonly [JdSection, RegExp]> = [
  [
    'responsibilities',
    /^(what\s+you(?:'|’)?ll\s+do|responsibilities|key\s+responsibilities|the\s+role|your\s+role|duties|day\s+to\s+day|in\s+this\s+role|what\s+you\s+will\s+be\s+doing)\b/i,
  ],
  [
    'required',
    /^(requirements?|required\s+(?:skills|qualifications|experience)|must\s+have|what\s+(?:we|you)(?:'|’)?(?:re|ll)\s+(?:looking\s+for|need)|minimum\s+qualifications|basic\s+qualifications|who\s+you\s+are|what\s+you\s+bring)\b/i,
  ],
  [
    'preferred',
    /^(preferred|preferred\s+(?:skills|qualifications|experience)|nice\s+to\s+have|bonus\s+points?|good\s+to\s+have|desirable|pluses?|additionally|it(?:'|’)?s\s+a\s+plus)\b/i,
  ],
  ['qualifications', /^(qualifications|skills?|technical\s+skills|competencies)\b/i],
  ['education', /^(education|academic\s+requirements?)\b/i],
  [
    'benefits',
    /^(benefits?|what\s+we\s+offer|perks|compensation|salary|why\s+join|our\s+offer|we\s+offer)\b/i,
  ],
  ['about', /^(about\s+(?:us|the\s+company|the\s+team)|company\s+overview|who\s+we\s+are)\b/i],
]

const TITLE_LABEL = /^(?:job\s+)?title\s*:\s*(.+)$/i
const COMPANY_LABEL = /^(?:company|organisation|organization|employer)\s*:\s*(.+)$/i
const LOCATION_LABEL = /^location\s*:\s*(.+)$/i
const EMPLOYMENT_LABEL = /^(?:employment\s+type|job\s+type|contract\s+type)\s*:\s*(.+)$/i

const YEARS_RE = /(\d{1,2})\s*\+?\s*(?:-|–|to)?\s*(\d{1,2})?\s*\+?\s*years?/i

/** Sections whose contents are not requirements and must not be scored. */
const NON_REQUIREMENT_SECTIONS = new Set<JdSection>(['benefits', 'about'])

function detectSection(line: string): JdSection | null {
  const trimmed = line.trim().replace(/[:\s]+$/, '')
  if (trimmed.length === 0 || trimmed.length > 70) return null
  for (const [section, pattern] of SECTION_PATTERNS) {
    if (pattern.test(trimmed)) return section
  }
  return null
}

/** Splits a block into individual requirement statements. */
function toStatements(lines: readonly string[]): string[] {
  const statements: string[] = []

  for (const raw of lines) {
    const line = raw.trim().replace(/^[-*]\s+/, '')
    if (line.length < 8) continue

    // A long unbulleted paragraph is split on sentence boundaries so each
    // requirement can be matched and reported independently.
    if (line.length > 220 && !/^[-*]/.test(raw.trim())) {
      for (const sentence of line.split(/(?<=[.;])\s+(?=[A-Z])/)) {
        const cleaned = sentence.trim()
        if (cleaned.length >= 12) statements.push(cleaned)
      }
      continue
    }
    statements.push(line)
  }

  return statements
    .map((statement) => statement.replace(/\s+/g, ' ').replace(/[;,]$/, '').trim())
    .filter((statement) => statement.length >= 8 && statement.length <= 400)
}

/** Every known skill mentioned anywhere in the posting, in order of appearance. */
function extractSkillTokens(text: string): string[] {
  const haystack = toTokenHaystack(text)
  const found: Array<{ canonical: string; at: number }> = []

  for (const canonical of knownSkillTokens()) {
    let earliest = -1
    for (const form of surfaceFormsFor(canonical)) {
      const needle = toTokenNeedle(form)
      if (!needle) continue
      const at = haystack.indexOf(needle)
      if (at !== -1 && (earliest === -1 || at < earliest)) earliest = at
    }
    if (earliest !== -1) found.push({ canonical, at: earliest })
  }

  return found.sort((a, b) => a.at - b.at).map((entry) => entry.canonical)
}

function extractExperienceRequirements(statements: readonly string[]): ExperienceRequirement[] {
  const out: ExperienceRequirement[] = []

  for (const statement of statements) {
    const match = YEARS_RE.exec(statement)
    if (!match) continue
    const first = Number.parseInt(match[1] ?? '', 10)
    if (!Number.isFinite(first)) continue
    out.push({ minYears: first, text: statement.slice(0, 300) })
    if (out.length >= 10) break
  }

  return out
}

let requirementCounter = 0
function nextRequirementId(prefix: string): string {
  requirementCounter += 1
  return `${prefix}-${requirementCounter}`
}

function makeRequirement(
  text: string,
  priority: Requirement['priority'],
  category: Requirement['category'],
  canonical: string | null = null,
): Requirement {
  return {
    id: nextRequirementId(category),
    text: text.slice(0, 400),
    canonical,
    priority,
    category,
  }
}

/** Removes near-duplicate statements produced by overlapping sections. */
function dedupeRequirements(requirements: readonly Requirement[]): Requirement[] {
  const seen = new Set<string>()
  const out: Requirement[] = []
  for (const requirement of requirements) {
    const key = requirement.canonical ?? requirement.text.toLowerCase().replace(/\s+/g, ' ').trim()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(requirement)
  }
  return out
}

export interface ParseJobDescriptionOptions {
  /** Overrides the title when the caller already knows it. */
  titleHint?: string | null
  companyHint?: string | null
}

/**
 * Parses raw job description text into a structured profile.
 * Never throws — an unstructured posting still yields skill and keyword data.
 */
export function parseJobDescription(
  rawText: string,
  options: ParseJobDescriptionOptions = {},
): JobDescriptionProfile {
  requirementCounter = 0

  const profile = emptyJobDescriptionProfile()
  const text = cleanDocumentText(normalizeBulletGlyphs(rawText))
  const lines = text.split('\n')

  const buckets = new Map<JdSection, string[]>()
  let current: JdSection = 'other'

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const labelledTitle = TITLE_LABEL.exec(trimmed)
    if (labelledTitle) {
      profile.title = labelledTitle[1]!.trim().slice(0, 200)
      continue
    }
    const labelledCompany = COMPANY_LABEL.exec(trimmed)
    if (labelledCompany) {
      profile.company = labelledCompany[1]!.trim().slice(0, 200)
      continue
    }
    const labelledLocation = LOCATION_LABEL.exec(trimmed)
    if (labelledLocation) {
      profile.location = labelledLocation[1]!.trim().slice(0, 160)
      continue
    }
    const labelledEmployment = EMPLOYMENT_LABEL.exec(trimmed)
    if (labelledEmployment) {
      profile.employmentType = labelledEmployment[1]!.trim().slice(0, 80)
      continue
    }

    const section = detectSection(trimmed)
    if (section) {
      current = section
      if (!buckets.has(section)) buckets.set(section, [])
      continue
    }

    if (!buckets.has(current)) buckets.set(current, [])
    buckets.get(current)!.push(line)
  }

  // Title falls back to the first substantial line of the posting.
  if (!profile.title) {
    const candidate = lines.find(
      (line) => line.trim().length >= 4 && line.trim().length <= 90 && !/[.!?]$/.test(line.trim()),
    )
    profile.title = options.titleHint ?? candidate?.trim() ?? null
  }
  if (!profile.company && options.companyHint) profile.company = options.companyHint

  const responsibilityStatements = toStatements(buckets.get('responsibilities') ?? [])
  const requiredStatements = toStatements([
    ...(buckets.get('required') ?? []),
    ...(buckets.get('qualifications') ?? []),
  ])
  const preferredStatements = toStatements(buckets.get('preferred') ?? [])
  const educationStatements = toStatements(buckets.get('education') ?? [])

  // Text that is legitimately about the job. Benefits and company boilerplate
  // are excluded so "unlimited PTO" never becomes a keyword or a requirement.
  const requirementCorpus = Array.from(buckets.entries())
    .filter(([section]) => !NON_REQUIREMENT_SECTIONS.has(section))
    .flatMap(([, sectionLines]) => toStatements(sectionLines))
    .join('\n')

  const requiredCorpus = [...requiredStatements, ...responsibilityStatements].join('\n')
  const preferredCorpus = preferredStatements.join('\n')

  // Skills named in a "preferred" block are preferred; everything else that is
  // named in a requirement context is required.
  const preferredSkillTokens = new Set(extractSkillTokens(preferredCorpus))
  const requiredSkillTokens = extractSkillTokens(requiredCorpus)

  const seenSkills = new Set<string>()
  for (const canonical of requiredSkillTokens) {
    if (seenSkills.has(canonical)) continue
    seenSkills.add(canonical)
    profile.requiredSkills.push(
      makeRequirement(skillLabel(canonical), 'required', 'skill', canonical),
    )
  }
  for (const canonical of preferredSkillTokens) {
    if (seenSkills.has(canonical)) continue
    seenSkills.add(canonical)
    profile.preferredSkills.push(
      makeRequirement(skillLabel(canonical), 'preferred', 'skill', canonical),
    )
  }

  profile.responsibilities = dedupeRequirements(
    responsibilityStatements
      .slice(0, 40)
      .map((statement) => makeRequirement(statement, 'required', 'responsibility')),
  )

  profile.qualifications = dedupeRequirements(
    requiredStatements
      .slice(0, 40)
      // Statements that only name a technology are already covered by the skill
      // requirements; keeping both would double-count them in the score.
      .filter((statement) => statement.split(/\s+/).length > 3)
      .map((statement) => makeRequirement(statement, 'required', 'qualification')),
  )

  const preferredQualifications = preferredStatements
    .slice(0, 25)
    .filter((statement) => statement.split(/\s+/).length > 3)
    .map((statement) => makeRequirement(statement, 'preferred', 'qualification'))
  profile.qualifications.push(...dedupeRequirements(preferredQualifications))

  profile.education = dedupeRequirements(
    educationStatements
      .slice(0, 10)
      .map((statement) => makeRequirement(statement, 'preferred', 'education')),
  )

  // Degree requirements are frequently stated inline rather than in a section.
  const degreeStatements = requiredStatements.filter((statement) =>
    /\b(bachelor|master|degree|b\.?s\.?c?\.?|m\.?s\.?c?\.?|ph\.?d)\b/i.test(statement),
  )
  for (const statement of degreeStatements.slice(0, 5)) {
    profile.education.push(makeRequirement(statement, 'required', 'education'))
  }
  profile.education = dedupeRequirements(profile.education)

  const certificationStatements = [...requiredStatements, ...preferredStatements].filter(
    (statement) => /\b(certified|certification|certificate)\b/i.test(statement),
  )
  profile.certifications = dedupeRequirements(
    certificationStatements
      .slice(0, 10)
      .map((statement) =>
        makeRequirement(
          statement,
          preferredStatements.includes(statement) ? 'preferred' : 'required',
          'certification',
        ),
      ),
  )

  profile.experienceRequirements = extractExperienceRequirements([
    ...requiredStatements,
    ...preferredStatements,
  ])

  profile.keywords = buildKeywords(requirementCorpus, profile)

  // A degree line legitimately matches both the qualifications sweep and the
  // education sweep, so the same sentence can be extracted twice. Left in, the
  // user is shown the identical gap twice and it is double-counted in the
  // score. Deduplicate across every category, keeping the first occurrence so
  // the more specific category wins.
  dedupeAcrossCategories(profile)

  return profile
}

/** Removes a requirement that already appeared in an earlier category. */
function dedupeAcrossCategories(profile: JobDescriptionProfile): void {
  const seen = new Set<string>()

  const keep = (requirement: Requirement): boolean => {
    const key = requirement.canonical ?? normalizeText(requirement.text)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }

  // Order matters: earlier categories are the more specific classification.
  profile.requiredSkills = profile.requiredSkills.filter(keep)
  profile.preferredSkills = profile.preferredSkills.filter(keep)
  profile.certifications = profile.certifications.filter(keep)
  profile.education = profile.education.filter(keep)
  profile.qualifications = profile.qualifications.filter(keep)
  profile.responsibilities = profile.responsibilities.filter(keep)
}

/**
 * ATS keywords worth covering: every skill named in the posting, plus notable
 * multi-word domain phrases. Benefits and company boilerplate are excluded, so
 * "unlimited PTO" never becomes a keyword the user is told to include.
 */
function buildKeywords(corpus: string, profile: JobDescriptionProfile): string[] {
  const keywords: string[] = []
  const seen = new Set<string>()

  const add = (value: string): void => {
    const cleaned = value.trim()
    if (cleaned.length < 2 || cleaned.length > 60) return
    const key = cleaned.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    keywords.push(cleaned)
  }

  for (const requirement of [...profile.requiredSkills, ...profile.preferredSkills]) {
    if (requirement.canonical) add(skillLabel(requirement.canonical))
  }

  // Capitalised multi-word phrases are usually named tools, methods or domains.
  const haystack = toTokenHaystack(corpus)
  for (const match of corpus.matchAll(
    /\b([A-Z][A-Za-z0-9+#.]{2,}(?:\s+[A-Z][A-Za-z0-9+#.]{2,}){0,2})\b/g,
  )) {
    const phrase = match[1]!
    if (/^(The|And|Our|You|We|This|That|With|For|Your)\b/.test(phrase)) continue
    if (!haystackContains(haystack, toTokenNeedle(phrase))) continue
    add(phrase)
    if (keywords.length >= 60) break
  }

  return keywords.slice(0, 60)
}

export const __testing = { detectSection, toStatements, extractSkillTokens, buildKeywords }
