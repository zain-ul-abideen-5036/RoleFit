import 'server-only'

import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import {
  analyses,
  changeRecords,
  generatedDocuments,
  jobDescriptions,
  optimizationRuns,
  resumeVersions,
  resumes,
  usageRecords,
  type Analysis,
  type ChangeRecord,
  type GeneratedDocument,
  type JobDescription,
  type OptimizationRun,
  type Resume,
} from '@/db/schema'
import { errors } from '@/lib/errors'
import { getDb } from '@/server/db/client'

/**
 * Data access.
 *
 * Every read and write in this file takes a `userId` and includes it in the
 * WHERE clause. There is no function here that can fetch a row by id alone —
 * that is the structural defense against IDOR, rather than an ownership check
 * remembered at each call site.
 *
 * A row belonging to someone else is reported as "not found", never
 * "forbidden": a 403 would confirm the id exists.
 */

/* ==========================================================================
   Resumes
   ========================================================================== */

export interface CreateResumeInput {
  userId: string
  title: string
  originalFilename: string
  sourceFormat: 'pdf' | 'docx'
  sizeBytes: number
  contentHash: string
  rawText: string
  profile: Resume['profile']
}

export async function createResume(input: CreateResumeInput): Promise<Resume> {
  const db = getDb()

  return db.transaction(async (tx) => {
    const [resume] = await tx.insert(resumes).values(input).returning()
    if (!resume) throw errors.internal(new Error('resume insert returned no row'))

    // Version 1 is always the original parse, so a user can return to exactly
    // what they uploaded no matter how many optimizations they run.
    await tx.insert(resumeVersions).values({
      resumeId: resume.id,
      userId: input.userId,
      versionNumber: 1,
      label: 'Original',
      profile: input.profile,
    })

    return resume
  })
}

export async function findResume(userId: string, resumeId: string): Promise<Resume | null> {
  const resume = await getDb().query.resumes.findFirst({
    where: and(eq(resumes.id, resumeId), eq(resumes.userId, userId), isNull(resumes.deletedAt)),
  })
  return resume ?? null
}

/** Fetches a resume or throws 404. */
export async function requireResume(userId: string, resumeId: string): Promise<Resume> {
  const resume = await findResume(userId, resumeId)
  if (!resume) throw errors.notFound({ entity: 'resume' })
  return resume
}

export async function listResumes(userId: string, limit = 50): Promise<Resume[]> {
  return getDb().query.resumes.findMany({
    where: and(eq(resumes.userId, userId), isNull(resumes.deletedAt)),
    orderBy: desc(resumes.createdAt),
    limit,
  })
}

/** Soft-deletes a resume. Hard deletion happens via account deletion. */
export async function softDeleteResume(userId: string, resumeId: string): Promise<void> {
  const result = await getDb()
    .update(resumes)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId), isNull(resumes.deletedAt)))
    .returning({ id: resumes.id })

  if (result.length === 0) throw errors.notFound({ entity: 'resume' })
}

/** Finds a previously uploaded resume with identical content. */
export async function findResumeByHash(
  userId: string,
  contentHash: string,
): Promise<Resume | null> {
  const resume = await getDb().query.resumes.findFirst({
    where: and(
      eq(resumes.userId, userId),
      eq(resumes.contentHash, contentHash),
      isNull(resumes.deletedAt),
    ),
    orderBy: desc(resumes.createdAt),
  })
  return resume ?? null
}

/* ==========================================================================
   Resume versions
   ========================================================================== */

export async function createResumeVersion(input: {
  userId: string
  resumeId: string
  label: string
  profile: Resume['profile']
  optimizationRunId?: string | null
}): Promise<typeof resumeVersions.$inferSelect> {
  const db = getDb()

  return db.transaction(async (tx) => {
    const [{ maxVersion } = { maxVersion: 0 }] = await tx
      .select({ maxVersion: sql<number>`coalesce(max(${resumeVersions.versionNumber}), 0)` })
      .from(resumeVersions)
      .where(
        and(eq(resumeVersions.resumeId, input.resumeId), eq(resumeVersions.userId, input.userId)),
      )

    const [version] = await tx
      .insert(resumeVersions)
      .values({
        resumeId: input.resumeId,
        userId: input.userId,
        versionNumber: Number(maxVersion) + 1,
        label: input.label,
        profile: input.profile,
        optimizationRunId: input.optimizationRunId ?? null,
      })
      .returning()

    if (!version) throw errors.internal(new Error('version insert returned no row'))
    return version
  })
}

export async function listResumeVersions(
  userId: string,
  resumeId: string,
): Promise<Array<typeof resumeVersions.$inferSelect>> {
  return getDb().query.resumeVersions.findMany({
    where: and(eq(resumeVersions.resumeId, resumeId), eq(resumeVersions.userId, userId)),
    orderBy: desc(resumeVersions.versionNumber),
  })
}

