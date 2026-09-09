import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { FIXTURE_PDF } from './setup/global-setup'
import { DEMO_JOB_DESCRIPTION_TEXT } from '../fixtures/demo-data'

/**
 * Accessibility and responsive audit.
 *
 * Runs axe against every page in both themes, and checks each breakpoint for
 * horizontal overflow — the single most common responsive defect and the one
 * users notice immediately.
 *
 * Automated checks catch roughly a third of accessibility problems. They are a
 * floor, not a certificate: keyboard order, focus management and whether a
 * label actually describes its control still need a person.
 */

const PASSWORD = 'Correct-Horse-Battery-9'

/** WCAG 2.2 AA, which is the level the product targets. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.test`
}

/**
 * Waits for entrance animations to finish before measuring.
 *
 * axe computes contrast from the composited colour, so an element caught
 * mid-fade is measured against a blend of itself and the surface behind it and
 * reported as failing. That is a real measurement of a state that exists for
 * 280ms and is not the state anyone reads the page in.
 *
 * Waiting on the animations themselves rather than a fixed sleep: a timeout
 * tuned to today's duration silently stops covering anything the moment a
 * duration changes.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .filter((a) => a.playState === 'running')
        .every((a) => {
          const timing = a.effect?.getComputedTiming()
          // Infinite animations (a shimmer, an indeterminate rail) never
          // finish and must not block the scan.
          return timing?.iterations === Infinity
        }),
    undefined,
    { timeout: 5_000 },
  )
}

async function scan(page: Page, context: string): Promise<void> {
  await settle(page)
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()

  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
  }))

  expect(violations, `axe violations on ${context}`).toEqual([])
}

/** Fails if the document scrolls horizontally, naming the offending elements. */
async function expectNoHorizontalOverflow(page: Page, context: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      offenders: Array.from(document.querySelectorAll('*'))
        .filter((element) => element.getBoundingClientRect().right > doc.clientWidth + 1)
        .slice(0, 5)
        .map((element) => `${element.tagName}.${String(element.className).slice(0, 80)}`),
    }
  })

  expect({ context, ...overflow }, `horizontal overflow on ${context}`).toMatchObject({
    offenders: [],
  })
  expect(overflow.scrollWidth, context).toBeLessThanOrEqual(overflow.clientWidth)
}

/* ==========================================================================
   Public pages
   ========================================================================== */

const PUBLIC_PAGES = ['/', '/privacy', '/terms', '/ai-disclaimer', '/login', '/signup']

test.describe('public pages', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} has no accessibility violations`, async ({ page }) => {
      await page.goto(path)
      await scan(page, `${path} (light)`)
    })
  }

  test('the landing page is accessible in dark mode', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' })
    const page = await context.newPage()
    await page.goto('/')
    await scan(page, '/ (dark)')
    await context.close()
  })
})

/* ==========================================================================
   Motion
   ========================================================================== */

test.describe('reduced motion', () => {
  /**
   * Entrance animations start at `opacity: 0`.
   *
   * That is fine while they run, and a disaster if anything ever stops them
   * running: the page would render, pass every other check, and show nothing.
   * The global `prefers-reduced-motion` block shortens durations rather than
   * removing animations, which keeps the `both` fill mode landing on the end
   * state — but that is a property worth holding onto rather than rediscovering
   * from a blank screen.
   */
  test('content is visible, not stranded at opacity 0', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/')

    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toBeVisible()

    const opacity = await heading.evaluate((el) => {
      // Walk up: the animation is on a container, not the heading itself.
      for (let node: HTMLElement | null = el as HTMLElement; node; node = node.parentElement) {
        const value = Number(getComputedStyle(node).opacity)
        if (value < 1) return value
      }
      return 1
    })

    expect(opacity, 'an ancestor is holding content invisible').toBe(1)
    await context.close()
  })

  test('the landing page is still accessible with motion reduced', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/')
    await scan(page, '/ (reduced motion)')
    await context.close()
  })
})

/* ==========================================================================
   Responsive
   ========================================================================== */

const BREAKPOINTS = [
  { name: '320px (smallest supported)', width: 320, height: 640 },
  { name: '375px (iPhone SE)', width: 375, height: 667 },
  { name: '390px (iPhone 14)', width: 390, height: 844 },
  { name: '768px (tablet portrait)', width: 768, height: 1024 },
  { name: '1024px (tablet landscape)', width: 1024, height: 768 },
  { name: '1280px (laptop)', width: 1280, height: 800 },
  { name: '1440px (desktop)', width: 1440, height: 900 },
  { name: '1920px (large desktop)', width: 1920, height: 1080 },
]

test.describe('responsive layout', () => {
  for (const breakpoint of BREAKPOINTS) {
    test(`landing page fits at ${breakpoint.name}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: breakpoint.width, height: breakpoint.height },
      })
      const page = await context.newPage()

      await page.goto('/')
      await expectNoHorizontalOverflow(page, `/ at ${breakpoint.name}`)

      await page.goto('/signup')
      await expectNoHorizontalOverflow(page, `/signup at ${breakpoint.name}`)

      await context.close()
    })
  }
})

