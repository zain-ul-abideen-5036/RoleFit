import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * A score meter must draw the number printed beside it.
 *
 * This exists because it did not. `ScoreBar` renders a fill whose width comes
 * entirely from `transform: scaleX(--score-fill)`, and that declaration lived
 * only inside the two `[data-measure]` rules belonging to the scroll reveal.
 * Everywhere the reveal did not apply — every score in the product, and the
 * marketing card itself whenever the reveal correctly declined to run — the
 * fill had no transform, so `h-full` painted it across the whole track. An 88,
 * a 74 and a 100 drew three identical full bars, each directly beneath the
 * number contradicting it.
 *
 * It is asserted here rather than in a component test because nothing about it
 * is visible to jsdom: the markup was always right, and the bug lived entirely
 * in which stylesheet rules matched. Only a real engine that resolves the
 * cascade and computes a layout can see it.
 *
 * The assertion is geometric on purpose. Checking for the presence of a class
 * or a custom property would have passed throughout — both were always there.
 * The only question worth asking is how wide the bar actually is.
 */

/** Tolerance in percentage points: sub-pixel rounding on a ~200px track. */
const TOLERANCE = 1.5

interface Meter {
  label: string
  reported: number
  drawn: number
  state: string
}

async function readMeters(page: Page): Promise<Meter[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.score-bar')].map((bar) => {
      const track = bar.querySelector('[role="meter"]')!
      const fill = bar.querySelector('.score-fill')!
      const trackWidth = track.getBoundingClientRect().width
      return {
        label: track.getAttribute('aria-label') ?? '(unlabelled)',
        reported: Number(track.getAttribute('aria-valuenow')),
        // Measured, not read back from the style: this is the width a person
        // actually sees, whatever combination of rules produced it.
        drawn: trackWidth === 0 ? -1 : (fill.getBoundingClientRect().width / trackWidth) * 100,
        state: bar.closest('[data-measure]')?.getAttribute('data-measure') ?? 'none',
      }
    }),
  )
}

/**
 * Reads the meters once they have stopped changing.
 *
 * Every assertion below is about a *resting* state, so a single sample taken
 * while the page is still settling is not evidence either way. This polls
 * until two consecutive reads agree and then returns that reading.
 *
 * It is here because this spec failed once, in a full-suite run, in a way that
 * 130-odd subsequent executions — including 25 anchor loads under 6x CPU
 * throttling — never reproduced, and the message was not captured. Rather
 * than declare an unexplained failure benign, the read-too-early window is
 * removed. It costs nothing when the page is already settled, and a genuine
 * regression still fails: a bar drawn at the wrong width stays wrong on every
 * sample and fails on the deadline.
 */
async function readSettledMeters(page: Page): Promise<Meter[]> {
  let previous: string | null = null

  await expect
    .poll(
      async () => {
        const meters = await readMeters(page)
        const current = JSON.stringify(meters)
        const unchanged = current === previous
        previous = current

        /*
         * `armed` never counts as rest, however still it looks.
         *
         * It is the transient snap to empty that exists only so `running` has
         * somewhere to transition from, and while it lasts the reading does
         * not change — so two consecutive samples inside that window agree
         * with each other and look exactly like a settled page. That is what
         * made an earlier version of this helper report a bar drawn at 0% as
         * final, on an anchor load where the smooth scroll was still
         * travelling when the effect ran.
         *
         * A card that is genuinely stuck armed is a stranded zero, which is
         * the one failure this whole mechanism is built to avoid. Excluding
         * the phase means such a card runs out the deadline and fails, rather
         * than being quietly accepted as settled.
         */
        return unchanged && meters.every((meter) => meter.state !== 'armed')
      },
      { message: 'the meters never settled out of the armed state', timeout: 10_000 },
    )
    .toBe(true)

  return readMeters(page)
}

function expectMetersHonest(meters: Meter[]): void {
  expect(meters.length, 'no meters found — the selector or the page changed').toBeGreaterThan(0)

  for (const meter of meters) {
    expect(
      meter.drawn,
      `${meter.label} reports ${meter.reported} but draws ${meter.drawn.toFixed(1)}%`,
    ).toBeCloseTo(meter.reported, -Math.log10(TOLERANCE * 2))
  }
}

