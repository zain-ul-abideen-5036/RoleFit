import type { JobDescriptionProfile, RequirementMatch, ResumeProfile } from '@/lib/domain/types'
import type { OptimizationProposal } from '@/lib/ai/schemas'
import { resolveSkill, skillLabel, surfaceFormsFor } from '@/lib/matching/aliases'
import {
  haystackContains,
  normalizeText,
  tokenize,
  toTokenHaystack,
  toTokenNeedle,
} from '@/lib/matching/normalize'

/**
 * The rule-based optimizer.
 *
 * Runs with no model, no API key and no network. It is the default provider,
 * and it is not a stub: it performs the subset of optimization that can be done
 * correctly by rule, which turns out to be a useful subset.
 *
 * What it does:
 *   - Aligns the resume's terminology with the posting's, but only for skills
 *     the resume already evidences ("Postgres" -> "PostgreSQL", never
 *     "cloud" -> "AWS").
 *   - Removes filler openings that dilute a bullet ("Responsible for managing"
 *     -> "Managed").
 *   - Reorders skills, roles and projects so the most role-relevant appear
 *     first.
 *
 * What it deliberately does not do: rewrite prose. Reworking a sentence while
 * provably preserving its factual content is not something a rule can do, so it
 * declines rather than guessing. That is why `capabilitiesFor` reports
 * `canRewriteProse: false` for this provider, and why the UI tells the user
 * plainly which kind of optimization they are getting.
 */

/**
 * Filler openings and their tightened equivalents.
 *
 * Every replacement is meaning-preserving. Nothing here escalates ownership:
 * "Responsible for managing" and "Managed" describe the same involvement, while
 * "Helped build" -> "Built" would not, and is absent for that reason.
 */
const FILLER_REWRITES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^was\s+responsible\s+for\s+(\w+)ing\s+/i, '$1ed '],
  [/^responsible\s+for\s+(\w+)ing\s+/i, '$1ed '],
  [/^responsible\s+for\s+/i, ''],
  [/^tasked\s+with\s+(\w+)ing\s+/i, '$1ed '],
  [/^duties\s+included\s+/i, ''],
  [/^helped\s+to\s+/i, 'Helped '],
  [/^worked\s+together\s+with\s+/i, 'Collaborated with '],
  [/^was\s+involved\s+in\s+/i, 'Contributed to '],
  [/^participated\s+in\s+the\s+/i, 'Contributed to the '],
  [/\s+in\s+order\s+to\s+/gi, ' to '],
  [/\s+as\s+well\s+as\s+/gi, ' and '],
  // "utilise/utilize" is the classic resume filler verb; "use" says the same.
  [/\butilis(e|es|ed|ing)\b/gi, 'us$1'],
  [/\butiliz(e|es|ed|ing)\b/gi, 'us$1'],
  [/\s{2,}/g, ' '],
]

function capitalise(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1)
}

/** Applies filler removal and re-capitalises the result. */
function tightenText(text: string): string {
  let out = text.trim()

  for (const [pattern, replacement] of FILLER_REWRITES) {
    out = out.replace(pattern, replacement)
  }

  out = out.trim().replace(/\s+([.,;:])/g, '$1')
  if (out.length > 0) out = out.charAt(0).toUpperCase() + out.slice(1)
  return out
}

/** A form is safe to substitute only if it is a single token. */
function isSingleToken(form: string): boolean {
  return tokenize(form).length === 1
}

/**
 * Builds a map from the resume's spelling of a skill to the posting's, for
 * skills the resume genuinely evidences.
 *
 * Two restrictions make this safe:
 *
 *  - Only surface forms of the *same* canonical skill are ever paired, so a
 *    substitution can rename but never reclassify.
 *  - Both sides must be a single token. Multi-word aliases are descriptive
 *    rather than synonymous — rewriting a candidate's "data pipelines" into
 *    "Data Engineering" changes their voice and reads as boilerplate, and
 *    swapping "rest" for "REST APIs" inside "REST APIs" duplicates the noun.
 *    "Postgres" to "PostgreSQL" is the case worth handling, and it is
 *    single-token on both sides.
 */
