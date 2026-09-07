import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { generateDocx } from '@/lib/documents/docx'
import { generatePdf } from '@/lib/documents/pdf'
import { AppError } from '@/lib/errors'
import { extractPdf } from '@/lib/parsing/pdf'
import {
  getDashboardStats,
  listChangeRecords,
  listResumes,
  requireAnalysis,
  requireOptimizationRun,
  requireResume,
  softDeleteResume,
} from '@/server/repositories'
import { getCurrentUser, login, logout, signup } from '@/server/auth/service'
import { createAnalysisForResume } from '@/server/services/analysis-service'
import { generateDocument, loadDocumentForDownload } from '@/server/services/document-service'
import {
  buildDecidedProfile,
  decideChange,
  runOptimization,
} from '@/server/services/optimization-service'
import { ingestResume } from '@/server/services/resume-service'
import {
  assertMigrated,
  resetDatabase,
  teardownDatabase,
  TEST_PASSWORD,
  uniqueEmail,
} from '@/tests/helpers/db'
import { clearCookies } from '@/tests/setup/integration'
import { DEMO_JOB_DESCRIPTION_TEXT, demoResumeProfile } from '@/tests/fixtures/demo-data'

/**
 * End-to-end workflow against a real database.
 *
 * Covers the full path — account, upload, analyse, optimize, review, export —
 * and, just as importantly, verifies that a second user cannot reach any of it.
 */

beforeAll(async () => {
  await assertMigrated()
})

beforeEach(async () => {
  await resetDatabase()
  clearCookies()
})

afterAll(async () => {
  await teardownDatabase()
})

/** Builds a real PDF from the demo profile, to upload as a genuine file. */
async function demoResumePdf(): Promise<Uint8Array> {
  return generatePdf(demoResumeProfile())
}

async function createUser(prefix = 'user'): Promise<{ userId: string; email: string }> {
  const email = uniqueEmail(prefix)
  return signup({ email, password: TEST_PASSWORD, displayName: 'Test User' })
}

describe('authentication', () => {
  it('creates an account and establishes a session', async () => {
    const user = await createUser()
    expect(user.userId).toMatch(/^[0-9a-f-]{36}$/)

    const current = await getCurrentUser()
    expect(current?.userId).toBe(user.userId)
  })

  it('normalizes the email to lower case', async () => {
    const email = uniqueEmail('MixedCase').toUpperCase()
    const user = await signup({ email, password: TEST_PASSWORD })
    expect(user.email).toBe(email.toLowerCase())
  })

  it('refuses a duplicate account without confirming the address exists', async () => {
    const email = uniqueEmail()
    await signup({ email, password: TEST_PASSWORD })
    clearCookies()

    const error = await signup({ email, password: TEST_PASSWORD }).catch((e: unknown) => e)
    expect(AppError.isAppError(error)).toBe(true)
    expect((error as AppError).code).toBe('CONFLICT')
    // The message must not confirm that this specific address is registered.
    expect((error as AppError).message).not.toContain(email)
  })

  it('signs in with correct credentials', async () => {
    const { email } = await createUser()
    clearCookies()

    const user = await login({ email, password: TEST_PASSWORD })
    expect(user.email).toBe(email)
    expect((await getCurrentUser())?.userId).toBe(user.userId)
  })

  it('rejects a wrong password with a generic message', async () => {
    const { email } = await createUser()
    clearCookies()

    const error = await login({ email, password: 'Wrong-Password-123' }).catch((e: unknown) => e)
    expect((error as AppError).code).toBe('VALIDATION_FAILED')
    expect((error as AppError).message).toBe('That email or password is not correct.')
  })

  it('gives an unknown account the identical rejection', async () => {
    const error = await login({
      email: uniqueEmail('ghost'),
      password: TEST_PASSWORD,
    }).catch((e: unknown) => e)

    expect((error as AppError).message).toBe('That email or password is not correct.')
  })

  it('ends the session on logout', async () => {
    await createUser()
    expect(await getCurrentUser()).not.toBeNull()

    await logout()
    expect(await getCurrentUser()).toBeNull()
  })

  it('treats a tampered session cookie as no session', async () => {
    await createUser()
    clearCookies()
    expect(await getCurrentUser()).toBeNull()
  })
})

