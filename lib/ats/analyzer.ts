import type { ResumeProfile } from '@/lib/domain/types'
import type { AtsCheck, AtsReport, SourceDocumentSignals } from '@/lib/ats/types'
import { emptySourceSignals } from '@/lib/ats/types'

/**
 * Deterministic ATS readiness analysis.
 *
 * Each check answers one narrow question and reports what it saw. Nothing here
 * is probabilistic, so a user can always be told *why* their score moved.
 */

/** Section headings that ATS parsers reliably recognise. */
const STANDARD_HEADINGS = [
  'summary',
  'professional summary',
  'experience',
  'work experience',
  'professional experience',
  'employment history',
  'education',
  'skills',
  'technical skills',
  'projects',
  'certifications',
  'achievements',
  'awards',
  'publications',
]

/** Characters that survive poorly through ATS text extraction. */
const RISKY_GLYPHS = /[◆◇■□▲▼★☆♦♣♠♥✓✔✗✘➤➔⇒→←↑↓]/gu

/** Emoji and pictographs — never appropriate in an ATS-targeted resume. */
const EMOJI = /\p{Extended_Pictographic}/gu

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
/** Deliberately permissive: international formats vary enormously. */
const PHONE_PATTERN = /[\d][\d\s().-]{6,}\d/

interface CheckContext {
  profile: ResumeProfile
  signals: SourceDocumentSignals
  /** All document-bound text, for glyph and length inspection. */
  corpus: string
}

type CheckFn = (context: CheckContext) => Omit<AtsCheck, 'id' | 'label' | 'group' | 'weight'>

interface CheckDefinition {
  id: string
  label: string
  group: AtsCheck['group']
  weight: number
  run: CheckFn
}

function pass(detail: string): ReturnType<CheckFn> {
  return { status: 'pass', detail, recommendation: null }
}
function warn(detail: string, recommendation: string): ReturnType<CheckFn> {
  return { status: 'warn', detail, recommendation }
}
function fail(detail: string, recommendation: string): ReturnType<CheckFn> {
  return { status: 'fail', detail, recommendation }
}

