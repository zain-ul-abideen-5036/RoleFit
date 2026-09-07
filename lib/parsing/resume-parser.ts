import type {
  CertificationEntry,
  DateRange,
  EducationEntry,
  ExperienceEntry,
  PersonalDetails,
  ProjectEntry,
  ResumeLink,
  ResumeProfile,
  SkillGroup,
} from '@/lib/domain/types'
import { emptyResumeProfile } from '@/lib/domain/types'
import { normalizeBulletGlyphs } from '@/lib/matching/normalize'

/**
 * Heuristic resume parser: plain text in, structured profile out.
 *
 * Resumes have no schema, so this is necessarily a set of heuristics. The
 * guiding rule is that the parser only ever *organizes* what it was given — it
 * never fills a gap with a plausible value. A field it cannot find stays null,
 * which is what keeps the downstream anti-fabrication guarantees meaningful.
 */

/* ==========================================================================
   Section detection
   ========================================================================== */

type SectionKey =
  | 'summary'
  | 'skills'
  | 'experience'
  | 'education'
  | 'projects'
  | 'certifications'
  | 'achievements'
  | 'unknown'

/** Heading synonyms, longest-first within each group so specific wins. */
const HEADING_PATTERNS: ReadonlyArray<readonly [SectionKey, RegExp]> = [
  [
    'summary',
    /^(professional\s+summary|career\s+summary|executive\s+summary|summary|profile|about\s+me|objective|career\s+objective)$/i,
  ],
  [
    'experience',
    /^(professional\s+experience|work\s+experience|employment\s+history|work\s+history|experience|employment|career\s+history|relevant\s+experience)$/i,
  ],
  [
    'education',
    /^(education|academic\s+background|education\s+and\s+training|academics|qualifications)$/i,
  ],
  [
    'skills',
    /^(technical\s+skills|core\s+competencies|skills\s*(&|and)\s*(tools|technologies)|skills|technologies|tech\s+stack|competencies|areas\s+of\s+expertise)$/i,
  ],
  [
    'projects',
    /^(projects|personal\s+projects|selected\s+projects|key\s+projects|side\s+projects|portfolio)$/i,
  ],
  [
    'certifications',
    /^(certifications?|licenses?\s*(&|and)\s*certifications?|certifications?\s*(&|and)\s*licenses?|credentials)$/i,
  ],
  [
    'achievements',
    /^(achievements?|awards?|honors?|awards?\s*(&|and)\s*honors?|accomplishments|publications)$/i,
  ],
]

/**
 * Whether a line is a section heading.
 *
 * Headings are short, unpunctuated, and usually visually distinct (all caps or
 * title case). Requiring all three properties avoids treating a sentence that
 * happens to begin with "Experience" as a heading.
 */
function detectHeading(line: string): SectionKey | null {
  const trimmed = line.trim().replace(/[:\s]+$/, '')
  if (trimmed.length === 0 || trimmed.length > 48) return null
  if (/[.!?]$/.test(trimmed)) return null
  // A heading rarely contains more than four words.
  if (trimmed.split(/\s+/).length > 5) return null

  for (const [key, pattern] of HEADING_PATTERNS) {
    if (pattern.test(trimmed)) return key
  }
  return null
}

/** A heading-shaped line that matches no known section becomes a custom one. */
function looksLikeCustomHeading(line: string): boolean {
  const trimmed = line.trim().replace(/[:\s]+$/, '')
  if (trimmed.length < 3 || trimmed.length > 40) return false
  if (/[.!?,]$/.test(trimmed)) return false
  if (trimmed.split(/\s+/).length > 4) return false
  // All caps, or Title Case With Every Word Capitalized.
  const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]{3,}/.test(trimmed)
  const isTitleCase = /^([A-Z][a-z]+)(\s+(&|and|of|[A-Z][a-z]+))*$/.test(trimmed)
  return isAllCaps || isTitleCase
}

/* ==========================================================================
   Contact details
   ========================================================================== */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/
const URL_RE =
  /((?:https?:\/\/|www\.)[^\s,;|]+|(?:linkedin\.com|github\.com|gitlab\.com)\/[^\s,;|]+)/gi

function labelForUrl(url: string): string {
  const lower = url.toLowerCase()
  if (lower.includes('linkedin.com')) return 'LinkedIn'
  if (lower.includes('github.com')) return 'GitHub'
  if (lower.includes('gitlab.com')) return 'GitLab'
  if (lower.includes('stackoverflow.com')) return 'Stack Overflow'
  if (lower.includes('medium.com') || lower.includes('dev.to')) return 'Blog'
  return 'Website'
}

/**
 * Reads the contact block at the top of the resume.
 *
 * The name is taken from the first line only when that line looks like a name:
 * short, no digits, no email. Otherwise it stays null and the ATS check reports
 * the missing name rather than the parser guessing.
 */