function buildTerminologyMap(
  resumeText: string,
  job: JobDescriptionProfile,
  evidencedCanonicals: ReadonlySet<string>,
): Map<string, string> {
  const mapping = new Map<string, string>()
  const resumeHaystack = toTokenHaystack(resumeText)

  const jobText = [
    ...job.requiredSkills.map((requirement) => requirement.text),
    ...job.preferredSkills.map((requirement) => requirement.text),
    ...job.keywords,
  ].join('\n')
  const jobHaystack = toTokenHaystack(jobText)

  for (const canonical of evidencedCanonicals) {
    const forms = surfaceFormsFor(canonical)

    // Does the posting mention this skill at all?
    const mentionedInJob = forms.some((form) => {
      const needle = toTokenNeedle(form)
      return needle && haystackContains(jobHaystack, needle)
    })
    if (!mentionedInJob) continue

    // Substitute towards the human-readable label, not the internal slug.
    const target = skillLabel(canonical)
    if (!isSingleToken(target)) continue

    const targetNeedle = toTokenNeedle(target)
    if (!targetNeedle || !haystackContains(jobHaystack, targetNeedle)) continue

    for (const resumeForm of forms) {
      if (!isSingleToken(resumeForm)) continue
      if (normalizeText(resumeForm) === normalizeText(target)) continue

      const needle = toTokenNeedle(resumeForm)
      if (!needle || !haystackContains(resumeHaystack, needle)) continue
      mapping.set(resumeForm, target)
    }
  }

  return mapping
}

/** Placeholder used while masking, chosen so it cannot occur in resume text. */
const MASK_PREFIX = 'RF'

/**
 * Replaces mapped terminology on token boundaries only.
 *
 * Existing occurrences of the replacement are masked first. Without that,
 * mapping "Node" to "Node.js" turns "Node.js" into "Node.js.js", because the
 * shorter form is a token-prefix of the longer one.
 */
