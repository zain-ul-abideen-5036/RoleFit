/**
 * Vector similarity.
 *
 * Computed in JavaScript rather than in the database. pgvector is the right
 * answer at a scale this product does not have: a resume has tens of spans and
 * a posting tens of requirements, so a full comparison is a few thousand dot
 * products over ~1500 dimensions — single-digit milliseconds, against a new
 * database extension that local development and the test suite would both have
 * to install.
 */

/**
 * Cosine similarity, in [-1, 1].
 *
 * Returns 0 for a zero-magnitude vector rather than dividing by zero. An empty
 * or all-zero embedding means the provider had nothing to work with, and 0 —
 * "unrelated" — is the honest reading of that, not NaN.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0

  let dot = 0
  let magA = 0
  let magB = 0

  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]!
    const right = b[i]!
    dot += left * right
    magA += left * left
    magB += right * right
  }

  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

/** Rescales cosine similarity from [-1, 1] to [0, 1] for display. */
export function toDisplayScore(similarity: number): number {
  return Math.min(1, Math.max(0, (similarity + 1) / 2))
}

export interface RankedMatch<T> {
  item: T
  similarity: number
}

/**
 * The closest candidates to a query vector, best first.
 *
 * `minSimilarity` is not optional. Every caller has to decide what "too far
 * apart to mention" means, and a default would let a caller show the least-bad
 * of a set of unrelated things as though it were relevant.
 */
export function rankBySimilarity<T>(
  query: readonly number[],
  candidates: readonly { item: T; vector: readonly number[] }[],
  options: { minSimilarity: number; limit: number },
): RankedMatch<T>[] {
  return candidates
    .map((candidate) => ({
      item: candidate.item,
      similarity: cosineSimilarity(query, candidate.vector),
    }))
    .filter((ranked) => ranked.similarity >= options.minSimilarity)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, options.limit)
}