function parsePersonalDetails(headerLines: readonly string[]): PersonalDetails {
  const joined = headerLines.join('\n')

  const email = EMAIL_RE.exec(joined)?.[0] ?? null

  // Look for a phone on a line that is not the URL line, so a number inside a
  // URL is not mistaken for a phone number.
  let phone: string | null = null
  for (const line of headerLines) {
    if (EMAIL_RE.test(line) && line.trim() === email) continue
    const withoutUrls = line.replace(URL_RE, ' ')
    const candidate = PHONE_RE.exec(withoutUrls)?.[1]
    if (candidate) {
      const digits = candidate.replace(/\D/g, '')
      if (digits.length >= 8 && digits.length <= 15) {
        phone = candidate.trim()
        break
      }
    }
  }

  const links: ResumeLink[] = []
  const seen = new Set<string>()
  for (const match of joined.matchAll(URL_RE)) {
    const url = match[0].replace(/[.,;)]+$/, '')
    const key = url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    links.push({ label: labelForUrl(url), url })
    if (links.length >= 8) break
  }

  const first = headerLines[0]?.trim() ?? ''
  const isNameLike =
    first.length > 0 &&
    first.length <= 60 &&
    !/\d/.test(first) &&
    !EMAIL_RE.test(first) &&
    !/https?:|www\./i.test(first) &&
    first.split(/\s+/).length <= 5
  const fullName = isNameLike ? first : null

  // A location looks like "Berlin, Germany" or "San Francisco, CA". It is
  // usually one field on a delimited contact line rather than a line of its
  // own, so each line is split before matching — requiring a whole-line match
  // misses the overwhelmingly common single-line contact header.
  const LOCATION_RE = /^[A-Za-z][A-Za-z .'-]*,\s*[A-Za-z][A-Za-z .'-]{1,}$/
  let location: string | null = null

  for (const line of headerLines.slice(0, 6)) {
    if (location) break

    for (const part of line.split(/[|•·]|\s{3,}/)) {
      const candidate = part.trim()
      if (!candidate || candidate === fullName || candidate.length > 60) continue
      if (EMAIL_RE.test(candidate) || /https?:|www\./i.test(candidate)) continue
      // A phone number can contain a comma-free run of letters; require no digits.
      if (/\d/.test(candidate)) continue

      if (LOCATION_RE.test(candidate)) {
        location = candidate
        break
      }
    }
  }

  return { fullName, email, phone, location, links }
}

/* ==========================================================================
   Dates
   ========================================================================== */

const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const DATE_TOKEN = `(?:${MONTH}\\.?\\s*\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})`
const PRESENT = '(?:present|current|now|to\\s+date|ongoing)'
const DATE_RANGE_RE = new RegExp(
  `(${DATE_TOKEN})\\s*(?:-|–|—|to|until)\\s*(${DATE_TOKEN}|${PRESENT})`,
  'i',
)

/** Extracts a date range from a line, returning it and the line without it. */
function extractDateRange(line: string): { dates: DateRange; remainder: string } {
  const match = DATE_RANGE_RE.exec(line)
  if (!match) {
    return { dates: { start: null, end: null, isCurrent: false }, remainder: line }
  }

  const start = match[1]?.trim() ?? null
  const rawEnd = match[2]?.trim() ?? null
  const isCurrent = rawEnd !== null && new RegExp(`^${PRESENT}$`, 'i').test(rawEnd)

  const remainder = line
    .replace(match[0], ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s|,·–-]+|[\s|,·–-]+$/g, '')

  return { dates: { start, end: isCurrent ? 'Present' : rawEnd, isCurrent }, remainder }
}

function hasDate(line: string): boolean {
  return DATE_RANGE_RE.test(line) || new RegExp(`\\b${DATE_TOKEN}\\b`, 'i').test(line)
}

/* ==========================================================================
   Section parsers
   ========================================================================== */

const BULLET_RE = /^[-*]\s+/

function isBullet(line: string): boolean {
  return BULLET_RE.test(line.trim())
}

function stripBullet(line: string): string {
  return line.trim().replace(BULLET_RE, '').trim()
}

/**
 * Splits a heading line such as "Senior Engineer, Acme — Berlin" into parts.
 * Order is ambiguous in the wild, so the caller decides which part is which.
 */