function applyTerminology(text: string, mapping: ReadonlyMap<string, string>): string {
  let out = text
  const masks: string[] = []

  for (const [from, to] of mapping) {
    const maskToken = `${MASK_PREFIX}${masks.length}`
    const toPattern = new RegExp(`(^|[^A-Za-z0-9])(${escapeRegExp(to)})(?![A-Za-z0-9])`, 'gi')

    let masked = false
    out = out.replace(toPattern, (_match, prefix: string) => {
      masked = true
      return `${prefix}${maskToken}`
    })
    if (masked) masks.push(to)

    out = out.replace(
      new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(from)}(?![A-Za-z0-9])`, 'gi'),
      `$1${to}`,
    )

    if (masked) out = out.split(maskToken).join(to)
  }

  return out
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Relevance of a piece of text to the posting, from 0 to 1. */
function relevanceOf(text: string, job: JobDescriptionProfile): number {
  const haystack = toTokenHaystack(text)
  if (!haystack) return 0

  let hits = 0
  let total = 0

  for (const requirement of [...job.requiredSkills, ...job.preferredSkills]) {
    if (!requirement.canonical) continue
    total += requirement.priority === 'required' ? 2 : 1
    const matched = surfaceFormsFor(requirement.canonical).some((form) => {
      const needle = toTokenNeedle(form)
      return needle && haystackContains(haystack, needle)
    })
    if (matched) hits += requirement.priority === 'required' ? 2 : 1
  }

  return total === 0 ? 0 : hits / total
}

export interface RuleBasedInput {
  resume: ResumeProfile
  job: JobDescriptionProfile
  matches: readonly RequirementMatch[]
}

/**
 * Produces an optimization proposal using rules alone.
 * The output is the same shape a model would return, so both paths run through
 * the identical anti-fabrication validation downstream.
 */
export function proposeRuleBasedOptimization(input: RuleBasedInput): OptimizationProposal {
  const { resume, job, matches } = input

  const evidenced = new Set<string>()
  for (const match of matches) {
    if (match.status === 'missing' || !match.canonical) continue
    evidenced.add(match.canonical)
  }

  const resumeText = [
    resume.summary ?? '',
    ...resume.skills.flatMap((group) => group.items),
    ...resume.experience.flatMap((entry) => entry.bullets),
    ...resume.projects.flatMap((entry) => [...entry.bullets, ...entry.technologies]),
  ].join('\n')

  const terminology = buildTerminologyMap(resumeText, job, evidenced)

  /* ------------------------------------------------------- bullet rewrites */
  const bulletRewrites: OptimizationProposal['bulletRewrites'] = []

  const considerBullet = (path: string, original: string): void => {
    const aligned = applyTerminology(original, terminology)
    const tightened = tightenText(aligned)
    if (tightened === original.trim()) return

    const reasons: string[] = []
    if (aligned !== original) reasons.push("matched the job posting's terminology")
    if (tightenText(original) !== original.trim()) reasons.push('removed filler wording')

    bulletRewrites.push({
      path,
      after: tightened,
      rationale:
        reasons.length > 0
          ? `${capitalise(reasons.join(' and '))}.`
          : 'Tightened the wording without changing what it says.',
      evidence: [original.trim()],
      addressesRequirements: [],
    })
  }

  resume.experience.forEach((entry) => {
    entry.bullets.forEach((bullet, index) => {
      considerBullet(`experience.${entry.id}.bullets.${index}`, bullet)
    })
  })

  resume.projects.forEach((entry) => {
    entry.bullets.forEach((bullet, index) => {
      considerBullet(`projects.${entry.id}.bullets.${index}`, bullet)
    })
  })

  /* --------------------------------------------------------------- summary */
  let summary: OptimizationProposal['summary'] = null
  if (resume.summary?.trim()) {
    const aligned = tightenText(applyTerminology(resume.summary, terminology))
    if (aligned !== resume.summary.trim()) {
      summary = {
        after: aligned,
        rationale: "Aligned your summary's terminology with the job posting.",
        evidence: [resume.summary.trim()],
      }
    }
  }

  /* ------------------------------------------------------------- reordering */
  const skillOrder = resume.skills.map((group) => ({
    groupId: group.id,
    items: [...group.items].sort((a, b) => {
      const aCanonical = resolveSkill(a)?.canonical
      const bCanonical = resolveSkill(b)?.canonical
      const aRelevant = aCanonical !== undefined && evidenced.has(aCanonical)
      const bRelevant = bCanonical !== undefined && evidenced.has(bCanonical)
      if (aRelevant === bRelevant) return 0
      return aRelevant ? -1 : 1
    }),
  }))

  const experienceOrder = [...resume.experience]
    .map((entry) => ({
      id: entry.id,
      // Recency is a strong default; relevance only breaks ties within it.
      relevance: relevanceOf([entry.title, ...entry.bullets].join(' '), job),
      isCurrent: entry.dates.isCurrent,
    }))
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
      return b.relevance - a.relevance
    })
    .map((entry) => entry.id)

  const projectOrder = [...resume.projects]
    .map((entry) => ({
      id: entry.id,
      relevance: relevanceOf(
        [entry.name, entry.description ?? '', ...entry.bullets, ...entry.technologies].join(' '),
        job,
      ),
    }))
    .sort((a, b) => b.relevance - a.relevance)
    .map((entry) => entry.id)

  /* ------------------------------------------------------------ unaddressed */
  const unaddressed = matches
    .filter((match) => match.status === 'missing')
    .map((match) => ({
      requirementId: match.requirementId,
      reason: match.canonical
        ? `Your resume contains no evidence of ${skillLabel(match.canonical)}, so it was not added.`
        : 'Your resume contains no evidence for this requirement, so it was not added.',
    }))

  return {
    summary,
    bulletRewrites,
    skillOrder,
    experienceOrder,
    projectOrder,
    unaddressed,
  }
}

export const __testing = { tightenText, applyTerminology, buildTerminologyMap, relevanceOf }