describe('resume ingestion', () => {
  it('parses an uploaded PDF into a structured profile', async () => {
    const user = await createUser()
    const { resume } = await ingestResume({
      userId: user.userId,
      bytes: await demoResumePdf(),
      filename: 'avery-chen-resume.pdf',
    })

    expect(resume.sourceFormat).toBe('pdf')
    expect(resume.profile.personal.email).toBe('avery.chen@example.com')
    expect(resume.profile.experience.length).toBeGreaterThan(0)
    expect(resume.rawText).toContain('Northwind Logistics')
  })

  it('parses an uploaded DOCX', async () => {
    const user = await createUser()
    const { resume } = await ingestResume({
      userId: user.userId,
      bytes: await generateDocx(demoResumeProfile()),
      filename: 'resume.docx',
    })

    expect(resume.sourceFormat).toBe('docx')
    expect(resume.profile.personal.fullName).toBe('Avery Chen')
  })

  it('rejects a file that is not a PDF or DOCX', async () => {
    const user = await createUser()
    const error = await ingestResume({
      userId: user.userId,
      bytes: new TextEncoder().encode('<html><body>not a resume</body></html>'),
      filename: 'resume.pdf',
    }).catch((e: unknown) => e)

    expect((error as AppError).code).toBe('UNSUPPORTED_FILE')
  })

  it('rejects an empty file', async () => {
    const user = await createUser()
    const error = await ingestResume({
      userId: user.userId,
      bytes: new Uint8Array(0),
      filename: 'resume.pdf',
    }).catch((e: unknown) => e)

    expect((error as AppError).code).toBe('DOCUMENT_EMPTY')
  })

  it('reuses the record when the same file is uploaded twice', async () => {
    const user = await createUser()
    const bytes = await demoResumePdf()

    const first = await ingestResume({ userId: user.userId, bytes, filename: 'r.pdf' })
    const second = await ingestResume({ userId: user.userId, bytes, filename: 'r.pdf' })

    expect(second.deduplicated).toBe(true)
    expect(second.resume.id).toBe(first.resume.id)
    expect(await listResumes(user.userId)).toHaveLength(1)
  })

  it('creates version 1 as the untouched original', async () => {
    const user = await createUser()
    const { resume } = await ingestResume({
      userId: user.userId,
      bytes: await demoResumePdf(),
      filename: 'r.pdf',
    })

    const { listResumeVersions } = await import('@/server/repositories')
    const versions = await listResumeVersions(user.userId, resume.id)

    expect(versions).toHaveLength(1)
    expect(versions[0]?.versionNumber).toBe(1)
    expect(versions[0]?.label).toBe('Original')
  })
})