/* ==========================================================================
   Job descriptions
   ========================================================================== */

export async function createJobDescription(input: {
  userId: string
  title: string
  company: string | null
  rawText: string
  contentHash: string
  profile: JobDescription['profile']
}): Promise<JobDescription> {
  const [row] = await getDb().insert(jobDescriptions).values(input).returning()
  if (!row) throw errors.internal(new Error('job description insert returned no row'))
  return row
}

export async function requireJobDescription(userId: string, id: string): Promise<JobDescription> {
  const row = await getDb().query.jobDescriptions.findFirst({
    where: and(eq(jobDescriptions.id, id), eq(jobDescriptions.userId, userId)),
  })
  if (!row) throw errors.notFound({ entity: 'job_description' })
  return row
}

/* ==========================================================================
   Analyses
   ========================================================================== */

export async function createAnalysis(input: {
  userId: string
  resumeId: string
  jobDescriptionId: string
  overallScore: number
  report: Analysis['report']
  atsReport: Analysis['atsReport']
}): Promise<Analysis> {
  const [row] = await getDb().insert(analyses).values(input).returning()
  if (!row) throw errors.internal(new Error('analysis insert returned no row'))
  return row
}

export async function requireAnalysis(userId: string, id: string): Promise<Analysis> {
  const row = await getDb().query.analyses.findFirst({
    where: and(eq(analyses.id, id), eq(analyses.userId, userId)),
  })
  if (!row) throw errors.notFound({ entity: 'analysis' })
  return row
}

export async function listAnalyses(userId: string, limit = 50): Promise<Analysis[]> {
  return getDb().query.analyses.findMany({
    where: eq(analyses.userId, userId),
    orderBy: desc(analyses.createdAt),
    limit,
  })
}

/* ==========================================================================
   Optimization runs
   ========================================================================== */

export async function createOptimizationRun(input: {
  userId: string
  analysisId: string
  resumeId: string
  provider: string
  model: string | null
  promptVersion: string
}): Promise<OptimizationRun> {
  const [row] = await getDb()
    .insert(optimizationRuns)
    .values({ ...input, status: 'running', startedAt: new Date() })
    .returning()
  if (!row) throw errors.internal(new Error('run insert returned no row'))
  return row
}

export async function completeOptimizationRun(
  userId: string,
  runId: string,
  update: {
    proposedProfile: OptimizationRun['proposedProfile']
    changeSet: OptimizationRun['changeSet']
    projectedAtsReport: OptimizationRun['projectedAtsReport']
    projectedScore: number
    provider: string
    model: string | null
    promptVersion: string
  },
): Promise<void> {
  await getDb()
    .update(optimizationRuns)
    .set({
      ...update,
      status: 'succeeded',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(optimizationRuns.id, runId), eq(optimizationRuns.userId, userId)))
}

export async function failOptimizationRun(
  userId: string,
  runId: string,
  failureCode: string,
): Promise<void> {
  await getDb()
    .update(optimizationRuns)
    .set({ status: 'failed', failureCode, completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(optimizationRuns.id, runId), eq(optimizationRuns.userId, userId)))
}

export async function requireOptimizationRun(
  userId: string,
  runId: string,
): Promise<OptimizationRun> {
  const row = await getDb().query.optimizationRuns.findFirst({
    where: and(eq(optimizationRuns.id, runId), eq(optimizationRuns.userId, userId)),
  })
  if (!row) throw errors.notFound({ entity: 'optimization_run' })
  return row
}

export async function listOptimizationRuns(userId: string, limit = 50): Promise<OptimizationRun[]> {
  return getDb().query.optimizationRuns.findMany({
    where: eq(optimizationRuns.userId, userId),
    orderBy: desc(optimizationRuns.createdAt),
    limit,
  })
}

/** The most recent successful run for a resume, if any. */
export async function latestRunForResume(
  userId: string,
  resumeId: string,
): Promise<OptimizationRun | null> {
  const row = await getDb().query.optimizationRuns.findFirst({
    where: and(
      eq(optimizationRuns.userId, userId),
      eq(optimizationRuns.resumeId, resumeId),
      eq(optimizationRuns.status, 'succeeded'),
    ),
    orderBy: desc(optimizationRuns.createdAt),
  })
  return row ?? null
}

/* ==========================================================================
   Change records
   ========================================================================== */

export async function insertChangeRecords(
  rows: Array<typeof changeRecords.$inferInsert>,
): Promise<ChangeRecord[]> {
  if (rows.length === 0) return []
  return getDb().insert(changeRecords).values(rows).returning()
}

