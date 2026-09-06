import type {
  Evidence,
  JobDescriptionProfile,
  KeywordCoverage,
  Requirement,
  RequirementMatch,
  ResumeProfile,
} from '@/lib/domain/types'
import { allRequirements } from '@/lib/domain/types'
import {
  canonicalize,
  expandImplications,
  knownSkillTokens,
  relatedSkills,
  resolveSkill,
  surfaceFormsFor,
} from '@/lib/matching/aliases'
import { buildEvidenceIndex, toEvidence, type EvidenceItem } from '@/lib/matching/evidence'
import {
  coverageRatio,
  haystackContains,
  toTokenHaystack,
  toTokenNeedle,
  tokenSimilarity,
} from '@/lib/matching/normalize'

/**
 * The deterministic matching engine.
 *
 * No language model participates in this file. Match decisions and scores are
 * reproducible from (resume, job description) alone. That is what makes the
 * readiness breakdown explainable, and what stops a model — or a prompt
 * injected into an uploaded document — from talking the product into believing
 * a missing skill is present.
 */

/** Confidence at or above which a requirement counts as satisfied. */
const STRONG_THRESHOLD = 0.72
/** Below `STRONG` but at or above this: partial evidence, surfaced as such. */
const PARTIAL_THRESHOLD = 0.4
/** Free-text similarity below this is treated as noise, not weak evidence. */
const SEMANTIC_FLOOR = 0.22

export interface MatchResult {
  matches: RequirementMatch[]
  keywordCoverage: KeywordCoverage[]
  /** Canonical skills the candidate can evidence, including implications. */
  evidencedSkills: Set<string>
}

interface Candidate {
  evidence: Evidence
  confidence: number
  method: RequirementMatch['method']
}

/**
 * Every known skill with its surface forms pre-tokenized. Built once per
 * process; the matcher's inner loop is then a native substring search rather
 * than a re-tokenization of both sides.
 */
interface ScanEntry {
  canonical: string
  /** Padded token needles for each spelling of this skill. */
  needles: readonly string[]
  /** Canonical tokens this skill evidences, itself included. */
  implications: ReadonlySet<string>
}

const SKILL_SCAN_LIST: readonly ScanEntry[] = knownSkillTokens().map((canonical) => ({
  canonical,
  needles: surfaceFormsFor(canonical)
    .map(toTokenNeedle)
    .filter((needle) => needle.length > 0),
  implications: expandImplications(canonical),
}))

/** An evidence span with its token haystack computed once. */
interface IndexedEvidence extends EvidenceItem {
  haystack: string
  /** Skill resolved from a short, discrete span (skills list, tech list). */
  discreteSkill: string | null
}

function indexEvidence(items: readonly EvidenceItem[]): IndexedEvidence[] {
  return items.map((item) => {
    const isDiscrete = item.section === 'skills' || item.path.includes('.technologies.')
    return {
      ...item,
      haystack: toTokenHaystack(item.excerpt),
      discreteSkill: isDiscrete ? (resolveSkill(item.excerpt)?.canonical ?? null) : null,
    }
  })
}

/**
 * Every canonical skill the resume evidences, expanded through implications.
 * PostgreSQL in the resume therefore also evidences SQL — never the reverse.
 */
function collectEvidencedSkills(index: readonly IndexedEvidence[]): Set<string> {
  const evidenced = new Set<string>()

  for (const item of index) {
    if (item.discreteSkill) {
      for (const implied of expandImplications(item.discreteSkill)) evidenced.add(implied)
      continue
    }
    for (const entry of SKILL_SCAN_LIST) {
      if (evidenced.has(entry.canonical)) continue
      for (const needle of entry.needles) {
        if (haystackContains(item.haystack, needle)) {
          for (const implied of entry.implications) evidenced.add(implied)
          break
        }
      }
    }
  }

  return evidenced
}

/**
 * Strongest evidence for a requirement that names a specific skill. Returns
 * null when nothing in the resume supports it — the case that must surface as
 * "Missing / not verified" rather than being written into the document.
 */
function matchSkillRequirement(
  canonical: string,
  index: readonly IndexedEvidence[],
): Candidate | null {
  const forms = surfaceFormsFor(canonical)
  const canonicalNeedle = toTokenNeedle(canonical)
  let best: Candidate | null = null

  for (const item of index) {
    for (const form of forms) {
      const needle = toTokenNeedle(form)
      if (!needle || !haystackContains(item.haystack, needle)) continue

      const method: RequirementMatch['method'] = needle === canonicalNeedle ? 'exact' : 'alias'
      // Section weight decides how convincing the mention is: a bullet that
      // demonstrates the skill beats a bare entry in a skills list.
      const confidence = Math.min(1, 0.72 + item.weight * 0.28)

      if (!best || confidence > best.confidence) {
        best = { evidence: toEvidence(item), confidence, method }
      }
      break
    }
  }

  if (best) return best

  // No literal mention, but an implication may still evidence it: the resume
  // says PostgreSQL and the requirement is SQL.
  for (const item of index) {
    for (const entry of SKILL_SCAN_LIST) {
      if (entry.canonical === canonical) continue
      if (!entry.implications.has(canonical)) continue

      const matched =
        item.discreteSkill === entry.canonical ||
        entry.needles.some((needle) => haystackContains(item.haystack, needle))

      if (matched) {
        return { evidence: toEvidence(item), confidence: 0.75, method: 'normalized' }
      }
    }
  }

  // Adjacent skills earn partial credit only — never enough to satisfy.
  for (const item of index) {
    const source = item.discreteSkill
    if (source && relatedSkills(source).includes(canonical)) {
      return { evidence: toEvidence(item), confidence: 0.35, method: 'semantic' }
    }
  }

  return null
}