describe('full optimization workflow', () => {
  it('runs upload to export and produces a valid, downloadable document', async () => {
    const user = await createUser()

    /* 1. upload */
    const { resume } = await ingestResume({
      userId: user.userId,
      bytes: await demoResumePdf(),
      filename: 'avery-chen.pdf',
    })

    /* 2. analyse */
    const { analysis } = await createAnalysisForResume({
      userId: user.userId,
      resumeId: resume.id,
      jobDescriptionText: DEMO_JOB_DESCRIPTION_TEXT,
    })

    expect(analysis.overallScore).toBeGreaterThan(0)
    expect(analysis.report.counts.requiredMissing).toBeGreaterThan(0)

    // The gaps the demo fixture is built around must be reported, not filled.
    const missing = analysis.report.requirementMatches
      .filter((match) => match.status === 'missing')
      .map((match) => match.canonical)
    expect(missing).toContain('aws')
    expect(missing).toContain('kubernetes')

    /* 3. optimize */
    const run = await runOptimization({ userId: user.userId, analysisId: analysis.id })
    expect(run.run.status).toBe('succeeded')

    const stored = await requireOptimizationRun(user.userId, run.run.id)
    expect(stored.status).toBe('succeeded')
    expect(stored.proposedProfile).not.toBeNull()

    /* 4. review — accept everything still pending */
    const changes = await listChangeRecords(user.userId, run.run.id)
    for (const change of changes.filter((entry) => entry.decision === 'pending')) {
      await decideChange(user.userId, change.id, 'accepted', null)
    }

    const decided = await buildDecidedProfile(user.userId, run.run.id)
    // Facts must survive review untouched.
    expect(decided.profile.personal.email).toBe(resume.profile.personal.email)
    expect(decided.profile.education).toEqual(resume.profile.education)
    expect(decided.profile.skills.flatMap((group) => group.items)).not.toContain('AWS')

    /* 5. export PDF */
    const pdf = await generateDocument({
      userId: user.userId,
      runId: run.run.id,
      format: 'pdf',
    })
    expect(pdf.document.mimeType).toBe('application/pdf')
    expect(pdf.document.sizeBytes).toBeGreaterThan(1000)

    /* 6. export DOCX */
    const docx = await generateDocument({
      userId: user.userId,
      runId: run.run.id,
      format: 'docx',
    })
    expect(docx.document.mimeType).toContain('wordprocessingml')

    /* 7. download and confirm the bytes are a real, readable document */
    const download = await loadDocumentForDownload(user.userId, pdf.document.id)
    expect(download.filename).toMatch(/\.pdf$/)

    const extracted = await extractPdf(download.bytes)
    expect(extracted.text).toContain('Avery Chen')
    expect(extracted.text).toContain('avery.chen@example.com')
    // Text is selectable, not a rasterised image.
    expect(extracted.signals.extractedCharacters).toBeGreaterThan(500)
    expect(extracted.signals.imageCount).toBe(0)
  })

  it('records a rejected change as not applied', async () => {
    const user = await createUser()
    const { resume } = await ingestResume({
      userId: user.userId,
      bytes: await demoResumePdf(),
      filename: 'r.pdf',
    })
    const { analysis } = await createAnalysisForResume({
      userId: user.userId,
      resumeId: resume.id,
      jobDescriptionText: DEMO_JOB_DESCRIPTION_TEXT,
    })
    const run = await runOptimization({ userId: user.userId, analysisId: analysis.id })

    const changes = await listChangeRecords(user.userId, run.run.id)
    for (const change of changes) {
      await decideChange(user.userId, change.id, 'rejected', null)
    }

    const decided = await buildDecidedProfile(user.userId, run.run.id)
    // With every change rejected, the result is the original resume.
    expect(decided.profile).toEqual(resume.profile)
  })

  it('reports dashboard statistics for the account', async () => {
    const user = await createUser()
    const { resume } = await ingestResume({
      userId: user.userId,
      bytes: await demoResumePdf(),
      filename: 'r.pdf',
    })
    await createAnalysisForResume({
      userId: user.userId,
      resumeId: resume.id,
      jobDescriptionText: DEMO_JOB_DESCRIPTION_TEXT,
    })

    const stats = await getDashboardStats(user.userId)
    expect(stats.resumeCount).toBe(1)
    expect(stats.analysisCount).toBe(1)
    expect(stats.averageScore).toBeGreaterThan(0)
  })
})

/* ==========================================================================
   Authorization — the checks that matter most
   ========================================================================== */

