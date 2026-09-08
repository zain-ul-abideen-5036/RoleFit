import { expect, test, type Page } from '@playwright/test'

/**
 * Password reset and email verification, in a real browser.
 *
 * These deliberately do **not** read a token. The suite has no access to the
 * mailbox, and the token-dependent paths — single use, the redemption race,
 * session invalidation — are covered by the integration suite against a real
 * database.
 *
 * What only a browser can show is the part a person actually experiences: that
 * the response to "email me a link" is identical for an address with an account
 * and one without. That is the enumeration defense, observed from outside.
 */

const PASSWORD = 'E2ePassword123'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100_000)}@example.com`
}

async function requestReset(page: Page, email: string): Promise<void> {
  await page.goto('/forgot-password')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByRole('button', { name: 'Email me a reset link' }).click()
}

test.describe('requesting a reset link', () => {
  test('offers the flow from the sign-in form', async ({ page }) => {
    await page.goto('/login')

    await page.getByRole('link', { name: 'reset it' }).click()
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  })

  test('answers identically for an account that exists and one that does not', async ({
    page,
    browser,
  }) => {
    const real = uniqueEmail('recovery-real')

    await page.goto('/signup')
    await page.getByLabel('Email', { exact: true }).fill(real)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })

    // Fresh context, so no session influences the response.
    const anonymous = await browser.newContext()
    const knownPage = await anonymous.newPage()
    await requestReset(knownPage, real)
    await expect(knownPage.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    const knownText = await knownPage.locator('main').innerText()
    await anonymous.close()

    const other = await browser.newContext()
    const unknownPage = await other.newPage()
    const absent = uniqueEmail('recovery-absent')
    await requestReset(unknownPage, absent)
    await expect(unknownPage.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    const unknownText = await unknownPage.locator('main').innerText()
    await other.close()

    // The only difference permitted is the address echoed back.
    expect(unknownText.replace(absent, 'ADDRESS')).toBe(knownText.replace(real, 'ADDRESS'))
  })

  test('states the link is single use and time limited', async ({ page }) => {
    await requestReset(page, uniqueEmail('recovery-copy'))

    const main = page.locator('main')
    await expect(main).toContainText('one hour')
    await expect(main).toContainText('once')
  })

  test('never claims an email was sent, only that one is on its way if the account exists', async ({
    page,
  }) => {
    await requestReset(page, uniqueEmail('recovery-wording'))

    // Wording that is true whether or not the address has an account.
    await expect(page.locator('main')).toContainText('If an account exists')
  })

  test('lets the user try again without reloading', async ({ page }) => {
    await requestReset(page, uniqueEmail('recovery-retry'))

    await page.getByRole('button', { name: 'try again' }).click()
    await expect(page.getByRole('button', { name: 'Email me a reset link' })).toBeVisible()
  })
})

test.describe('redeeming a link', () => {
  test('explains a reset link with no token, and offers a new one', async ({ page }) => {
    await page.goto('/reset-password')

    await expect(page.getByRole('heading', { name: 'That link is incomplete' })).toBeVisible()
    await page.getByRole('link', { name: 'Request a new link' }).click()
    await expect(page).toHaveURL(/\/forgot-password/)
  })

  test('refuses a reset token that was never issued', async ({ page }) => {
    await page.goto(`/reset-password?token=${'A'.repeat(43)}`)

    await page.getByLabel('New password', { exact: true }).fill('BrandNewPassword1')
    await page.getByRole('button', { name: 'Set new password' }).click()

    // Scoped to main: Next.js renders its own role="alert" route announcer.
    await expect(page.locator('main').getByRole('alert')).toContainText(/no longer valid/i)
    // Still on the page, not signed in, nothing changed.
    await expect(page).toHaveURL(/\/reset-password/)
  })

  test('refuses a verification token that was never issued', async ({ page }) => {
    await page.goto(`/verify-email?token=${'B'.repeat(43)}`)

    await expect(page.getByRole('heading', { name: 'That link is no longer valid' })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('does not sign anyone in from an invalid verification link', async ({ page }) => {
    await page.goto(`/verify-email?token=${'C'.repeat(43)}`)
    await expect(page.getByRole('heading', { name: 'That link is no longer valid' })).toBeVisible({
      timeout: 15_000,
    })

    // The app must still treat this browser as signed out.
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('rejects a malformed token at the schema before any lookup', async ({ page }) => {
    // Not base64url, so the request never reaches a database query.
    await page.goto('/reset-password?token=not%20a%20valid%20token%21')

    await page.getByLabel('New password', { exact: true }).fill('BrandNewPassword1')
    await page.getByRole('button', { name: 'Set new password' }).click()

    await expect(page.locator('main').getByRole('alert')).toBeVisible()
  })
})

test.describe('the reset pages are usable', () => {
  test('shows the password requirements as they are met', async ({ page }) => {
    await page.goto(`/reset-password?token=${'D'.repeat(43)}`)

    const requirements = page.getByRole('list', { name: 'Password requirements' })
    await expect(requirements).toBeVisible()

    await page.getByLabel('New password', { exact: true }).fill('short')
    await expect(requirements).toContainText('At least 12 characters')

    await page.getByLabel('New password', { exact: true }).fill('LongEnoughPass1')
    await expect(requirements.getByText('(met)').first()).toBeAttached()
  })

  test('lets the new password be revealed', async ({ page }) => {
    await page.goto(`/reset-password?token=${'E'.repeat(43)}`)

    const field = page.getByLabel('New password', { exact: true })
    await field.fill('SomePassword123')
    await expect(field).toHaveAttribute('type', 'password')

    await page.getByRole('button', { name: 'Show password' }).click()
    await expect(field).toHaveAttribute('type', 'text')
  })

  test('keeps the recovery pages out of search results', async ({ page }) => {
    // These URLs carry a token in the query string; they must never be indexed.
    for (const path of ['/forgot-password', '/reset-password', '/verify-email']) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute('content', /noindex/)
    }
  })
})