export async function listChangeRecords(userId: string, runId: string): Promise<ChangeRecord[]> {
  return getDb().query.changeRecords.findMany({
    where: and(eq(changeRecords.optimizationRunId, runId), eq(changeRecords.userId, userId)),
    orderBy: changeRecords.createdAt,
  })
}

export async function updateChangeDecision(
  userId: string,
  changeId: string,
  decision: ChangeRecord['decision'],
  editedText: string | null,
): Promise<ChangeRecord> {
  const [row] = await getDb()
    .update(changeRecords)
    .set({ decision, editedText, decidedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(changeRecords.id, changeId), eq(changeRecords.userId, userId)))
    .returning()

  if (!row) throw errors.notFound({ entity: 'change_record' })
  return row
}

/* ==========================================================================
   Generated documents
   ========================================================================== */

export async function createGeneratedDocument(
  input: Omit<typeof generatedDocuments.$inferInsert, 'id'>,
): Promise<GeneratedDocument> {
  const [row] = await getDb().insert(generatedDocuments).values(input).returning()
  if (!row) throw errors.internal(new Error('document insert returned no row'))
  return row
}

export async function requireGeneratedDocument(
  userId: string,
  documentId: string,
): Promise<GeneratedDocument> {
  const row = await getDb().query.generatedDocuments.findFirst({
    where: and(
      eq(generatedDocuments.id, documentId),
      eq(generatedDocuments.userId, userId),
      isNull(generatedDocuments.deletedAt),
    ),
  })
  if (!row) throw errors.notFound({ entity: 'document' })
  return row
}

export async function listGeneratedDocuments(
  userId: string,
  resumeId?: string,
): Promise<GeneratedDocument[]> {
  return getDb().query.generatedDocuments.findMany({
    where: resumeId
      ? and(
          eq(generatedDocuments.userId, userId),
          eq(generatedDocuments.resumeId, resumeId),
          isNull(generatedDocuments.deletedAt),
        )
      : and(eq(generatedDocuments.userId, userId), isNull(generatedDocuments.deletedAt)),
    orderBy: desc(generatedDocuments.createdAt),
    limit: 100,
  })
}

/** Every storage key belonging to a user, for purge-on-delete. */
export async function listAllStorageKeys(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ storageKey: generatedDocuments.storageKey })
    .from(generatedDocuments)
    .where(eq(generatedDocuments.userId, userId))

  return rows.map((row) => row.storageKey)
}

/* ==========================================================================
   Usage
   ========================================================================== */

export async function recordUsage(input: {
  userId: string
  kind: 'analysis' | 'optimization' | 'document_export'
  provider: string
  inputTokens?: number | null
  outputTokens?: number | null
  durationMs?: number | null
}): Promise<void> {
  await getDb()
    .insert(usageRecords)
    .values({
      userId: input.userId,
      kind: input.kind,
      provider: input.provider,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      durationMs: input.durationMs ?? null,
    })
}

/* ==========================================================================
   Dashboard aggregates
   ========================================================================== */

export interface DashboardStats {
  resumeCount: number
  analysisCount: number
  optimizationCount: number
  documentCount: number
  averageScore: number | null
  latestScore: number | null
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const db = getDb()

  const [counts] = await db
    .select({
      resumeCount: sql<number>`(select count(*) from ${resumes} where ${resumes.userId} = ${userId} and ${resumes.deletedAt} is null)`,
      analysisCount: sql<number>`(select count(*) from ${analyses} where ${analyses.userId} = ${userId})`,
      optimizationCount: sql<number>`(select count(*) from ${optimizationRuns} where ${optimizationRuns.userId} = ${userId} and ${optimizationRuns.status} = 'succeeded')`,
      documentCount: sql<number>`(select count(*) from ${generatedDocuments} where ${generatedDocuments.userId} = ${userId} and ${generatedDocuments.deletedAt} is null)`,
      averageScore: sql<
        number | null
      >`(select avg(${analyses.overallScore}) from ${analyses} where ${analyses.userId} = ${userId})`,
    })
    .from(sql`(select 1) as _`)

  const latest = await db.query.analyses.findFirst({
    where: eq(analyses.userId, userId),
    orderBy: desc(analyses.createdAt),
    columns: { overallScore: true },
  })

  return {
    resumeCount: Number(counts?.resumeCount ?? 0),
    analysisCount: Number(counts?.analysisCount ?? 0),
    optimizationCount: Number(counts?.optimizationCount ?? 0),
    documentCount: Number(counts?.documentCount ?? 0),
    averageScore:
      counts?.averageScore === null || counts?.averageScore === undefined
        ? null
        : Math.round(Number(counts.averageScore)),
    latestScore: latest?.overallScore ?? null,
  }
}