const CHECKS: readonly CheckDefinition[] = [
  /* ----------------------------------------------------------- completeness */
  {
    id: 'contact_name',
    label: 'Name is present',
    group: 'completeness',
    weight: 1,
    run: ({ profile }) =>
      profile.personal.fullName?.trim()
        ? pass('A full name was found at the top of the resume.')
        : fail(
            'No name could be identified.',
            'Put your full name on its own line at the very top of the resume.',
          ),
  },
  {
    id: 'contact_email',
    label: 'Email address is present and parseable',
    group: 'completeness',
    weight: 1,
    run: ({ profile }) => {
      const email = profile.personal.email?.trim()
      if (!email) {
        return fail(
          'No email address was found.',
          'Add a plain-text email address in the header. Avoid putting it inside an image or a text box.',
        )
      }
      return EMAIL_PATTERN.test(email)
        ? pass('A valid email address was found.')
        : warn(
            'An email-like string was found but it does not parse cleanly.',
            'Write your email as plain text, for example name@example.com.',
          )
    },
  },
  {
    id: 'contact_phone',
    label: 'Phone number is present',
    group: 'completeness',
    weight: 0.6,
    run: ({ profile }) => {
      const phone = profile.personal.phone?.trim()
      if (!phone) {
        return warn(
          'No phone number was found.',
          'Add a phone number with country code so recruiters can reach you.',
        )
      }
      return PHONE_PATTERN.test(phone)
        ? pass('A phone number was found.')
        : warn(
            'A phone-like string was found but it may not parse reliably.',
            'Use digits with simple separators, for example +1 555 123 4567.',
          )
    },
  },
  {
    id: 'section_experience',
    label: 'Experience section has content',
    group: 'completeness',
    weight: 1,
    run: ({ profile }) => {
      if (profile.experience.length === 0 && profile.projects.length === 0) {
        return fail(
          'No experience or project entries were found.',
          'Add at least one role or project with dates and a few bullet points.',
        )
      }
      const withoutBullets = profile.experience.filter((entry) => entry.bullets.length === 0)
      if (withoutBullets.length > 0) {
        return warn(
          `${withoutBullets.length} role(s) have no bullet points.`,
          'Give every role two to five bullets describing what you did and what resulted.',
        )
      }
      return pass(
        `${profile.experience.length} role(s) and ${profile.projects.length} project(s) were found with content.`,
      )
    },
  },
  {
    id: 'section_education',
    label: 'Education section is present',
    group: 'completeness',
    weight: 0.5,
    run: ({ profile }) =>
      profile.education.length > 0
        ? pass('An education section was found.')
        : warn(
            'No education section was found.',
            'Add an education section. Many ATS filters expect one even for experienced candidates.',
          ),
  },
  {
    id: 'section_skills',
    label: 'Skills section is present',
    group: 'completeness',
    weight: 0.8,
    run: ({ profile }) => {
      const total = profile.skills.reduce((sum, group) => sum + group.items.length, 0)
      if (total === 0) {
        return fail(
          'No skills section was found.',
          'Add a skills section listing the tools and technologies you actually use.',
        )
      }
      if (total < 5) {
        return warn(
          `Only ${total} skill(s) were listed.`,
          'List the technologies you genuinely work with so keyword matching has something to find.',
        )
      }
      return pass(`${total} skills were found.`)
    },
  },
  {
    id: 'summary_present',
    label: 'Professional summary is present',
    group: 'completeness',
    weight: 0.4,
    run: ({ profile }) =>
      profile.summary?.trim()
        ? pass('A summary was found.')
        : warn(
            'No professional summary was found.',
            'Add a two to three line summary naming your role and core strengths.',
          ),
  },

  /* -------------------------------------------------------------- structure */
  {
    id: 'standard_headings',
    label: 'Uses standard section headings',
    group: 'structure',
    weight: 1,
    run: ({ profile }) => {
      const custom = profile.additionalSections
        .map((section) => section.heading.toLowerCase().trim())
        .filter((heading) => !STANDARD_HEADINGS.includes(heading))

      if (custom.length === 0) {
        return pass('All section headings use conventional names.')
      }
      return warn(
        `Non-standard heading(s) found: ${custom.slice(0, 3).join(', ')}.`,
        'Rename creative headings to conventional ones such as "Experience", "Skills" or "Education".',
      )
    },
  },
  {
    id: 'chronological_dates',
    label: 'Roles carry dates in a consistent order',
    group: 'structure',
    weight: 0.8,
    run: ({ profile }) => {
      const dated = profile.experience.filter((entry) => entry.dates.start)
      if (profile.experience.length === 0) return pass('No roles to check.')
      if (dated.length < profile.experience.length) {
        return warn(
          `${profile.experience.length - dated.length} role(s) are missing a start date.`,
          'Give every role a start and end date, for example "Mar 2021 – Present".',
        )
      }
      return pass('Every role has dates.')
    },
  },
  {
    id: 'bullet_length',
    label: 'Bullet points are a readable length',
    group: 'structure',
    weight: 0.6,
    run: ({ profile }) => {
      const bullets = [
        ...profile.experience.flatMap((entry) => entry.bullets),
        ...profile.projects.flatMap((entry) => entry.bullets),
      ]
      if (bullets.length === 0) return pass('No bullets to check.')

      const overlong = bullets.filter((bullet) => bullet.length > 320).length
      const stubs = bullets.filter((bullet) => bullet.trim().length < 25).length

      if (overlong > 0) {
        return warn(
          `${overlong} bullet(s) exceed roughly three lines.`,
          'Split long bullets so each covers one accomplishment.',
        )
      }
      if (stubs > 0) {
        return warn(
          `${stubs} bullet(s) are very short.`,
          'Expand short bullets to say what you did and what changed as a result.',
        )
      }
      return pass(`${bullets.length} bullets are within a readable length.`)
    },
  },
  {
    id: 'single_column',
    label: 'Single-column layout',
    group: 'structure',
    weight: 1,
    run: ({ signals }) =>
      signals.multiColumnSuspected
        ? fail(
            'The source document appears to use a multi-column layout.',
            'Use a single-column layout. Multi-column resumes are frequently read out of order or merged into nonsense.',
          )
        : pass('The document reads as a single column.'),
  },

  /* ------------------------------------------------------------- formatting */
  {
    id: 'no_tables',
    label: 'No tables used for layout',
    group: 'formatting',
    weight: 1,
    run: ({ signals }) => {
      if (signals.tableCount === 0) return pass('No tables were detected.')
      return signals.tableCount > 2
        ? fail(
            `${signals.tableCount} tables were detected in the source document.`,
            'Replace tables with plain paragraphs and bullet lists. Many parsers flatten table cells into a single unreadable line.',
          )
        : warn(
            `${signals.tableCount} table(s) were detected.`,
            'Consider replacing tables with plain text so content order is preserved.',
          )
    },
  },
  {
    id: 'no_text_boxes',
    label: 'No text boxes or floating frames',
    group: 'formatting',
    weight: 0.8,
    run: ({ signals }) =>
      signals.textBoxCount === 0
        ? pass('No text boxes were detected.')
        : fail(
            `${signals.textBoxCount} text box(es) were detected.`,
            'Move content out of text boxes into the main document body. Text boxes are commonly skipped entirely.',
          ),
  },
  {
    id: 'text_is_extractable',
    label: 'Text is machine-readable',
    group: 'formatting',
    weight: 1,
    run: ({ signals }) => {
      if (signals.extractedCharacters >= 800) {
        return pass('Text extracted cleanly from the document.')
      }
      if (signals.extractedCharacters === 0) {
        return fail(
          'No selectable text could be extracted.',
          'This looks like a scanned image. Export a text-based PDF or DOCX instead.',
        )
      }
      return warn(
        `Only ${signals.extractedCharacters} characters were extracted.`,
        'Check that your resume text is real text rather than an image.',
      )
    },
  },
  {
    id: 'no_images_for_content',
    label: 'Content is not embedded in images',
    group: 'formatting',
    weight: 0.7,
    run: ({ signals }) => {
      if (signals.imageCount === 0) return pass('No images were detected.')
      return signals.imageCount > 3
        ? fail(
            `${signals.imageCount} images were detected.`,
            'Remove graphics, logos and skill bars. Anything drawn as an image is invisible to an ATS.',
          )
        : warn(
            `${signals.imageCount} image(s) were detected.`,
            'Make sure no text or skill rating is conveyed only by an image.',
          )
    },
  },
  {
    id: 'safe_characters',
    label: 'Uses ATS-safe characters',
    group: 'formatting',
    weight: 0.6,
    run: ({ corpus }) => {
      const risky = corpus.match(RISKY_GLYPHS)?.length ?? 0
      const emoji = corpus.match(EMOJI)?.length ?? 0

      if (emoji > 0) {
        return fail(
          `${emoji} emoji were found in the resume text.`,
          'Remove emoji. They carry no meaning to a parser and read as unprofessional to most recruiters.',
        )
      }
      if (risky > 6) {
        return warn(
          `${risky} decorative symbols were found.`,
          'Replace decorative symbols with standard bullets and plain text.',
        )
      }
      return pass('No problematic characters were found.')
    },
  },
  {
    id: 'length_reasonable',
    label: 'Document length is reasonable',
    group: 'formatting',
    weight: 0.5,
    run: ({ signals, corpus }) => {
      const words = corpus.split(/\s+/).filter(Boolean).length
      if (words < 180) {
        return warn(
          `The resume contains roughly ${words} words.`,
          'Add more detail about your roles and projects. Very short resumes rarely clear keyword filters.',
        )
      }
      if (signals.pageCount !== null && signals.pageCount > 3) {
        return warn(
          `The source document is ${signals.pageCount} pages.`,
          'Trim to one or two pages unless you are in academia or have 15+ years of experience.',
        )
      }
      if (words > 1400) {
        return warn(
          `The resume contains roughly ${words} words.`,
          'Tighten the content. Most reviewers spend well under a minute on a first pass.',
        )
      }
      return pass(`The resume is roughly ${words} words.`)
    },
  },
]

