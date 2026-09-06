import { describe, expect, it } from 'vitest'

import { generatePdf } from '@/lib/documents/pdf'
import { demoResumeProfile } from '@/tests/fixtures/demo-data'

/**
 * Geometric verification of the generated PDF.
 *
 * Reading the text back proves the content survived; these tests prove the
 * *layout* is sound. Every glyph run is inspected at its real position, so
 * overflow past a margin, text drawn off-page, or lines colliding with one
 * another fail the build instead of reaching an employer's inbox.
 */

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN_X = 50
const MARGIN_BOTTOM = 46
/** Sub-point rounding in font metrics; anything larger is a real overflow. */
const TOLERANCE = 1

interface Run {
  text: string
  x: number
  y: number
  width: number
  height: number
  page: number
}

async function readRuns(bytes: Uint8Array): Promise<Run[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const document = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
  }).promise
  const runs: Run[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()

    for (const raw of content.items) {
      const item = raw as unknown as {
        str: string
        transform: number[]
        width: number
        height: number
      }
      if (!item.str?.trim()) continue
      runs.push({
        text: item.str,
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
        width: item.width ?? 0,
        height: item.height ?? 0,
        page: pageNumber,
      })
    }
    page.cleanup()
  }

  await document.destroy()
  return runs
}

describe('generated PDF layout', () => {
  it('keeps every glyph run inside the horizontal margins', async () => {
    const runs = await readRuns(await generatePdf(demoResumeProfile()))
    expect(runs.length).toBeGreaterThan(20)

    const overflowing = runs.filter(
      (run) =>
        run.x < MARGIN_X - TOLERANCE || run.x + run.width > PAGE_WIDTH - MARGIN_X + TOLERANCE,
    )

    expect(
      overflowing.map((run) => ({
        text: run.text.slice(0, 40),
        right: Math.round(run.x + run.width),
        limit: PAGE_WIDTH - MARGIN_X,
      })),
    ).toEqual([])
  })

  it('keeps every glyph run inside the vertical margins', async () => {
    const runs = await readRuns(await generatePdf(demoResumeProfile()))

    const outside = runs.filter((run) => run.y < MARGIN_BOTTOM - TOLERANCE || run.y > PAGE_HEIGHT)
    expect(outside.map((run) => ({ text: run.text.slice(0, 40), y: Math.round(run.y) }))).toEqual(
      [],
    )
  })

  it('does not overlap lines vertically', async () => {
    const runs = await readRuns(await generatePdf(demoResumeProfile()))

    // Collapse runs into lines by their baseline, per page.
    const baselines = new Map<string, number>()
    for (const run of runs) {
      const key = `${run.page}:${run.y.toFixed(1)}`
      baselines.set(key, Math.max(baselines.get(key) ?? 0, run.height))
    }

    const byPage = new Map<number, Array<{ y: number; height: number }>>()
    for (const [key, height] of baselines) {
      const [pageText, yText] = key.split(':')
      const page = Number(pageText)
      if (!byPage.has(page)) byPage.set(page, [])
      byPage.get(page)!.push({ y: Number(yText), height })
    }

    for (const [page, lines] of byPage) {
      const sorted = lines.sort((a, b) => b.y - a.y)
      for (let i = 1; i < sorted.length; i += 1) {
        const above = sorted[i - 1]!
        const below = sorted[i]!
        const gap = above.y - below.y
        expect(
          gap,
          `page ${page}: lines at y=${above.y} and y=${below.y} overlap`,
        ).toBeGreaterThanOrEqual(below.height * 0.85)
      }
    }
  })

  it('hard-wraps a URL too long for the column rather than overflowing', async () => {
    const profile = demoResumeProfile()
    profile.projects[0]!.link = `https://example.com/${'a'.repeat(300)}`

    const runs = await readRuns(await generatePdf(profile))
    const overflowing = runs.filter((run) => run.x + run.width > PAGE_WIDTH - MARGIN_X + TOLERANCE)
    expect(overflowing).toEqual([])
  })

  it('starts a new page rather than drawing below the bottom margin', async () => {
    const profile = demoResumeProfile()
    profile.experience[0]!.bullets = Array.from(
      { length: 45 },
      (_, index) => `Bullet number ${index + 1} describing a delivered piece of work in detail.`,
    )

    const runs = await readRuns(await generatePdf(profile))
    const pages = new Set(runs.map((run) => run.page))

    expect(pages.size).toBeGreaterThan(1)
    expect(runs.every((run) => run.y >= MARGIN_BOTTOM - TOLERANCE)).toBe(true)
  })

  it('right-aligns dates against the right margin', async () => {
    const runs = await readRuns(await generatePdf(demoResumeProfile()))
    const dateRun = runs.find((run) => run.text.includes('Mar 2022'))

    expect(dateRun).toBeDefined()
    // Ends at the right margin, within a rounding tolerance.
    expect(dateRun!.x + dateRun!.width).toBeCloseTo(PAGE_WIDTH - MARGIN_X, 0)
  })
})
