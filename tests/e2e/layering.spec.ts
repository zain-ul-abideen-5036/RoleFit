import { expect, test, type Page } from '@playwright/test'

/**
 * The sticky chrome has to stay on top of the page it is stuck to.
 *
 * `globals.css` declares an ordered layering scale — `--z-raised` through
 * `--z-toast` — and the site header claims `--z-header`. None of it was
 * reaching the browser: the utilities were written `z-[--z-header]`, which
 * Tailwind v4 treats as an arbitrary value and compiles to the literal
 * `z-index: --z-header`. That is not valid CSS, so the declaration was
 * discarded and every layer in the product computed to `auto`.
 *
 * A sticky element with `z-index: auto` does not out-rank a positioned
 * element that comes after it in the document. The score ring is positioned,
 * so scrolling the ATS card up painted the ring and its meters straight across
 * the wordmark and the nav links.
 *
 * `tests/unit/tailwind-variable-syntax.test.ts` guards the syntax across the
 * whole tree in milliseconds. This asserts the thing that syntax exists to
 * produce, because a scale that compiles is still not a scale that works.
 */

/** Where a hit test lands: the header, or whatever covered it. */
async function topmostAcrossHeader(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const header = document.querySelector('header')
    if (!header) return ['no-header']
    const box = header.getBoundingClientRect()

    const describe = (element: Element | null): string => {
      if (!element) return 'nothing'
      if (element.closest('header')) return 'header'
      const className = (element.className as unknown as { baseVal?: string })?.baseVal
      const name = typeof className === 'string' ? className : String(element.className ?? '')
      return `${element.tagName.toLowerCase()}${name ? `.${name.trim().split(/\s+/)[0]}` : ''}`
    }

    const hits: string[] = []
    // Across the width and through the band, rather than one convenient point.
    for (const fx of [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]) {
      for (const fy of [0.3, 0.7]) {
        hits.push(describe(document.elementFromPoint(box.width * fx, box.top + box.height * fy)))
      }
    }
    return hits
  })
}

test.describe('sticky header layering', () => {
  test('stays above the score card scrolled underneath it', async ({ page }) => {
    await page.goto('/')

    // Park the ATS card so it is partly behind the header. That is the exact
    // state that was reported: the ring overlapping the wordmark and the
    // meters running through the navigation.
    await page.evaluate(() => {
      const bar = document.querySelector('.score-bar')
      const card = bar?.closest('[data-measure]')
      if (!card) throw new Error('ATS card not found')
      window.scrollTo({
        top: window.scrollY + card.getBoundingClientRect().top + 90,
        behavior: 'instant',
      })
    })
    await page.waitForTimeout(500)

    const hits = await topmostAcrossHeader(page)
    const covered = hits.filter((hit) => hit !== 'header')

    expect(
      covered,
      `content painted over the header at ${covered.length} of ${hits.length} points`,
    ).toEqual([])
  })

  test('resolves the declared layering scale rather than falling back to auto', async ({
    page,
  }) => {
    await page.goto('/')

    const layers = await page.evaluate(() => {
      const header = document.querySelector('header')
      const root = getComputedStyle(document.documentElement)
      return {
        header: getComputedStyle(header!).zIndex,
        token: root.getPropertyValue('--z-header').trim(),
      }
    })

    // `auto` is what an invalid declaration leaves behind, and it is the exact
    // value that let the page paint over the header.
    expect(layers.header, 'the header z-index did not survive compilation').not.toBe('auto')
    expect(layers.header).toBe(layers.token)
  })
})
