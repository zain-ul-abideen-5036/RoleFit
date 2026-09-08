/**
 * Text normalization for the matching engine.
 *
 * Matching accuracy depends entirely on both sides being reduced to the same
 * shape first. The rules here are deliberately conservative: they fold case,
 * accents and punctuation variants, but they never stem or truncate words —
 * aggressive stemming is what makes naive matchers claim "Java" satisfies
 * "JavaScript".
 */

/**
 * Technology names whose punctuation carries meaning. These are rewritten to
 * punctuation-free slugs *before* tokenization, so `C++` does not degrade to
 * `c` and collide with the C language, and `.NET` does not vanish entirely.
 *
 * Order matters: longer patterns first.
 */
const PUNCTUATED_TECH: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bobjective-c\b/g, 'objectivec'],
  // A trailing \b cannot anchor after `+` or `#` (both non-word characters), so
  // these use a negative lookahead instead: `C++` must not also match `C+++`.
  [/\bc\+\+(?!\+)/g, 'cplusplus'],
  [/\bc#(?![\w#])/g, 'csharp'],
  [/\bf#(?![\w#])/g, 'fsharp'],
  [/\basp\.net\s+core\b/g, 'aspnetcore'],
  [/\basp\.net\b/g, 'aspnet'],
  [/\.net\s+core\b/g, 'dotnetcore'],
  [/(^|[^a-z0-9])\.net\b/g, '$1dotnet'],
  [/\bnode\.js\b/g, 'nodejs'],
  [/\bnext\.js\b/g, 'nextjs'],
  [/\bnuxt\.js\b/g, 'nuxtjs'],
  [/\bnest\.js\b/g, 'nestjs'],
  [/\bvue\.js\b/g, 'vuejs'],
  [/\breact\.js\b/g, 'reactjs'],
  [/\bexpress\.js\b/g, 'expressjs'],
  [/\bd3\.js\b/g, 'd3js'],
  [/\bthree\.js\b/g, 'threejs'],
  [/\bsocket\.io\b/g, 'socketio'],
  [/\bci\s*\/\s*cd\b/g, 'cicd'],
  [/\bui\s*\/\s*ux\b/g, 'ui ux'],
  [/\ba\s*\/\s*b\s+testing\b/g, 'ab testing'],
]

/** Characters that behave like separators once punctuation is folded away. */
const SEPARATORS = /[\s/\\|,;:()[\]{}<>"`~!?@#$%^&*_=+‐‑‒–—―-]+/g

/**
 * Possessives and contractions. Handled by deletion rather than by treating the
 * apostrophe as a separator, which would leave a meaningless "s" token behind
 * and let "teammate's review" drift away from "teammate review".
 */
const POSSESSIVE = /'s\b/g
const APOSTROPHE = /'/g

/**
 * Folds a raw string to comparable form: lower case, no diacritics, normalized
 * punctuation, single-spaced.
 */
export function normalizeText(input: string): string {
  let text = input
    .normalize('NFKD')
    // strip combining marks left by NFKD — "Café" and "Cafe" must compare equal
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    // unify quote and dash variants before anything else looks at them
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/…/g, '...')

  for (const [pattern, replacement] of PUNCTUATED_TECH) {
    text = text.replace(pattern, replacement)
  }

  return (
    text
      .replace(POSSESSIVE, '')
      .replace(APOSTROPHE, '')
      // a period that ends a word is punctuation, not part of a token
      .replace(/\.(?=\s|$)/g, ' ')
      .replace(SEPARATORS, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** Normalizes and splits into word tokens. Empty tokens are dropped. */
export function tokenize(input: string): string[] {
  const normalized = normalizeText(input)
  if (!normalized) return []
  return normalized.split(' ').filter(Boolean)
}

/**
 * Words that carry no matching signal. Kept small on purpose — over-stopping
 * destroys short requirements like "CI/CD in AWS".
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'as',
  'at',
  'by',
  'is',
  'are',
  'be',
  'was',
  'were',
  'been',
  'from',
  'that',
  'this',
  'these',
  'those',
  'it',
  'its',
  'you',
  'your',
  'we',
  'our',
  'will',
  'have',
  'has',
  'had',
  'strong',
  'excellent',
  'good',
  'solid',
  'proven',
  'demonstrated',
  'ability',
  'experience',
  'knowledge',
  'understanding',
  'familiarity',
  'working',
  'work',
  'plus',
  'nice',
  'must',
  'should',
  'ideally',
  'preferably',
  'etc',
])

export function isStopWord(token: string): boolean {
  return STOP_WORDS.has(token)
}

/** Content-bearing tokens only. */
export function contentTokens(input: string): string[] {
  return tokenize(input).filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

/**
 * Whether `needle` appears in `haystack` as a whole token sequence.
 *
 * This is the guard against the classic false positive: `java` must not match
 * inside `javascript`. Both sides are normalized, then compared on token
 * boundaries rather than as raw substrings.
 */
export function containsPhrase(haystack: string, needle: string): boolean {
  const needleTokens = tokenize(needle)
  if (needleTokens.length === 0) return false

  const hayTokens = tokenize(haystack)
  if (hayTokens.length < needleTokens.length) return false

  outer: for (let i = 0; i <= hayTokens.length - needleTokens.length; i += 1) {
    for (let j = 0; j < needleTokens.length; j += 1) {
      if (hayTokens[i + j] !== needleTokens[j]) continue outer
    }
    return true
  }
  return false
}

/**
 * Space-delimited token form used for fast repeated phrase lookups.
 *
 * `containsPhrase` re-tokenizes both sides on every call, which is fine for a
 * one-off comparison but quadratic in the matcher's hot loop (every evidence
 * span against every known skill). Precomputing both sides into padded token
 * strings turns each check into a native substring search that still respects
 * token boundaries: " java " is not found inside " javascript ".
 */
export function toTokenHaystack(input: string): string {
  const tokens = tokenize(input)
  return tokens.length === 0 ? '' : ` ${tokens.join(' ')} `
}

/** Padded needle to search inside a `toTokenHaystack` result. */
export function toTokenNeedle(input: string): string {
  const tokens = tokenize(input)
  return tokens.length === 0 ? '' : ` ${tokens.join(' ')} `
}

/** Whole-token phrase test over precomputed padded token strings. */
export function haystackContains(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false
  return haystack.includes(needle)
}

/** Counts non-overlapping whole-token occurrences of `needle` in `haystack`. */
export function countPhrase(haystack: string, needle: string): number {
  const needleTokens = tokenize(needle)
  if (needleTokens.length === 0) return 0

  const hayTokens = tokenize(haystack)
  let count = 0
  let i = 0

  while (i <= hayTokens.length - needleTokens.length) {
    let matched = true
    for (let j = 0; j < needleTokens.length; j += 1) {
      if (hayTokens[i + j] !== needleTokens[j]) {
        matched = false
        break
      }
    }
    if (matched) {
      count += 1
      i += needleTokens.length
    } else {
      i += 1
    }
  }
  return count
}

/**
 * Jaccard similarity over content tokens — the similarity half of the fuzzy
 * score. Cheap, deterministic and explainable, which matters more here than
 * the marginal accuracy of an embedding model.
 */
export function tokenSimilarity(a: string, b: string): number {
  const setA = new Set(contentTokens(a))
  const setB = new Set(contentTokens(b))
  if (setA.size === 0 || setB.size === 0) return 0

  let intersection = 0
  for (const token of setA) if (setB.has(token)) intersection += 1

  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Proportion of `needle`'s content tokens present in `haystack`. Asymmetric on
 * purpose: a short requirement fully covered by a long bullet should score 1,
 * which Jaccard would penalise for the length difference.
 */
export function coverageRatio(needle: string, haystack: string): number {
  const needleTokens = new Set(contentTokens(needle))
  if (needleTokens.size === 0) return 0

  const hayTokens = new Set(contentTokens(haystack))
  let hits = 0
  for (const token of needleTokens) if (hayTokens.has(token)) hits += 1

  return hits / needleTokens.size
}

const TAB = String.fromCharCode(9)
const NEWLINE = String.fromCharCode(10)

/** Collapses whitespace and strips control characters, preserving line breaks. */
export function cleanDocumentText(input: string): string {
  return (
    input
      .replace(/\r\n?/g, NEWLINE)
      // Control characters, keeping tab and newline. Unicode property classes are
      // used rather than literal ranges so this source file stays printable.
      .replace(/\p{Cc}/gu, (ch) => (ch === NEWLINE || ch === TAB ? ch : ''))
      // Format characters: zero-width space/joiners, BOM, soft hyphen. These
      // routinely survive PDF extraction and silently break keyword matching.
      .replace(/\p{Cf}/gu, '')
      // Non-breaking and typographic spaces -> plain space
      .replace(/\p{Zs}/gu, ' ')
      // Ligatures that PDF extraction emits as single glyphs
      .replace(/ﬁ/g, 'fi')
      .replace(/ﬂ/g, 'fl')
      .replace(/ﬀ/g, 'ff')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, NEWLINE)
      .replace(/\n{3,}/g, NEWLINE + NEWLINE)
      .trim()
  )
}

/** Normalizes the many bullet glyphs found in resumes to a single marker. */
export function normalizeBulletGlyphs(input: string): string {
  return input.replace(/^[ \t]*[•‣▪▫●○◦⁃∙·*+‒–—―-]\s+/gm, '- ')
}
