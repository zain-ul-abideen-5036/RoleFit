/**
 * WinAnsi text preparation for the PDF renderer.
 *
 * pdf-lib's standard (non-embedded) fonts encode text as WinAnsi. Handing them
 * a character outside that encoding throws mid-render, which would turn a
 * resume containing a single CJK name or an arrow glyph into a failed export.
 *
 * The strategy is to fold only what genuinely cannot be represented. WinAnsi
 * does include curly quotes, en/em dashes, the bullet and the ellipsis, so
 * those are preserved rather than flattened to ASCII — a resume should not lose
 * its typography just because it was exported as a PDF.
 */

/** The 0x80-0x9F block, which WinAnsi fills with typographic characters. */
const WINANSI_HIGH_BLOCK = [
  '€',
  '',
  '‚',
  'ƒ',
  '„',
  '…',
  '†',
  '‡',
  'ˆ',
  '‰',
  'Š',
  '‹',
  'Œ',
  '',
  'Ž',
  '',
  '',
  '‘',
  '’',
  '“',
  '”',
  '•',
  '–',
  '—',
  '˜',
  '™',
  'š',
  '›',
  'œ',
  '',
  'ž',
  'Ÿ',
]

const REPRESENTABLE = new Set<number>()
// Printable ASCII.
for (let code = 0x20; code <= 0x7e; code += 1) REPRESENTABLE.add(code)
// Latin-1 supplement.
for (let code = 0xa0; code <= 0xff; code += 1) REPRESENTABLE.add(code)
// The typographic block.
for (const character of WINANSI_HIGH_BLOCK) {
  if (character.length > 0) REPRESENTABLE.add(character.codePointAt(0)!)
}

/**
 * Characters outside WinAnsi that have a good ASCII equivalent. Anything not
 * listed here and not representable is dropped.
 */
const FOLDS = new Map<string, string>([
  ['‣', '-'],
  ['▪', '-'],
  ['▫', '-'],
  ['●', '-'],
  ['○', '-'],
  ['◦', '-'],
  ['⁃', '-'],
  ['∙', '-'],
  ['‧', '-'],
  ['―', '—'],
  ['‐', '-'],
  ['‑', '-'],
  ['‒', '–'],
  ['→', '->'],
  ['←', '<-'],
  ['⇒', '=>'],
  ['≥', '>='],
  ['≤', '<='],
  ['≈', '~'],
  ['≠', '!='],
  ['ﬁ', 'fi'],
  ['ﬂ', 'fl'],
  ['ﬀ', 'ff'],
  ['ﬃ', 'ffi'],
  ['ﬄ', 'ffl'],
  ['№', 'No.'],
  ['℅', 'c/o'],
  ['★', '*'],
  ['☆', '*'],
  ['✓', '+'],
  ['✔', '+'],
  ['✗', 'x'],
  ['✘', 'x'],
  // Latin letters with a stroke or bar. These have no canonical decomposition,
  // so NFKD leaves them intact and the generic accent-stripping path cannot
  // recover them — a name like "Łukasz" would otherwise lose its first letter.
  ['Ł', 'L'],
  ['ł', 'l'],
  ['Đ', 'D'],
  ['đ', 'd'],
  ['Ħ', 'H'],
  ['ħ', 'h'],
  ['Ŧ', 'T'],
  ['ŧ', 't'],
  ['Ŋ', 'N'],
  ['ŋ', 'n'],
  ['Ə', 'E'],
  ['ə', 'e'],
  ['ı', 'i'],
  ['ĸ', 'k'],
  ['Ɖ', 'D'],
])

/**
 * Makes a string safe for WinAnsi standard fonts.
 *
 * Decomposes accented characters that WinAnsi cannot represent directly into a
 * base letter, so "Łukasz" becomes "Lukasz" rather than "ukasz".
 */
export function toWinAnsi(input: string): string {
  const normalized = input.normalize('NFC')
  let out = ''

  for (const character of normalized) {
    const code = character.codePointAt(0)!

    if (REPRESENTABLE.has(code)) {
      out += character
      continue
    }

    const folded = FOLDS.get(character)
    if (folded !== undefined) {
      out += folded
      continue
    }

    // Space separators and zero-width formatters.
    if (/\p{Zs}/u.test(character)) {
      out += ' '
      continue
    }
    if (/\p{Cf}/u.test(character) || /\p{Cc}/u.test(character)) {
      continue
    }

    // Last resort: strip accents and keep the base letter if that is enough.
    const stripped = character.normalize('NFKD').replace(/\p{M}/gu, '')
    let recovered = ''
    for (const part of stripped) {
      const partCode = part.codePointAt(0)!
      if (REPRESENTABLE.has(partCode)) recovered += part
    }
    out += recovered
  }

  return out
}

export const __testing = { REPRESENTABLE, FOLDS }