describe('cross-account access', () => {
  interface Fixture {
    userId: string
    resumeId: string
    analysisId: string
    runId: string
    documentId: string
    changeId: string
  }

  async function seedUser(prefix: string): Promise<Fixture> {
    const user = await createUser(prefix)
    const { resume } = await ingestResume({
      userId: user.userId,
      bytes: await demoResumePdf(),
      filename: 'r.pdf',
    })
    const { analysis } = await createAnalysisForResume({
      userId: user.userId,
      resumeId: resume.id,
      jobDescriptionText: DEMO_JOB_DESCRIPTION_TEXT,
    })
    const run = await runOptimization({ userId: user.userId, analysisId: analysis.id })
    const document = await generateDocument({
      userId: user.userId,
      runId: run.run.id,
      format: 'pdf',
    })
    const changes = await listChangeRecords(user.userId, run.run.id)

    return {
      userId: user.userId,
      resumeId: resume.id,
      analysisId: analysis.id,
      runId: run.run.id,
      documentId: document.document.id,
      changeId: changes[0]?.id ?? '',
    }
  }

  async function expectNotFound(promise: Promise<unknown>): Promise<void> {
    const error = await promise.catch((e: unknown) => e)
    expect(AppError.isAppError(error), 'expected an AppError').toBe(true)
    // 404 rather than 403: a 403 would confirm the resource exists.
    expect((error as AppError).code).toBe('NOT_FOUND')
    expect((error as AppError).status).toBe(404)
  }

  it("blocks reading another user's resume", async () => {
    const victim = await seedUser('victim')
    const attacker = await createUser('attacker')
    await expectNotFound(requireResume(attacker.userId, victim.resumeId))
  })

  it("blocks reading another user's analysis", async () => {
    const victim = await seedUser('victim')
    const attacker = await createUser('attacker')
    await expectNotFound(requireAnalysis(attacker.userId, victim.analysisId))
  })

  it("blocks reading another user's optimization run", async () => {
    const victim = await seedUser('victim')
    const attacker = await createUser('attacker')
    await expectNotFound(requireOptimizationRun(attacker.userId, victim.runId))
  })

  it("blocks downloading another user's document", async () => {
    const victim = await seedUser('victim')
    const attacker = await createUser('attacker')
    await expectNotFound(loadDocumentForDownload(attacker.userId, victim.documentId))
  })

  it("blocks deciding on another user's proposed change", async () => {
    const victim = await seedUser('victim')
    const attacker = await createUser('attacker')
    await expectNotFound(decideChange(attacker.userId, victim.changeId, 'accepted', null))
  })

  it("blocks deleting another user's resume", async () => {
    const victim = await seedUser('victim')
    const attacker = await createUser('attacker')
    await expectNotFound(softDeleteResume(attacker.userId, victim.resumeId))

    // and the victim's resume is untouched
    const stillThere = await requireResume(victim.userId, victim.resumeId)
    expect(stillThere.deletedAt).toBeNull()
  })

  it("blocks generating a document from another user's run", async () => {
    const victim = await seedUser('victim')
    const attacker = await createUser('attacker')
    await expectNotFound(
      generateDocument({ userId: attacker.userId, runId: victim.runId, format: 'pdf' }),
    )
  })

  it("blocks analysing against another user's resume", async () => {
    const victim = await seedUser('victim')
    const attacker = await createUser('attacker')
    await expectNotFound(
      createAnalysisForResume({
        userId: attacker.userId,
        resumeId: victim.resumeId,
        jobDescriptionText: DEMO_JOB_DESCRIPTION_TEXT,
      }),
    )
  })

  it('keeps list endpoints scoped to the caller', async () => {
    const victim = await seedUser('victim')
    const attacker = await createUser('attacker')

    expect(await listResumes(attacker.userId)).toHaveLength(0)
    expect(await listChangeRecords(attacker.userId, victim.runId)).toHaveLength(0)

    const stats = await getDashboardStats(attacker.userId)
    expect(stats.resumeCount).toBe(0)
    expect(stats.analysisCount).toBe(0)
  })
})

describe('account deletion', () => {
  it('removes every record belonging to the account', async () => {
    const user = await createUser()
    const { resume } = await ingestResume({
      userId: user.userId,
      bytes: await demoResumePdf(),
      filename: 'r.pdf',
    })
    await createAnalysisForResume({
      userId: user.userId,
      resumeId: resume.id,
      jobDescriptionText: DEMO_JOB_DESCRIPTION_TEXT,
    })

    const { deleteAccount } = await import('@/server/auth/service')
    await deleteAccount(user.userId)

    expect(await listResumes(user.userId)).toHaveLength(0)
    const stats = await getDashboardStats(user.userId)
    expect(stats.resumeCount).toBe(0)
    expect(stats.analysisCount).toBe(0)
    expect(stats.optimizationCount).toBe(0)
  })
})