/* ==========================================================================
   Authenticated pages
   ========================================================================== */

test.describe('authenticated pages', () => {
  test('dashboard, optimize, analysis, review, preview, history and settings', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()

    /* --- account with real data ------------------------------------- */
    await page.goto('/signup')
    await page.getByLabel('Email', { exact: true }).fill(uniqueEmail('a11y'))
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })

    // An empty dashboard is the first thing a new user sees.
    await scan(page, '/dashboard (empty state)')

    await page.goto('/optimize')
    await expect(page.getByRole('button', { name: 'Choose file' })).toBeEnabled()
    await scan(page, '/optimize (step 1)')

    await page.setInputFiles('input[type="file"]', FIXTURE_PDF)
    await expect(page.getByText('Resume read successfully')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Continue' }).click()
    await scan(page, '/optimize (step 2)')

    await page.getByLabel('Job description', { exact: true }).fill(DEMO_JOB_DESCRIPTION_TEXT)
    await page.getByRole('button', { name: 'Analyze match' }).click()
    await expect(page.getByText('ATS Readiness estimate')).toBeVisible({ timeout: 45_000 })
    await scan(page, '/optimize (step 3, analysis summary)')

    await page.getByRole('button', { name: 'Optimize my resume' }).click()
    await expect(page).toHaveURL(/\/resume\/[0-9a-f-]{36}\?run=/, { timeout: 60_000 })
    await expect(page.getByRole('heading', { name: 'Proposed changes' })).toBeVisible()
    await scan(page, '/resume/[id] (change review)')
    await expectNoHorizontalOverflow(page, '/resume/[id]')

    const resumeUrl = new URL(page.url())
    const resumeId = resumeUrl.pathname.split('/').pop()!
    const runId = resumeUrl.searchParams.get('run')!

    await page.goto(`/resume/${resumeId}/preview?run=${runId}`)
    await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible()
    await scan(page, '/resume/[id]/preview')

    // The full analysis page, which carries the densest data.
    await page.goto('/history')
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
    await scan(page, '/history')

    const analysisLink = page.locator('a[href^="/analysis/"]').first()
    await analysisLink.click()
    await expect(page.getByRole('heading', { name: 'Score breakdown' })).toBeVisible()
    await scan(page, '/analysis/[id]')
    await expectNoHorizontalOverflow(page, '/analysis/[id]')

    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await scan(page, '/settings')

    await context.close()
  })

  test('the dashboard is accessible in dark mode and on mobile', async ({ browser }) => {
    const context = await browser.newContext({
      colorScheme: 'dark',
      viewport: { width: 390, height: 844 },
    })
    const page = await context.newPage()

    await page.goto('/signup')
    await page.getByLabel('Email', { exact: true }).fill(uniqueEmail('a11y-dark'))
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })

    await scan(page, '/dashboard (dark, mobile)')
    await expectNoHorizontalOverflow(page, '/dashboard (mobile)')

    // The mobile navigation drawer is a dialog and must be accessible.
    await page.getByRole('button', { name: 'Open menu' }).click()
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible()
    await scan(page, 'mobile navigation drawer')

    // Escape must close it and return focus to the trigger.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused()

    await context.close()
  })
})

/* ==========================================================================
   Keyboard
   ========================================================================== */

test.describe('keyboard navigation', () => {
  test('the skip link is the first tab stop and moves focus to content', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')

    const skipLink = page.getByRole('link', { name: 'Skip to content' })
    await expect(skipLink).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#main$/)
  })

  test('the sign-in form is completable with the keyboard alone', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email', { exact: true }).focus()
    await page.keyboard.type('keyboard@example.test')
    await page.keyboard.press('Tab')
    await page.keyboard.type(PASSWORD)

    // The full sequence, asserted stop by stop rather than jumped over: the
    // show/hide toggle, then the password reset link in the field description,
    // then submit. The link sits next to the password field because that is
    // where someone realises they need it, and the cost is one extra Tab.
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Show password' })).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'reset it' })).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused()

    // Completable without ever leaving the keyboard.
    await page.keyboard.press('Enter')
    await expect(page.locator('main').getByRole('alert')).toBeVisible()
  })
})
