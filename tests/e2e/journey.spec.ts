import { expect, test, type Page } from '@playwright/test'

import { FIXTURE_PDF } from './setup/global-setup'
import { DEMO_JOB_DESCRIPTION_TEXT } from '../fixtures/demo-data'

/**
 * The complete user journey, against a production build.
 *
 * This is the test that proves the product works: an account is created, a real
 * PDF is uploaded and parsed, a job description is analysed, an optimization
 * runs, changes are reviewed, and both document formats are downloaded and
 * checked to be genuine files.
 *
 * The final block is the one that matters most — a second account attempting to
 * reach the first account's resume, analysis, run and document.
 */

/** A unique address per run, since the E2E database persists between runs. */
function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.test`
}

const PASSWORD = 'Correct-Horse-Battery-9'

/**
 * `{ exact: true }` throughout: the signup form deliberately associates several
 * elements with the word "Password" (the field, the show/hide toggle, and the
 * requirements list), which is correct for assistive technology but ambiguous
 * for a substring locator.
 */
async function signUp(page: Page, email: string): Promise<void> {
  await page.goto('/signup')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })
}

/**
 * Uploads the fixture resume.
 *
 * Waits for the "Choose file" control to be enabled first: the uploader is
 * driven by a change handler that does not exist until React hydrates, and it
 * disables itself until then. Setting the input before that point would attach
 * a file nothing is listening for.
 */
async function uploadFixtureResume(page: Page): Promise<void> {
  await page.goto('/optimize')
  await expect(page.getByRole('button', { name: 'Choose file' })).toBeEnabled()
  await page.setInputFiles('input[type="file"]', FIXTURE_PDF)
  await expect(page.getByText('Resume read successfully')).toBeVisible({ timeout: 30_000 })
}

test.describe('marketing site', () => {
  test('the landing page states the anti-fabrication promise', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tailor your resume')
    await expect(
      page.getByRole('heading', { name: /will not put a skill on your resume/i }),
    ).toBeVisible()

    // The score must never be presented without its disclaimer.
    await expect(
      page.getByText(/Different employers and ATS systems may score/i).first(),
    ).toBeVisible()
  })

  test('legal pages are reachable from the footer', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Privacy policy' }).click()
    await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible()

    await page.goto('/ai-disclaimer')
    await expect(page.getByRole('heading', { name: 'AI disclaimer' })).toBeVisible()
  })

  test('the app redirects an unauthenticated visitor to sign in', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('authentication', () => {
  test('creates an account, signs out and signs back in', async ({ page }) => {
    const email = uniqueEmail('auth')

    await signUp(page, email)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    // Sign out through the account menu.
    await page.getByRole('button', { name: new RegExp(email.split('@')[0]!, 'i') }).click()
    await page.getByRole('menuitem', { name: /sign out/i }).click()
    await expect(page).toHaveURL(/localhost:\d+\/$/)

    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('rejects a wrong password without revealing whether the account exists', async ({
    page,
  }) => {
    const email = uniqueEmail('wrongpass')
    await signUp(page, email)

    await page.getByRole('button', { name: new RegExp(email.split('@')[0]!, 'i') }).click()
    await page.getByRole('menuitem', { name: /sign out/i }).click()

    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill('Definitely-Wrong-1')
    await page.getByRole('button', { name: 'Sign in' }).click()

    const alert = page.getByRole('alert').first()
    await expect(alert).toContainText('That email or password is not correct.')

    // The identical message for an address that has no account.
    await page.getByLabel('Email', { exact: true }).fill(uniqueEmail('ghost'))
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert').first()).toContainText(
      'That email or password is not correct.',
    )
  })
})

test.describe('full optimization journey', () => {
  test('upload, analyse, optimize, review and export both formats', async ({ page }) => {
    await signUp(page, uniqueEmail('journey'))

    /* ---------------------------------------------------- 1. upload ---- */
    await uploadFixtureResume(page)

    // The parse must have found real structure, not an empty shell.
    await expect(page.getByText('Roles')).toBeVisible()

    await page.getByRole('button', { name: 'Continue' }).click()

    /* --------------------------------------------- 2. job description -- */
    await expect(page.getByRole('heading', { name: 'Paste the job description' })).toBeVisible()
    await page.getByLabel('Job description', { exact: true }).fill(DEMO_JOB_DESCRIPTION_TEXT)
    await page.getByRole('button', { name: 'Analyze match' }).click()

    /* -------------------------------------------------- 3. analysis ---- */
    await expect(page.getByText('ATS Readiness estimate')).toBeVisible({ timeout: 45_000 })

    // The demo posting asks for AWS and Kubernetes, which the demo resume does
    // not evidence. Both must be reported as gaps rather than filled in.
    const gapSection = page.getByText(/required item(s)? your resume does not evidence/i)
    await expect(gapSection).toBeVisible()

    /* ------------------------------------------------- 4. optimize ----- */
    await page.getByRole('button', { name: 'Optimize my resume' }).click()
    await expect(page).toHaveURL(/\/resume\/[0-9a-f-]{36}\?run=/, { timeout: 60_000 })

    /* --------------------------------------------------- 5. review ----- */
    await expect(page.getByRole('heading', { name: 'Proposed changes' })).toBeVisible()
    await expect(page.getByText('Projected ATS readiness')).toBeVisible()

    // Gaps are restated here, and never silently written into the resume.
    await expect(page.getByText(/deliberately not addressed/i)).toBeVisible()

    const pageText = await page.locator('main').innerText()
    expect(pageText).toContain('AWS')
    // …but only as a reported gap. The rendered resume must not claim it.
    const optimizedPanel = page.getByRole('region', { name: 'With your decisions applied' })
    await expect(optimizedPanel).toBeVisible()
    const optimizedText = await optimizedPanel.innerText()
    expect(optimizedText).not.toContain('AWS')
    expect(optimizedText).not.toContain('Kubernetes')
    // The candidate's real details survived.
    expect(optimizedText).toContain('Avery Chen')
    expect(optimizedText).toContain('Northwind Logistics')

    /* --------------------------------------------------- 6. export ----- */
    const pdfDownload = page.waitForEvent('download', { timeout: 60_000 })
    await page.getByRole('button', { name: 'Download PDF' }).first().click()
    const pdf = await pdfDownload
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/)

    const pdfPath = await pdf.path()
    expect(pdfPath).toBeTruthy()

    const { readFileSync } = await import('node:fs')
    const pdfBytes = readFileSync(pdfPath!)
    expect(pdfBytes.length).toBeGreaterThan(1000)
    // "%PDF-"
    expect(Array.from(pdfBytes.subarray(0, 5))).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d])

    const docxDownload = page.waitForEvent('download', { timeout: 60_000 })
    await page.getByRole('button', { name: 'Download DOCX' }).first().click()
    const docx = await docxDownload
    expect(docx.suggestedFilename()).toMatch(/\.docx$/)

    const docxBytes = readFileSync((await docx.path())!)
    // ZIP local file header "PK"
    expect(Array.from(docxBytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])

    /* --------------------------------------------------- 7. history ---- */
    await page.goto('/history')
    await expect(page.getByRole('heading', { name: 'Exported documents' })).toBeVisible()
    await expect(page.getByText(/\.pdf$/).first()).toBeVisible()
  })

  test('rejecting every change leaves the resume unchanged', async ({ page }) => {
    await signUp(page, uniqueEmail('reject'))

    await uploadFixtureResume(page)
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.getByLabel('Job description', { exact: true }).fill(DEMO_JOB_DESCRIPTION_TEXT)
    await page.getByRole('button', { name: 'Analyze match' }).click()
    await expect(page.getByText('ATS Readiness estimate')).toBeVisible({ timeout: 45_000 })

    await page.getByRole('button', { name: 'Optimize my resume' }).click()
    await expect(page).toHaveURL(/\/resume\/[0-9a-f-]{36}\?run=/, { timeout: 60_000 })

    // Wait for the review list to render before counting anything: querying a
    // still-streaming page returns zero cards and the loop below would no-op.
    await expect(page.getByRole('heading', { name: 'Proposed changes' })).toBeVisible()
    const rejectButtons = page.getByRole('button', { name: 'Reject', exact: true })
    await expect(rejectButtons.first()).toBeVisible()

    // "Reject all pending" only covers changes awaiting a decision. Minor
    // tidy-ups start accepted, so rejecting *everything* means clicking Reject
    // on every card that still offers it.
    const rejectAll = page.getByRole('button', { name: 'Reject all pending' })
    if (await rejectAll.isVisible().catch(() => false)) {
      await rejectAll.click()
    }

    for (let guard = 0; guard < 60; guard += 1) {
      const remaining = await rejectButtons.count()
      if (remaining === 0) break
      await rejectButtons.first().click()
      await expect(rejectButtons).toHaveCount(remaining - 1)
    }
    await expect(rejectButtons).toHaveCount(0)

    // Each click updates optimistically and persists in the background, so the
    // last PATCH may still be in flight. Reloading before it lands would read a
    // stale decision from the server.
    await page.waitForLoadState('networkidle')

    // With nothing accepted, the applied document must equal the original.
    await page.reload()
    const original = await page
      .getByRole('region', { name: 'Original' })
      .getByTestId('resume-body')
      .innerText()
    const applied = await page
      .getByRole('region', { name: 'With your decisions applied' })
      .getByTestId('resume-body')
      .innerText()

    expect(applied).toBe(original)
  })
})

/* ==========================================================================
   Authorization
   ========================================================================== */

test.describe('cross-account access', () => {
  test("a second account cannot reach the first account's data", async ({ browser }) => {
    /* --- victim creates everything ------------------------------------- */
    const victimContext = await browser.newContext()
    const victim = await victimContext.newPage()

    await signUp(victim, uniqueEmail('victim'))
    await uploadFixtureResume(victim)
    await victim.getByRole('button', { name: 'Continue' }).click()
    await victim.getByLabel('Job description', { exact: true }).fill(DEMO_JOB_DESCRIPTION_TEXT)
    await victim.getByRole('button', { name: 'Analyze match' }).click()
    await expect(victim.getByText('ATS Readiness estimate')).toBeVisible({ timeout: 45_000 })
    await victim.getByRole('button', { name: 'Optimize my resume' }).click()
    await expect(victim).toHaveURL(/\/resume\/[0-9a-f-]{36}\?run=/, { timeout: 60_000 })

    const url = new URL(victim.url())
    const resumeId = url.pathname.split('/').pop()!
    const runId = url.searchParams.get('run')!

    // Export a document so there is one to attempt to steal.
    const download = victim.waitForEvent('download', { timeout: 60_000 })
    await victim.getByRole('button', { name: 'Download PDF' }).first().click()
    await download

    const documents = await victim.request.get('/api/documents')
    const documentBody = (await documents.json()) as { documents: Array<{ id: string }> }
    const documentId = documentBody.documents[0]!.id

    const analyses = await victim.request.get('/api/analyses')
    const analysisBody = (await analyses.json()) as { analyses: Array<{ id: string }> }
    const analysisId = analysisBody.analyses[0]!.id

    await victimContext.close()

    /* --- attacker tries every identifier ------------------------------- */
    const attackerContext = await browser.newContext()
    const attacker = await attackerContext.newPage()
    await signUp(attacker, uniqueEmail('attacker'))

    // API: every one must be 404, never 403 — a 403 confirms the id exists.
    for (const path of [
      `/api/resumes/${resumeId}`,
      `/api/analyses/${analysisId}`,
      `/api/optimizations/${runId}`,
      `/api/documents/${documentId}/download`,
    ]) {
      const response = await attacker.request.get(path)
      expect(response.status(), `${path} must not be readable`).toBe(404)
    }

    // State-changing requests carry a same-origin header, so these assertions
    // exercise the ownership check rather than stopping at the CSRF layer.
    const sameOrigin = { origin: new URL(attacker.url()).origin }

    const deleteResponse = await attacker.request.delete(`/api/resumes/${resumeId}`, {
      headers: sameOrigin,
    })
    expect(deleteResponse.status(), "deleting another account's resume").toBe(404)

    const generateResponse = await attacker.request.post('/api/documents', {
      headers: sameOrigin,
      data: { runId, format: 'pdf' },
    })
    expect(generateResponse.status(), "generating from another account's run").toBe(404)

    // Pages render the 404 view rather than the victim's content.
    await attacker.goto(`/analysis/${analysisId}`)
    await expect(attacker.getByText('We could not find that page')).toBeVisible()

    await attacker.goto(`/resume/${resumeId}`)
    await expect(attacker.getByText('We could not find that page')).toBeVisible()

    // The attacker's own account is genuinely empty.
    const ownResumes = await attacker.request.get('/api/resumes')
    const ownBody = (await ownResumes.json()) as { resumes: unknown[] }
    expect(ownBody.resumes).toHaveLength(0)

    await attackerContext.close()
  })

  test('unauthenticated API access is rejected', async ({ request }) => {
    for (const path of ['/api/resumes', '/api/analyses', '/api/optimizations']) {
      const response = await request.get(path)
      expect(response.status(), `${path} must require authentication`).toBe(401)
    }
  })

  test('a state-changing request with no Origin header is refused', async ({ request }) => {
    // A browser always sends Origin or Referer on a state-changing request.
    // One that sends neither is not a browser, and is refused before any
    // ownership check runs.
    const response = await request.delete('/api/resumes/00000000-0000-4000-8000-000000000000')
    expect(response.status()).toBe(403)
  })

  test('a state-changing request from another origin is refused', async ({ request }) => {
    // CSRF defense: the origin header does not match the app's own origin.
    const response = await request.post('/api/auth/login', {
      headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
      data: { email: 'someone@example.test', password: 'whatever' },
    })
    expect(response.status()).toBe(403)
  })
})

/* ==========================================================================
   Health
   ========================================================================== */

test('the health endpoint reports the database as reachable', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.ok()).toBe(true)

  const body = (await response.json()) as { status: string; checks: Record<string, string> }
  expect(body.status).toBe('ok')
  expect(body.checks.database).toBe('ok')
})