function splitEntryLine(line: string): string[] {
  return line
    .split(/\s+[|·•—–]\s+|\s+-\s+|,\s+(?=[A-Z])/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseSkills(lines: readonly string[]): SkillGroup[] {
  const groups: SkillGroup[] = []
  let counter = 0

  const flatItems: string[] = []

  for (const raw of lines) {
    const line = stripBullet(raw)
    if (!line) continue

    // "Languages: Python, Go, TypeScript"
    const labelled = /^([A-Za-z][A-Za-z0-9 &/+#.-]{1,40}):\s*(.+)$/.exec(line)
    if (labelled) {
      const category = labelled[1]!.trim()
      const items = splitSkillList(labelled[2]!)
      if (items.length > 0) {
        counter += 1
        groups.push({ id: `skill-${counter}`, category, items })
        continue
      }
    }

    flatItems.push(...splitSkillList(line))
  }

  if (flatItems.length > 0) {
    counter += 1
    groups.push({ id: `skill-${counter}`, category: 'Skills', items: dedupe(flatItems) })
  }

  return groups
}

function splitSkillList(text: string): string[] {
  return text
    .split(/[,;|•·]|\s{3,}/)
    .map((item) => item.trim().replace(/\.$/, ''))
    .filter((item) => item.length > 0 && item.length <= 60)
}

function dedupe(items: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/**
 * Groups experience lines into entries.
 *
 * An entry starts at a non-bullet line; the following non-bullet line is
 * treated as its continuation (company/location) when it carries no date of
 * its own. Everything bulleted underneath belongs to that entry.
 */
function parseExperience(lines: readonly string[]): ExperienceEntry[] {
  const entries: ExperienceEntry[] = []
  let current: ExperienceEntry | null = null
  let counter = 0
  let headerLinesConsumed = 0

  const flush = (): void => {
    if (current) entries.push(current)
    current = null
    headerLinesConsumed = 0
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (isBullet(line)) {
      if (current) current.bullets.push(stripBullet(line))
      continue
    }

    // A non-bullet line directly under an entry header, carrying no date and
    // no bullet, is the company/location continuation.
    if (current && headerLinesConsumed === 1 && !hasDate(line) && line.length <= 90) {
      const parts = splitEntryLine(line)
      if (!current.company) current.company = parts[0] ?? line
      if (!current.location && parts.length > 1) current.location = parts[parts.length - 1]!
      headerLinesConsumed = 2
      continue
    }

    // Prose under an entry with no bullet marker still describes the role.
    if (current && !hasDate(line) && headerLinesConsumed >= 2) {
      current.bullets.push(line)
      continue
    }

    flush()
    counter += 1

    const { dates, remainder } = extractDateRange(line)
    const parts = splitEntryLine(remainder)

    current = {
      id: `exp-${counter}`,
      title: parts[0] ?? remainder ?? 'Role',
      company: parts[1] ?? '',
      location: parts.length > 2 ? parts[2]! : null,
      dates,
      bullets: [],
    }
    headerLinesConsumed = 1
  }

  flush()
  return entries.filter((entry) => entry.title.length > 0)
}

function parseEducation(lines: readonly string[]): EducationEntry[] {
  const entries: EducationEntry[] = []
  let current: EducationEntry | null = null
  let counter = 0

  const flush = (): void => {
    if (current) entries.push(current)
    current = null
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (isBullet(line)) {
      if (current) current.details.push(stripBullet(line))
      continue
    }

    if (current && !hasDate(line) && current.degree === null && line.length <= 100) {
      current.degree = line
      continue
    }

    flush()
    counter += 1

    const { dates, remainder } = extractDateRange(line)
    const parts = splitEntryLine(remainder)

    // Degrees usually contain a qualifier; institutions usually do not.
    const degreeIndex = parts.findIndex((part) =>
      /\b(bachelor|master|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?|ph\.?d|mba|diploma|certificate|degree|b\.?tech|m\.?tech|bsc|msc)\b/i.test(
        part,
      ),
    )

    const institution = degreeIndex === 0 ? (parts[1] ?? '') : (parts[0] ?? remainder)
    const degree = degreeIndex >= 0 ? (parts[degreeIndex] ?? null) : null

    current = {
      id: `edu-${counter}`,
      institution: institution || remainder,
      degree,
      field: null,
      location: null,
      dates,
      details: [],
    }
  }

  flush()
  return entries
}

function parseProjects(lines: readonly string[]): ProjectEntry[] {
  const entries: ProjectEntry[] = []
  let current: ProjectEntry | null = null
  let counter = 0

  const flush = (): void => {
    if (current) entries.push(current)
    current = null
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (isBullet(line)) {
      if (current) current.bullets.push(stripBullet(line))
      continue
    }

    flush()
    counter += 1

    const { remainder } = extractDateRange(line)
    // "Project Name — one line description"
    const parts = remainder.split(/\s+[|—–]\s+|:\s+/)
    const name = (parts[0] ?? remainder).trim()
    const description = parts.length > 1 ? parts.slice(1).join(' — ').trim() : null

    const techMatch = /\b(?:tech(?:nologies)?|stack|built with|tools)\s*:\s*(.+)$/i.exec(remainder)

    current = {
      id: `proj-${counter}`,
      name: name.slice(0, 160),
      description: techMatch ? null : description,
      bullets: [],
      technologies: techMatch ? splitSkillList(techMatch[1]!) : [],
      link: /(https?:\/\/|www\.)\S+/i.exec(remainder)?.[0] ?? null,
    }
  }

  flush()
  return entries.filter((entry) => entry.name.length > 0)
}

function parseCertifications(lines: readonly string[]): CertificationEntry[] {
  const entries: CertificationEntry[] = []
  let counter = 0

  for (const raw of lines) {
    const line = stripBullet(raw)
    if (!line) continue

    const { dates, remainder } = extractDateRange(line)
    const parts = splitEntryLine(remainder)
    counter += 1

    entries.push({
      id: `cert-${counter}`,
      name: parts[0] ?? remainder,
      issuer: parts[1] ?? null,
      issued: dates.start,
      expires: dates.end,
      credentialId: null,
    })
  }

  return entries
}

/* ==========================================================================
   Entry point
   ========================================================================== */

export interface ParseResumeOptions {
  /** Cap on lines examined for the contact block. */
  headerLineLimit?: number
}

/**
 * Parses extracted resume text into a structured profile.
 *
 * Never throws: an unrecognisable resume yields a mostly-empty profile, which
 * the ATS checks then report honestly ("no experience section was found")
 * rather than the upload failing with a parser error.
 */
export function parseResumeText(rawText: string, options: ParseResumeOptions = {}): ResumeProfile {
  const headerLineLimit = options.headerLineLimit ?? 8
  const profile = emptyResumeProfile()

  const lines = normalizeBulletGlyphs(rawText)
    .split('\n')
    .map((line) => line.trimEnd())

  // Partition into sections.
  const sections = new Map<SectionKey, string[]>()
  const customSections: Array<{ heading: string; lines: string[] }> = []

  let currentKey: SectionKey | null = null
  let currentCustom: { heading: string; lines: string[] } | null = null
  let firstHeadingIndex = lines.length

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return

    const heading = detectHeading(trimmed)
    if (heading) {
      if (index < firstHeadingIndex) firstHeadingIndex = index
      currentKey = heading
      currentCustom = null
      if (!sections.has(heading)) sections.set(heading, [])
      return
    }

    // Only after a recognised section has been seen. Before that we are still
    // in the contact block, where a name is also Title Case and would be
    // misread as a heading. Keying off a fixed line number instead dropped
    // custom sections from short resumes entirely.
    if (looksLikeCustomHeading(trimmed) && currentKey !== null) {
      if (index < firstHeadingIndex) firstHeadingIndex = index
      currentCustom = { heading: trimmed.replace(/[:\s]+$/, ''), lines: [] }
      customSections.push(currentCustom)
      currentKey = 'unknown'
      return
    }

    if (currentCustom) {
      currentCustom.lines.push(line)
      return
    }
    if (currentKey && currentKey !== 'unknown') {
      sections.get(currentKey)!.push(line)
    }
  })

  const headerLines = lines
    .slice(0, Math.min(headerLineLimit, firstHeadingIndex))
    .filter((line) => line.trim().length > 0)

  profile.personal = parsePersonalDetails(headerLines)

  const summaryLines = sections.get('summary') ?? []
  if (summaryLines.length > 0) {
    profile.summary =
      summaryLines
        .map((line) => stripBullet(line))
        .filter(Boolean)
        .join(' ')
        .slice(0, 2000) || null
  }

  profile.skills = parseSkills(sections.get('skills') ?? [])
  profile.experience = parseExperience(sections.get('experience') ?? [])
  profile.education = parseEducation(sections.get('education') ?? [])
  profile.projects = parseProjects(sections.get('projects') ?? [])
  profile.certifications = parseCertifications(sections.get('certifications') ?? [])
  profile.achievements = (sections.get('achievements') ?? [])
    .map((line) => stripBullet(line))
    .filter(Boolean)
    .slice(0, 25)

  profile.additionalSections = customSections
    .filter((section) => section.lines.some((line) => line.trim().length > 0))
    .slice(0, 10)
    .map((section, index) => ({
      id: `extra-${index + 1}`,
      heading: section.heading.slice(0, 80),
      items: section.lines
        .map((line) => stripBullet(line))
        .filter(Boolean)
        .slice(0, 20),
    }))

  return profile
}

export const __testing = {
  detectHeading,
  looksLikeCustomHeading,
  extractDateRange,
  parsePersonalDetails,
  parseSkills,
  parseExperience,
  splitSkillList,
}