/**
 * Free-text requirements (responsibilities, qualifications) have no canonical
 * token, so they are matched by lexical overlap against every resume span.
 */
function matchTextRequirement(
  requirement: Requirement,
  index: readonly IndexedEvidence[],
): Candidate | null {
  let best: Candidate | null = null

  for (const item of index) {
    // Coverage answers "is this requirement expressed here?"; similarity guards
    // against a long bullet trivially covering a short requirement's tokens.
    const coverage = coverageRatio(requirement.text, item.excerpt)
    if (coverage === 0) continue

    const similarity = tokenSimilarity(requirement.text, item.excerpt)
    const raw = coverage * 0.72 + similarity * 0.28
    if (raw < SEMANTIC_FLOOR) continue

    const confidence = Math.min(1, raw * (0.7 + item.weight * 0.3))
    if (!best || confidence > best.confidence) {
      best = { evidence: toEvidence(item), confidence, method: 'semantic' }
    }
  }

  return best
}

function statusFor(confidence: number): RequirementMatch['status'] {
  if (confidence >= STRONG_THRESHOLD) return 'strong'
  if (confidence >= PARTIAL_THRESHOLD) return 'partial'
  return 'missing'
}

function matchRequirement(
  requirement: Requirement,
  index: readonly IndexedEvidence[],
): RequirementMatch {
  const canonical =
    requirement.canonical ??
    (requirement.category === 'skill' ? canonicalize(requirement.text) : null)

  const isKnownSkill = canonical !== null && resolveSkill(canonical) !== null

  const candidate = isKnownSkill
    ? matchSkillRequirement(canonical, index)
    : matchTextRequirement(requirement, index)

  const base = {
    requirementId: requirement.id,
    text: requirement.text,
    canonical: requirement.canonical,
    priority: requirement.priority,
    category: requirement.category,
  }

  if (!candidate) {
    return { ...base, status: 'missing' as const, confidence: 0, method: 'none' as const, evidence: [] }
  }

  return {
    ...base,
    status: statusFor(candidate.confidence),
    confidence: Number(candidate.confidence.toFixed(3)),
    method: candidate.method,
    evidence: [candidate.evidence],
  }
}

function computeKeywordCoverage(
  keywords: readonly string[],
  index: readonly IndexedEvidence[],
): KeywordCoverage[] {
  return keywords.map((keyword) => {
    const needle = toTokenNeedle(keyword)
    if (!needle) return { keyword, present: false, occurrences: 0, sections: [] }

    let occurrences = 0
    const sections = new Set<Evidence['section']>()

    for (const item of index) {
      const hits = countOccurrences(item.haystack, needle)
      if (hits > 0) {
        occurrences += hits
        sections.add(item.section)
      }
    }

    return { keyword, present: occurrences > 0, occurrences, sections: Array.from(sections) }
  })
}

/** Non-overlapping occurrences of a padded needle inside a padded haystack. */
function countOccurrences(haystack: string, needle: string): number {
  if (!haystack || !needle) return 0
  let count = 0
  // Step back one character so the shared padding space can start the next
  // match: " a b " contains " a " and " b " despite the overlapping spaces.
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) break
    count += 1
    from = at + needle.length - 1
  }
  return count
}

/** Runs the full deterministic match of a resume against a job description. */
export function matchResumeToJob(resume: ResumeProfile, job: JobDescriptionProfile): MatchResult {
  const index = indexEvidence(buildEvidenceIndex(resume))
  const evidencedSkills = collectEvidencedSkills(index)

  const matches = allRequirements(job).map((requirement) => matchRequirement(requirement, index))

  return {
    matches,
    keywordCoverage: computeKeywordCoverage(job.keywords, index),
    evidencedSkills,
  }
}

/**
 * Requirements the resume cannot support. Reported to the user as gaps and
 * never written into the optimized document.
 */
export function missingRequirements(matches: readonly RequirementMatch[]): RequirementMatch[] {
  return matches.filter((match) => match.status === 'missing')
}

export function strongMatches(matches: readonly RequirementMatch[]): RequirementMatch[] {
  return matches.filter((match) => match.status === 'strong')
}

export { PARTIAL_THRESHOLD, SEMANTIC_FLOOR, STRONG_THRESHOLD }