/** All text bound for the generated document, used for glyph inspection. */
function buildCorpus(profile: ResumeProfile): string {
  const parts: string[] = []
  if (profile.summary) parts.push(profile.summary)
  for (const group of profile.skills) parts.push(group.category, ...group.items)
  for (const entry of profile.experience) {
    parts.push(entry.title, entry.company, ...entry.bullets)
  }
  for (const entry of profile.projects) {
    parts.push(entry.name, entry.description ?? '', ...entry.bullets, ...entry.technologies)
  }
  for (const entry of profile.education) {
    parts.push(entry.institution, entry.degree ?? '', entry.field ?? '', ...entry.details)
  }
  for (const entry of profile.certifications) parts.push(entry.name, entry.issuer ?? '')
  parts.push(...profile.achievements)
  for (const section of profile.additionalSections) parts.push(section.heading, ...section.items)
  return parts.filter(Boolean).join('\n')
}

/** Weighted 0-100 score for one group of checks. */
function scoreGroup(checks: readonly AtsCheck[], group: AtsCheck['group']): number {
  const relevant = checks.filter((check) => check.group === group)
  if (relevant.length === 0) return 100

  const totalWeight = relevant.reduce((sum, check) => sum + check.weight, 0)
  if (totalWeight === 0) return 100

  const earned = relevant.reduce((sum, check) => {
    const credit = check.status === 'pass' ? 1 : check.status === 'warn' ? 0.5 : 0
    return sum + check.weight * credit
  }, 0)

  return Math.round((earned / totalWeight) * 100)
}

/**
 * Runs every ATS check against a resume profile and the signals captured while
 * parsing its source document.
 */
export function analyzeAtsReadiness(
  profile: ResumeProfile,
  signals: SourceDocumentSignals = emptySourceSignals(),
): AtsReport {
  const context: CheckContext = { profile, signals, corpus: buildCorpus(profile) }

  const checks: AtsCheck[] = CHECKS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    group: definition.group,
    weight: definition.weight,
    ...definition.run(context),
  }))

  return {
    checks,
    structureScore: scoreGroup(checks, 'structure'),
    formattingScore: scoreGroup(checks, 'formatting'),
    completenessScore: scoreGroup(checks, 'completeness'),
    counts: {
      pass: checks.filter((check) => check.status === 'pass').length,
      warn: checks.filter((check) => check.status === 'warn').length,
      fail: checks.filter((check) => check.status === 'fail').length,
    },
  }
}

/**
 * Signals for a resume the product generated itself. Our generator emits a
 * single column, no tables, no images and selectable text by construction, so
 * these are facts about our own output rather than assumptions.
 */
export function generatedDocumentSignals(profile: ResumeProfile): SourceDocumentSignals {
  return {
    multiColumnSuspected: false,
    tableCount: 0,
    imageCount: 0,
    textBoxCount: 0,
    extractedCharacters: buildCorpus(profile).length,
    pageCount: null,
  }
}
