import type { ResumeProfile } from '@/lib/domain/types'
import { knownSkillTokens, skillLabel, surfaceFormsFor } from '@/lib/matching/aliases'
import { buildEvidenceIndex } from '@/lib/matching/evidence'
import {
  haystackContains,
  normalizeText,
  toTokenHaystack,
  toTokenNeedle,
} from '@/lib/matching/normalize'

/**
 * The anti-fabrication validator.
 *
 * This is the mechanism that makes the product's central promise real. Prompts
 * ask a model to behave; this file *verifies* it did, deterministically, and
 * discards anything it cannot support.
 *
 * The guarantee therefore does not depend on the model's cooperation, on prompt
 * wording, or on the model being immune to a resume that tries to manipulate it.
 * A rewrite survives only if every factual claim in it can be traced to text the
 * candidate actually wrote.
 *
 * Three checks, applied to every proposed rewrite:
 *
 *  1. **Skills** — a technology named in the rewrite must already be evidenced
 *     somewhere in the original resume.
 *  2. **Numbers** — a metric in the rewrite must appear verbatim in the original
 *     text it replaces. This is what stops "improved performance" from becoming
 *     "improved performance by 40%".
 *  3. **Proper nouns** — a capitalised entity (employer, product, tool) must
 *     already appear in the original resume.
 */

export type FabricationKind = 'skill' | 'metric' | 'entity' | 'scope'

export interface FabricationFinding {
  kind: FabricationKind
  /** The offending token, as it appeared in the proposed text. */
  token: string
  detail: string
}

export interface FabricationCheckResult {
  ok: boolean
  findings: FabricationFinding[]
}

/**
 * Numbers that carry a claim: percentages, counts, money, multipliers.
 *
 * There is no trailing `\b` on purpose. A word boundary cannot follow `%` or
 * `+` (both non-word characters), so requiring one makes the suffix group
 * backtrack away and "40%" is captured as bare "40" — which would let a
 * fabricated percentage pass whenever the bare number appeared somewhere.
 * Letter suffixes carry their own negative lookahead instead, so "5 kilometres"
 * does not read as "5k".
 */
const NUMBER_PATTERN =
  /\b\d[\d,.]*(?:\s*(?:%|\+|(?:percent|x|k|m|bn|billion|million|thousand)(?![a-z])))?/gi

/** Currency amounts, which NUMBER_PATTERN's word boundary can miss. */
const CURRENCY_PATTERN = /[$£€¥]\s?\d[\d,.]*\s*(?:k|m|bn|billion|million)?/gi

/**
 * Capitalised words that are likely to be entities. Sentence-initial words are
 * excluded by the caller, since a bullet always starts with a capital.
 */
