import 'server-only'

import type { RequirementMatch, ResumeProfile } from '@/lib/domain/types'
import { buildEvidenceIndex } from '@/lib/matching/evidence'
import { rankBySimilarity } from '@/lib/embeddings/similarity'
import type { EmbeddingProvider } from '@/lib/embeddings/types'

/**
 * "The closest thing your resume already says."
 *
 * For each requirement the lexical engine reports as **missing**, this finds the
 * span of the resume nearest to it in embedding space and shows it to the user.
 *
 * It is advisory, and the boundaries are deliberate:
 *
 *  - Only `missing` requirements are considered. A requirement the lexical
 *    engine already evidenced needs no suggestion, and offering one would
 *    invite the reading that the two signals are being combined.
 *  - Nothing here changes a status, a confidence, or a score. The gap stays a
 *    gap; the user is simply told what they have that is adjacent to it.
 *  - Nothing here is ever passed to the optimizer as evidence. A near-miss in
 *    embedding space is not a fact about the candidate, and treating it as one
 *    is exactly the fabrication the validator exists to prevent.
 *
 * The suggestion is a prompt to the *person*: "you wrote this — is it the same
 * thing?" Only they can answer that.
 */

/**
 * Below this, the nearest span is not worth mentioning.
 *
 * Cosine similarity on `text-embedding-3-small` puts genuinely unrelated short
 * texts around 0.1–0.2, so a floor here keeps the feature from confidently
 * pairing "Kubernetes" with whatever happens to be least distant.
 */
export const SUGGESTION_FLOOR = 0.45

/** At most one suggestion per gap: a list of maybes is not more helpful. */
const PER_REQUIREMENT = 1

export interface GapSuggestion {
  requirementId: string
  /** The resume text that came closest. Quoted verbatim. */
  excerpt: string
  section: string
  /** Cosine similarity, 0-1 after clamping. Shown as a hint, not a score. */
  similarity: number
}

export interface SuggestGapsInput {
  resume: ResumeProfile
  matches: readonly RequirementMatch[]
  provider: EmbeddingProvider
  /** Cap on requirements considered, to bound cost on a huge posting. */
  maxRequirements?: number
}

/**
 * Finds the nearest resume span for each missing requirement.
 *
 * Returns an empty array rather than throwing when there is nothing to do or
 * the provider fails. This is an advisory extra; losing it must never fail the
 * analysis that carries it.
 */
export async function suggestGapBridges(input: SuggestGapsInput): Promise<GapSuggestion[]> {
  const missing = input.matches
    .filter((match) => match.status === 'missing')
    .slice(0, input.maxRequirements ?? 25)

  if (missing.length === 0) return []

  const spans = buildEvidenceIndex(input.resume).filter((span) => span.excerpt.trim().length > 0)
  if (spans.length === 0) return []

  // One request for both sides, so the vectors are comparable: embeddings from
  // two different models are not in the same space, and batching them together
  // makes it impossible to accidentally mix.
  const requirementTexts = missing.map((match) => match.text)
  const spanTexts = spans.map((span) => span.excerpt)

  let vectors: number[][]
  try {
    vectors = await input.provider.embed([...requirementTexts, ...spanTexts])
  } catch {
    // Logged by the provider. Silent here: the analysis is still correct
    // without suggestions, and a partial failure must not surface as an error
    // about something the user did not ask for.
    return []
  }

  if (vectors.length !== requirementTexts.length + spanTexts.length) return []

  const requirementVectors = vectors.slice(0, requirementTexts.length)
  const spanVectors = vectors.slice(requirementTexts.length)

  const candidates = spans.map((span, index) => ({
    item: span,
    vector: spanVectors[index]!,
  }))

  const suggestions: GapSuggestion[] = []

  for (const [index, match] of missing.entries()) {
    const ranked = rankBySimilarity(requirementVectors[index]!, candidates, {
      minSimilarity: SUGGESTION_FLOOR,
      limit: PER_REQUIREMENT,
    })

    const best = ranked[0]
    if (!best) continue

    suggestions.push({
      requirementId: match.requirementId,
      excerpt: best.item.excerpt,
      section: best.item.section,
      similarity: Number(best.similarity.toFixed(3)),
    })
  }

  return suggestions
}