test.describe('score meters draw their reading', () => {
  test('on the marketing card, once the reveal has settled', async ({ page }) => {
    await page.goto('/')
    await page.locator('#ats').scrollIntoViewIfNeeded()

    /*
     * Polled to the reading rather than waiting on `getAnimations()`.
     *
     * The obvious wait — "no animation is running on the fill" — is the trap
     * `settle()` in the accessibility spec already documents, and it caught
     * this test on its first run. An armed bar has `transition: none` and so
     * reports *zero* animations, `[].every()` is `true`, and the wait resolves
     * instantly on a bar still snapped to empty. Asserting the thing we care
     * about, with a deadline, has no such hole: a bar that never arrives fails
     * on the timeout instead of passing on a technicality.
     */
    await expect
      .poll(
        async () =>
          (await readMeters(page)).every((m) => Math.abs(m.drawn - m.reported) <= TOLERANCE),
        { message: 'the bars never swept to their reported values', timeout: 8_000 },
      )
      .toBe(true)

    const meters = await readMeters(page)
    expectMetersHonest(meters)

    // The three values are deliberately distinct. If a future regression
    // collapsed every bar to one width the check above could still pass when
    // all three happened to report the same number; this makes that explicit.
    const reported = meters.map((m) => m.reported)
    expect(new Set(reported).size, 'fixture no longer distinguishes the bars').toBeGreaterThan(1)
    const drawn = meters.map((m) => Math.round(m.drawn))
    expect(new Set(drawn).size, `every bar drew the same width: ${drawn.join(', ')}`).toBe(
      new Set(reported).size,
    )
  })

  test('when the page is opened directly on the anchor', async ({ page }) => {
    /*
     * Deliberately says nothing about which phase the reveal chose.
     *
     * An earlier version asserted `idle` here, on the reasoning that the card
     * is already on screen so `MeasureReveal` should decline to run. That
     * failed intermittently with `armed`, and the reveal was right: `html` has
     * `scroll-behavior: smooth`, so the jump to a fragment is *animated*. When
     * the effect runs while that scroll is still travelling, the card really
     * is off screen, arming really is correct, and the observer then sweeps it
     * in as it arrives. Which of the two happens depends on how fast the page
     * loaded, which is not something a test should pin down.
     *
     * So this asserts the contract instead: however it got there, the bars end
     * up drawn to their readings. The idle path specifically — the one that
     * shipped broken — is covered deterministically by the two tests below,
     * both of which return from the effect before it can arm anything.
     */
    await page.goto('/#ats')
    const meters = await readSettledMeters(page)

    expect(['idle', 'running'], `unexpected resting phase: ${meters[0]?.state}`).toContain(
      meters[0]?.state,
    )
    expectMetersHonest(meters)
  })

  test('under prefers-reduced-motion, which never arms either', async ({ browser }) => {
    const page = await openPage(browser, { reducedMotion: 'reduce' })
    await page.goto('/#ats')

    const meters = await readSettledMeters(page)
    expect(meters[0]?.state).toBe('idle')
    expectMetersHonest(meters)
    await page.close()
  })

  test('with JavaScript disabled, from the server markup alone', async ({ browser }) => {
    // The stated contract of the reveal is that every failure path lands on
    // the true reading rather than on zero. With no JavaScript nothing arms it
    // and nothing can un-arm it, so this is that promise at its strictest.
    const page = await openPage(browser, { javaScriptEnabled: false })
    await page.goto('/#ats')

    expectMetersHonest(await readSettledMeters(page))
    await page.close()
  })
})

test.describe('the score ring draws its reading', () => {
  test('the arc is swept to the score, not left whole or empty', async ({ page }) => {
    await page.goto('/#ats')

    const arc = await page.evaluate(() => {
      const el = document.querySelector('.score-arc') as SVGCircleElement | null
      if (!el) return null
      const style = getComputedStyle(el)
      const length = parseFloat(style.strokeDasharray)
      const offset = parseFloat(style.strokeDashoffset)
      return { drawn: ((length - offset) / length) * 100 }
    })

    expect(arc, 'no score arc found').not.toBeNull()
    const label = await page.locator('svg[role="img"]').first().getAttribute('aria-label')
    const reported = Number(/(\d+) out of 100/.exec(label ?? '')?.[1])

    expect(reported).toBeGreaterThan(0)
    expect(arc!.drawn, `ring reports ${reported} but sweeps ${arc!.drawn.toFixed(1)}%`).toBeCloseTo(
      reported,
      -Math.log10(TOLERANCE * 2),
    )
  })
})

async function openPage(
  browser: Browser,
  options: { reducedMotion?: 'reduce'; javaScriptEnabled?: boolean },
): Promise<Page> {
  const context = await browser.newContext(options)
  return context.newPage()
}
