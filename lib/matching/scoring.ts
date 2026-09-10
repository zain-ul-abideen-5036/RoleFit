import type { AtsReport } from '@/lib/ats/types'
import type {
  AnalysisReport,
  JobDescriptionProfile,
  KeywordCoverage,
  Recommendation,
  RequirementMatch,
  ScoreDimension,
  ScoreDimensionKey,
} from '@/lib/domain/types'
import { skillLabel } from '@/lib/matching/aliases'

/**
 * ATS Readiness scoring.
 *
 * Seven dimensions, fixed weights, all deterministic. The score is presented as
 * an estimate — see ATS_SCORE_DISCLAIMER — because no third party publishes the
 * algorithm any real ATS uses. What the product *can* honestly promise is that
 * the number is reproducible and that every point is attributable to a named
 * dimension the user can act on.
 */

const WEIGHTS: Record<ScoreDimensionKey, number> = {
  skill_alignment: 0.25,
  keyword_alignment: 0.2,
  responsibility_alignment: 0.15,
  resume_structure: 0.12,
  relevance: 0.1,
  formatting_compatibility: 0.1,
  section_completeness: 0.08,
}

const LABELS: Record<ScoreDimensionKey, string> = {
  skill_alignment: 'Skill alignment',
  keyword_alignment: 'Keyword alignment',
  responsibility_alignment: 'Responsibility alignment',
  resume_structure: 'Resume structure',
  relevance: 'Relevance to this role',
  formatting_compatibility: 'Formatting compatibility',
  section_completeness: 'Section completeness',
}

/** Credit awarded per match status. Partial evidence earns partial credit. */
const STATUS_CREDIT = { strong: 1, partial: 0.5, missing: 0 } as const

/**
 * Required requirements count for more than preferred ones. A missing "must
 * have" should visibly hurt; a missing "nice to have" should barely register.
 */
const PRIORITY_WEIGHT = { required: 1, preferred: 0.45, optional: 0.2 } as const

function weightedCoverage(matches: readonly RequirementMatch[]): number {
  if (matches.length === 0) return 100

  let earned = 0
  let total = 0
  for (const match of matches) {
    const weight = PRIORITY_WEIGHT[match.priority]
    total += weight
    earned += weight * STATUS_CREDIT[match.status]
  }
  return total === 0 ? 100 : Math.round((earned / total) * 100)
}

function keywordScore(coverage: readonly KeywordCoverage[]): number {
  if (coverage.length === 0) return 100
  const present = coverage.filter((entry) => entry.present).length
  return Math.round((present / coverage.length) * 100)
}

/**
 * How much of the resume is actually about this role.
 *
 * Measures the share of experience and project bullets that supply evidence for
 * at least one requirement. A resume full of unrelated work scores low here
 * even when it happens to contain the right keywords somewhere.
 */