const PROPER_NOUN_PATTERN = /\b([A-Z][A-Za-z0-9+#.]{1,}(?:\s+[A-Z][A-Za-z0-9+#.]{1,}){0,2})\b/g

/**
 * Words that are capitalised for reasons other than being an entity, or that
 * are generic enough that requiring source evidence would produce noise.
 */
const ENTITY_ALLOWLIST = new Set(
  [
    'i',
    'a',
    'the',
    'and',
    'or',
    'of',
    'in',
    'on',
    'for',
    'with',
    'to',
    'at',
    'by',
    'from',
    'led',
    'built',
    'designed',
    'developed',
    'delivered',
    'implemented',
    'improved',
    'reduced',
    'increased',
    'managed',
    'owned',
    'created',
    'launched',
    'migrated',
    'automated',
    'optimised',
    'optimized',
    'collaborated',
    'partnered',
    'mentored',
    'shipped',
    'maintained',
    'refactored',
    'engineered',
    'architected',
    'analysed',
    'analyzed',
    'wrote',
    'reviewed',
    'set',
    'helped',
    'worked',
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
    'present',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
  ].map((word) => word.toLowerCase()),
)

/**
 * Verbs that overstate involvement. Promoting "helped migrate" to "led the
 * migration" invents seniority, which is a fabrication even though no noun
 * changed.
 */
const SCOPE_ESCALATIONS: ReadonlyArray<{ from: RegExp; to: RegExp; label: string }> = [
  {
    from: /\b(?:helped|assisted|supported|contributed to|participated in)\b/i,
    to: /\b(?:led|drove|owned|spearheaded|directed|headed)\b/i,
    label: 'assisted -> led',
  },
  {
    from: /\b(?:worked on|involved in|part of)\b/i,
    to: /\b(?:owned|architected|designed and built single-handedly)\b/i,
    label: 'worked on -> owned',
  },
  {
    from: /\b(?:member|engineer|developer)\b/i,
    to: /\b(?:manager|head of|director|lead engineer)\b/i,
    label: 'individual -> manager',
  },
]

/**
 * A searchable index of everything the candidate actually wrote.
 * Built once per optimization run and reused for every change.
 */
export interface SourceIndex {
  /** Padded token haystack of the entire original resume. */
  corpus: string
  /** Canonical skills evidenced anywhere in the original resume. */
  skills: ReadonlySet<string>
  /** Every number and currency amount present in the original resume. */
  numbers: ReadonlySet<string>
  /** Normalized proper nouns present in the original resume. */
  entities: ReadonlySet<string>
}

/** Normalizes a captured figure so "35%." and "35 %" compare equal. */
function normalizeFigure(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      // A sentence-final period is punctuation, not part of the figure.
      .replace(/[.,]+$/, '')
  )
}

function extractNumbers(text: string): string[] {
  const out: string[] = []
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const value = normalizeFigure(match[0])
    if (value) out.push(value)
  }
  for (const match of text.matchAll(CURRENCY_PATTERN)) {
    const value = normalizeFigure(match[0])
    if (value) out.push(value)
  }
  return out
}

function extractEntities(text: string, skipFirstWord: boolean): string[] {
  const out: string[] = []
  for (const match of text.matchAll(PROPER_NOUN_PATTERN)) {
    const phrase = match[1]!
    if (skipFirstWord && match.index === 0) continue
    const normalized = normalizeText(phrase)
    if (!normalized) continue
    if (normalized.split(' ').every((word) => ENTITY_ALLOWLIST.has(word))) continue
    out.push(normalized)
  }
  return out
}

/** Builds the index of what the candidate can actually support. */
export function buildSourceIndex(profile: ResumeProfile): SourceIndex {
  const spans = buildEvidenceIndex(profile).map((item) => item.excerpt)
  const fullText = spans.join('\n')
  const corpus = toTokenHaystack(fullText)

  const skills = new Set<string>()
  for (const canonical of knownSkillTokens()) {
    for (const form of surfaceFormsFor(canonical)) {
      const needle = toTokenNeedle(form)
      if (needle && haystackContains(corpus, needle)) {
        skills.add(canonical)
        break
      }
    }
  }

  const numbers = new Set(extractNumbers(fullText))
  const entities = new Set<string>()
  for (const span of spans) {
    for (const entity of extractEntities(span, false)) entities.add(entity)
  }

  return { corpus, skills, numbers, entities }
}

export interface CheckOptions {
  /** The original text this rewrite replaces. Its facts are always allowed. */
  originalText: string
  /** Additional verbatim spans the model cited as evidence. */
  citedEvidence?: readonly string[]
}

/**
 * Verifies that a proposed rewrite introduces no information absent from the
 * source. Returns every violation found, so the reason can be logged.
 */
