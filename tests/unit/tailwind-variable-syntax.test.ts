import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Tailwind v4 reads a bare CSS variable from parentheses, not brackets.
 *
 * `z-(--z-header)` compiles to `z-index: var(--z-header)`. The bracket form
 * `z-[--z-header]` is an *arbitrary value*, so it compiles to the literal
 * `z-index: --z-header`, which is not valid CSS. The browser discards the
 * declaration and the property falls back — silently, with no build warning
 * and no console error.
 *
 * That had happened in 57 places. The whole layering scale was inert, so every
 * `z-*` resolved to `auto` and the sticky site header stopped occluding
 * anything: scrolling the ATS card up painted the score ring and its meters
 * straight over the wordmark and the nav. The motion tokens were inert too,
 * so `duration-(--duration-fast)` and the custom easing had never once applied
 * and every transition in the product was running on Tailwind's 150ms default.
 *
 * Nothing about this is visible in review — the class name reads correctly and
 * names a token that really exists. It is only visible in the emitted CSS, so
 * it is asserted here, against the source, where it costs a few milliseconds
 * and cannot come back one call site at a time.
 */

const ROOT = process.cwd()
const SEARCH_DIRS = ['app', 'components', 'lib', 'hooks']
const EXTENSIONS = ['.ts', '.tsx', '.css']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'test-results', 'playwright-report'])

/**
 * A utility ending in `-[--token]`.
 *
 * Anchored on the leading `--` so it matches only the variable shorthand.
 * Genuine arbitrary values (`top-[7px]`, `w-[calc(100%-2rem)]`) and variant
 * brackets (`data-[state=open]`) are untouched, and a deliberate
 * `text-[var(--x)]` is correct CSS and passes.
 */
const BRACKETED_VARIABLE = /[A-Za-z0-9_:-]+-\[--[A-Za-z0-9-]+\]/g

function sourceFiles(dir: string): string[] {
  const found: string[] = []

  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (EXTENSIONS.some((extension) => entry.name.endsWith(extension))) found.push(path)
    }
  }

  try {
    walk(join(ROOT, dir))
  } catch {
    // A directory the project does not have is not a failure.
  }
  return found
}

describe('Tailwind CSS-variable utilities', () => {
  it('never reads a variable through brackets, which emits invalid CSS', () => {
    const offences: string[] = []

    for (const dir of SEARCH_DIRS) {
      for (const file of sourceFiles(dir)) {
        const lines = readFileSync(file, 'utf8').split('\n')
        lines.forEach((line, index) => {
          for (const match of line.matchAll(BRACKETED_VARIABLE)) {
            const fixed = match[0].replace(/-\[(--[A-Za-z0-9-]+)\]/, '-($1)')
            offences.push(
              `${relative(ROOT, file).split(sep).join('/')}:${index + 1}  ${match[0]}  ->  ${fixed}`,
            )
          }
        })
      }
    }

    expect(
      offences,
      `Tailwind v4 reads a bare CSS variable from parentheses. These compile to a literal\n` +
        `declaration such as "z-index: --z-header", which the browser discards:\n\n` +
        `${offences.join('\n')}\n`,
    ).toEqual([])
  })

  it('matches the bracketed form so the guard above cannot silently pass', () => {
    // The check is worth only as much as the pattern behind it, and a pattern
    // that matches nothing makes an empty result look like a clean tree.
    const sample = 'sticky top-0 z-[--z-header] border-b'
    expect([...sample.matchAll(BRACKETED_VARIABLE)].map((m) => m[0])).toEqual(['z-[--z-header]'])
  })

  it('leaves real arbitrary values and variant brackets alone', () => {
    const sample =
      'top-[7px] w-[calc(100%-2rem)] data-[state=open]:flex text-[var(--color-fg)] grid-cols-[1fr_auto]'
    expect([...sample.matchAll(BRACKETED_VARIABLE)]).toEqual([])
  })
})