function relevanceScore(matches: readonly RequirementMatch[]): number {
  const supporting = new Set<string>()
  for (const match of matches) {
    if (match.status === 'missing') continue
    for (const evidence of match.evidence) supporting.add(evidence.path)
  }

  const matchedRequirements = matches.filter((match) => match.status !== 'missing').length
  if (matches.length === 0) return 100

  // Two components: how many requirements are evidenced, and how concentrated
  // the evidence is (a resume where one bullet answers everything is thin).
  const breadth = matchedRequirements / matches.length
  const depth = Math.min(1, supporting.size / Math.max(4, matches.length * 0.4))

  return Math.round((breadth * 0.65 + depth * 0.35) * 100)
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export interface ScoreInput {
  matches: readonly RequirementMatch[]
  keywordCoverage: readonly KeywordCoverage[]
  ats: AtsReport
  job: JobDescriptionProfile
}

export function computeDimensions(input: ScoreInput): ScoreDimension[] {
  const { matches, keywordCoverage, ats } = input

  const skillMatches = matches.filter(
    (match) => match.category === 'skill' || match.category === 'certification',
  )
  const responsibilityMatches = matches.filter(
    (match) => match.category === 'responsibility' || match.category === 'qualification',
  )

  const skill = weightedCoverage(skillMatches)
  const responsibility = weightedCoverage(responsibilityMatches)
  const keyword = keywordScore(keywordCoverage)
  const relevance = relevanceScore(matches)

  const dimensions: ScoreDimension[] = [
    {
      key: 'skill_alignment',
      label: LABELS.skill_alignment,
      score: skill,
      weight: WEIGHTS.skill_alignment,
      detail: describeCoverage(skillMatches, 'skill requirement', 'skill requirements'),
    },
    {
      key: 'keyword_alignment',
      label: LABELS.keyword_alignment,
      score: keyword,
      weight: WEIGHTS.keyword_alignment,
      detail: `${keywordCoverage.filter((entry) => entry.present).length} of ${
        keywordCoverage.length
      } job-description keywords appear in your resume.`,
    },
    {
      key: 'responsibility_alignment',
      label: LABELS.responsibility_alignment,
      score: responsibility,
      weight: WEIGHTS.responsibility_alignment,
      detail: describeCoverage(responsibilityMatches, 'responsibility', 'responsibilities'),
    },
    {
      key: 'resume_structure',
      label: LABELS.resume_structure,
      score: ats.structureScore,
      weight: WEIGHTS.resume_structure,
      detail: summarizeChecks(ats, 'structure'),
    },
    {
      key: 'relevance',
      label: LABELS.relevance,
      score: relevance,
      weight: WEIGHTS.relevance,
      detail: 'How much of your experience directly evidences what this role asks for.',
    },
    {
      key: 'formatting_compatibility',
      label: LABELS.formatting_compatibility,
      score: ats.formattingScore,
      weight: WEIGHTS.formatting_compatibility,
      detail: summarizeChecks(ats, 'formatting'),
    },
    {
      key: 'section_completeness',
      label: LABELS.section_completeness,
      score: ats.completenessScore,
      weight: WEIGHTS.section_completeness,
      detail: summarizeChecks(ats, 'completeness'),
    },
  ]

  return dimensions
}

/**
 * The one-line explanation under a coverage dimension.
 *
 * The plural is passed in rather than derived by appending an `s`. It was
 * derived, which rendered "0 of 14 responsibilitys are clearly evidenced" on
 * the analysis screen — and a product whose entire argument is that its score
 * is careful and explainable cannot afford visible copy defects in the
 * sentence doing the explaining.
 */
function describeCoverage(
  matches: readonly RequirementMatch[],
  singular: string,
  plural: string,
): string {
  if (matches.length === 0) return `No ${plural} were extracted from this job description.`

  const strong = matches.filter((match) => match.status === 'strong').length
  const partial = matches.filter((match) => match.status === 'partial').length
  const noun = matches.length === 1 ? singular : plural
  const verb = matches.length === 1 ? 'is' : 'are'

  return `${strong} of ${matches.length} ${noun} ${verb} clearly evidenced${
    partial > 0 ? `, ${partial} partially` : ''
  }.`
}

function summarizeChecks(
  ats: AtsReport,
  group: 'structure' | 'formatting' | 'completeness',
): string {
  const relevant = ats.checks.filter((check) => check.group === group)
  const failed = relevant.filter((check) => check.status === 'fail').length
  const warned = relevant.filter((check) => check.status === 'warn').length

  if (failed === 0 && warned === 0) {
    return relevant.length === 1
      ? 'The one check here passed.'
      : `All ${relevant.length} checks passed.`
  }

  // "check(s)" was the previous wording. A parenthetical plural is a
  // placeholder that shipped: it tells the reader the sentence was not
  // finished. Both halves are stated only when they are non-zero.
  const parts: string[] = []
  if (failed > 0) parts.push(`${failed} ${failed === 1 ? 'check' : 'checks'} failed`)
  if (warned > 0) parts.push(`${warned} raised a warning`)

  return `${parts.join(' and ')}, out of ${relevant.length}.`
}

export function computeOverallScore(dimensions: readonly ScoreDimension[]): number {
  const total = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0)
  if (total === 0) return 0
  const weighted = dimensions.reduce(
    (sum, dimension) => sum + dimension.score * dimension.weight,
    0,
  )
  return clamp(weighted / total)
}