export function checkForFabrication(
  proposed: string,
  index: SourceIndex,
  options: CheckOptions,
): FabricationCheckResult {
  const findings: FabricationFinding[] = []

  const localText = [options.originalText, ...(options.citedEvidence ?? [])].join('\n')
  const proposedHaystack = toTokenHaystack(proposed)

  /* ------------------------------------------------------------- 1. skills */
  for (const canonical of knownSkillTokens()) {
    if (index.skills.has(canonical)) continue

    for (const form of surfaceFormsFor(canonical)) {
      const needle = toTokenNeedle(form)
      if (!needle || !haystackContains(proposedHaystack, needle)) continue

      findings.push({
        kind: 'skill',
        token: skillLabel(canonical),
        detail: `"${skillLabel(canonical)}" does not appear anywhere in the original resume.`,
      })
      break
    }
  }

  /* ------------------------------------------------------------ 2. numbers */
  // A metric must be present in the text being rewritten (or in cited
  // evidence). Elsewhere in the resume is not enough: moving "35%" from one
  // role to another attributes an achievement to the wrong employer.
  const localNumbers = new Set(extractNumbers(localText))
  for (const number of extractNumbers(proposed)) {
    if (localNumbers.has(number)) continue
    findings.push({
      kind: 'metric',
      token: number,
      detail: `The figure "${number}" is not present in the text being rewritten.`,
    })
  }

  /* ----------------------------------------------------------- 3. entities */
  for (const entity of extractEntities(proposed, true)) {
    if (index.entities.has(entity)) continue
    if (haystackContains(index.corpus, toTokenNeedle(entity))) continue
    findings.push({
      kind: 'entity',
      token: entity,
      detail: `"${entity}" does not appear anywhere in the original resume.`,
    })
  }

  /* -------------------------------------------------------------- 4. scope */
  for (const escalation of SCOPE_ESCALATIONS) {
    if (escalation.from.test(options.originalText) && escalation.to.test(proposed)) {
      findings.push({
        kind: 'scope',
        token: escalation.label,
        detail: 'The rewrite claims a greater level of ownership than the original stated.',
      })
    }
  }

  // Deduplicate: the same token can trip more than one pattern.
  const seen = new Set<string>()
  const unique = findings.filter((finding) => {
    const key = `${finding.kind}:${finding.token.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { ok: unique.length === 0, findings: unique }
}

/**
 * Verifies that a model's cited evidence is genuine — that each quote actually
 * occurs in the original resume rather than being invented to justify a rewrite.
 */
export function verifyEvidenceQuotes(
  quotes: readonly string[],
  index: SourceIndex,
): { ok: boolean; unverified: string[] } {
  const unverified = quotes.filter((quote) => {
    const needle = toTokenNeedle(quote)
    return !needle || !haystackContains(index.corpus, needle)
  })
  return { ok: unverified.length === 0, unverified }
}

/**
 * Sections whose content is never rewritten. Education, certifications,
 * employers, titles and dates are facts about the candidate's history; the
 * optimizer reorders them at most.
 */
export const IMMUTABLE_SECTIONS = ['education', 'certifications', 'personal'] as const

/**
 * Confirms an optimized profile has not altered any immutable fact.
 * A final backstop, independent of the per-change checks.
 */
export function verifyImmutableSections(
  original: ResumeProfile,
  proposed: ResumeProfile,
): { ok: boolean; violations: string[] } {
  const violations: string[] = []

  const compare = (label: string, a: unknown, b: unknown): void => {
    if (JSON.stringify(a) !== JSON.stringify(b)) violations.push(label)
  }

  compare('personal', original.personal, proposed.personal)
  compare('education', sortById(original.education), sortById(proposed.education))
  compare('certifications', sortById(original.certifications), sortById(proposed.certifications))

  // Employers, titles and dates must survive intact; only bullets may change.
  const originalRoles = new Map(original.experience.map((entry) => [entry.id, entry]))
  for (const entry of proposed.experience) {
    const source = originalRoles.get(entry.id)
    if (!source) {
      violations.push(`experience.${entry.id} (not present in the original)`)
      continue
    }
    if (source.company !== entry.company) violations.push(`experience.${entry.id}.company`)
    if (source.title !== entry.title) violations.push(`experience.${entry.id}.title`)
    if (JSON.stringify(source.dates) !== JSON.stringify(entry.dates)) {
      violations.push(`experience.${entry.id}.dates`)
    }
  }

  return { ok: violations.length === 0, violations }
}

function sortById<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id))
}

export const __testing = { extractNumbers, extractEntities, SCOPE_ESCALATIONS }