/**
 * Actionable recommendations, ordered by how much they would move the score.
 *
 * Recommendations never tell the user to add something they cannot support —
 * for a missing requirement the advice is to gain or evidence the skill, not to
 * write it down.
 */
export function buildRecommendations(
  input: ScoreInput,
  dimensions: ScoreDimension[],
): Recommendation[] {
  const recommendations: Recommendation[] = []
  const { matches, keywordCoverage, ats } = input

  const missingRequired = matches.filter(
    (match) => match.status === 'missing' && match.priority === 'required',
  )
  if (missingRequired.length > 0) {
    recommendations.push({
      id: 'missing-required',
      severity: 'critical',
      title: `${missingRequired.length} required item(s) are not evidenced in your resume`,
      detail:
        `This posting asks for ${missingRequired
          .slice(0, 4)
          .map((match) =>
            match.canonical ? skillLabel(match.canonical) : truncate(match.text, 60),
          )
          .join(', ')}` +
        `. RoleFit will not add these to your resume, because your current resume does not support them. ` +
        `If you do have this experience, add it to your resume and re-run the analysis.`,
      dimension: 'skill_alignment',
    })
  }

  const missingKeywords = keywordCoverage.filter((entry) => !entry.present)
  if (missingKeywords.length > 0) {
    recommendations.push({
      id: 'keyword-gaps',
      severity: missingKeywords.length > keywordCoverage.length / 2 ? 'important' : 'suggestion',
      title: `${missingKeywords.length} job-description keyword(s) are absent`,
      detail: `Absent terms include ${missingKeywords
        .slice(0, 6)
        .map((entry) => entry.keyword)
        .join(', ')}. Where you genuinely have this experience, use the posting's wording for it.`,
      dimension: 'keyword_alignment',
    })
  }

  for (const check of ats.checks) {
    if (check.status === 'pass' || !check.recommendation) continue
    recommendations.push({
      id: `ats-${check.id}`,
      severity: check.status === 'fail' ? 'important' : 'suggestion',
      title: check.label,
      detail: check.recommendation,
      dimension:
        check.group === 'structure'
          ? 'resume_structure'
          : check.group === 'formatting'
            ? 'formatting_compatibility'
            : 'section_completeness',
    })
  }

  const weakest = [...dimensions].sort((a, b) => a.score * a.weight - b.score * b.weight)[0]
  if (weakest && weakest.score < 60) {
    recommendations.push({
      id: `dimension-${weakest.key}`,
      severity: 'important',
      title: `${weakest.label} is your weakest dimension`,
      detail: weakest.detail,
      dimension: weakest.key,
    })
  }

  const severityRank = { critical: 0, important: 1, suggestion: 2 } as const
  return recommendations
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, 12)
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/** Assembles the full analysis report shown on `/analysis/[id]`. */
export function buildAnalysisReport(input: ScoreInput): AnalysisReport {
  const dimensions = computeDimensions(input)
  const overallScore = computeOverallScore(dimensions)
  const { matches, keywordCoverage } = input

  return {
    overallScore,
    dimensions,
    requirementMatches: [...matches],
    keywordCoverage: [...keywordCoverage],
    recommendations: buildRecommendations(input, dimensions),
    // Populated later by the analysis service when embeddings are configured.
    // Empty here on purpose: scoring is deterministic and offline, and must not
    // acquire a network dependency to build a report.
    gapSuggestions: [],
    counts: {
      strong: matches.filter((match) => match.status === 'strong').length,
      partial: matches.filter((match) => match.status === 'partial').length,
      missing: matches.filter((match) => match.status === 'missing').length,
      requiredMissing: matches.filter(
        (match) => match.status === 'missing' && match.priority === 'required',
      ).length,
    },
  }
}

export { PRIORITY_WEIGHT, STATUS_CREDIT, WEIGHTS }
