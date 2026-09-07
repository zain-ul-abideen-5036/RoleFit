import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import type { AnalysisReport, JobDescriptionProfile, ResumeProfile } from '@/lib/domain/types'
import type { AtsReport } from '@/lib/ats/types'
import type { ChangeSet } from '@/lib/optimization/types'

/* ==========================================================================
   Enums
   ========================================================================== */

export const documentKindEnum = pgEnum('document_kind', [
  'source_resume',
  'generated_pdf',
  'generated_docx',
])
export const sourceFormatEnum = pgEnum('source_format', ['pdf', 'docx'])
export const runStatusEnum = pgEnum('run_status', ['queued', 'running', 'succeeded', 'failed'])
export const changeActionEnum = pgEnum('change_action', [
  'added',
  'modified',
  'removed',
  'reordered',
])
export const changeDecisionEnum = pgEnum('change_decision', [
  'pending',
  'accepted',
  'rejected',
  'edited',
])
export const usageKindEnum = pgEnum('usage_kind', ['analysis', 'optimization', 'document_export'])
export const auditActionEnum = pgEnum('audit_action', [
  'user.signup',
  'user.login',
  'user.login_failed',
  'user.logout',
  'user.password_changed',
  'user.deleted',
  'resume.created',
  'resume.deleted',
  'analysis.created',
  'optimization.created',
  'document.generated',
  'document.downloaded',
])

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

/* ==========================================================================
   users / profiles
   ========================================================================== */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stored lower-cased; uniqueness is enforced on the normalized value. */
    email: varchar('email', { length: 320 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    /** Soft-lock applied by the auth service after repeated failures. */
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    /** Bumped on password change / "sign out everywhere" to invalidate JWTs. */
    sessionEpoch: integer('session_epoch').notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
)

export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: varchar('display_name', { length: 120 }),
  headline: varchar('headline', { length: 200 }),
  /** UI preference only. */
  theme: varchar('theme', { length: 16 }).notNull().default('system'),
  /** When false, no product analytics events are emitted for this user. */
  analyticsOptIn: boolean('analytics_opt_in').notNull().default(true),
  /** When true, source documents are purged from storage after generation. */
  autoPurgeUploads: boolean('auto_purge_uploads').notNull().default(false),
  ...timestamps,
})

/* ==========================================================================
   resumes
   ========================================================================== */

export const resumes = pgTable(
  'resumes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** User-facing label, defaulted from the original filename. */
    title: varchar('title', { length: 200 }).notNull(),
    /** Original filename, sanitized. Never used as a storage path. */
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    sourceFormat: sourceFormatEnum('source_format').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** SHA-256 of the upload, used to detect re-uploads of the same file. */
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    /** Extracted plain text. Sensitive — never logged. */
    rawText: text('raw_text').notNull(),
    /** Structured parse of `rawText`. */
    profile: jsonb('profile').$type<ResumeProfile>().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('resumes_user_created_idx').on(table.userId, table.createdAt.desc()),
    index('resumes_user_hash_idx').on(table.userId, table.contentHash),
  ],
)

/**
 * Immutable snapshots of resume content. Version 1 is the original parse;
 * each accepted optimization writes a new version.
 */
export const resumeVersions = pgTable(
  'resume_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    label: varchar('label', { length: 200 }).notNull(),
    profile: jsonb('profile').$type<ResumeProfile>().notNull(),
    /** Null for the original; set for versions produced by a run. */
    optimizationRunId: uuid('optimization_run_id'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('resume_versions_resume_number_unique').on(table.resumeId, table.versionNumber),
    index('resume_versions_user_idx').on(table.userId),
  ],
)

/* ==========================================================================
   job descriptions
   ========================================================================== */

export const jobDescriptions = pgTable(
  'job_descriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    company: varchar('company', { length: 200 }),
    /** Normalized job description text. Sensitive — never logged. */
    rawText: text('raw_text').notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    profile: jsonb('profile').$type<JobDescriptionProfile>().notNull(),
    ...timestamps,
  },
  (table) => [
    index('job_descriptions_user_created_idx').on(table.userId, table.createdAt.desc()),
    index('job_descriptions_user_hash_idx').on(table.userId, table.contentHash),
  ],
)

/* ==========================================================================
   analyses
   ========================================================================== */

export const analyses = pgTable(
  'analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    jobDescriptionId: uuid('job_description_id')
      .notNull()
      .references(() => jobDescriptions.id, { onDelete: 'cascade' }),
    /** 0-100 overall readiness. Deterministically computed, never LLM-authored. */
    overallScore: smallint('overall_score').notNull(),
    report: jsonb('report').$type<AnalysisReport>().notNull(),
    atsReport: jsonb('ats_report').$type<AtsReport>().notNull(),
    ...timestamps,
  },
  (table) => [
    index('analyses_user_created_idx').on(table.userId, table.createdAt.desc()),
    index('analyses_resume_idx').on(table.resumeId),
  ],
)

/* ==========================================================================
   optimization runs
   ========================================================================== */

export const optimizationRuns = pgTable(
  'optimization_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    status: runStatusEnum('status').notNull().default('queued'),
    /** Which AI provider and prompt version produced this run — for auditability. */
    provider: varchar('provider', { length: 32 }).notNull(),
    model: varchar('model', { length: 80 }),
    promptVersion: varchar('prompt_version', { length: 32 }).notNull(),
    /** Proposed resume content, before the user accepts or rejects changes. */
    proposedProfile: jsonb('proposed_profile').$type<ResumeProfile>(),
    /** Structured before/after diff. */
    changeSet: jsonb('change_set').$type<ChangeSet>(),
    /** ATS report recomputed against the proposed content. */
    projectedAtsReport: jsonb('projected_ats_report').$type<AtsReport>(),
    projectedScore: smallint('projected_score'),
    /** Sanitized failure reason. Never contains resume content. */
    failureCode: varchar('failure_code', { length: 64 }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('optimization_runs_user_created_idx').on(table.userId, table.createdAt.desc()),
    index('optimization_runs_analysis_idx').on(table.analysisId),
  ],
)

/**
 * One row per proposed change, so acceptance is auditable and the final
 * document can be rebuilt from user decisions alone.
 */
export const changeRecords = pgTable(
  'change_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    optimizationRunId: uuid('optimization_run_id')
      .notNull()
      .references(() => optimizationRuns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Dotted path into the resume profile, e.g. `experience.0.bullets.2`. */
    targetPath: varchar('target_path', { length: 200 }).notNull(),
    section: varchar('section', { length: 40 }).notNull(),
    action: changeActionEnum('action').notNull(),
    beforeText: text('before_text'),
    afterText: text('after_text'),
    /** Why the change was proposed, in plain language. */
    rationale: text('rationale').notNull(),
    /** Source spans from the original resume that justify the rewrite. */
    evidence: jsonb('evidence')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    decision: changeDecisionEnum('decision').notNull().default('pending'),
    /** Populated when the user hand-edits the proposed text. */
    editedText: text('edited_text'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('change_records_run_idx').on(table.optimizationRunId),
    index('change_records_user_idx').on(table.userId),
  ],
)

/* ==========================================================================
   generated documents
   ========================================================================== */

export const generatedDocuments = pgTable(
  'generated_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    resumeVersionId: uuid('resume_version_id').references(() => resumeVersions.id, {
      onDelete: 'set null',
    }),
    kind: documentKindEnum('kind').notNull(),
    /** Opaque, server-generated storage key. Never derived from user input. */
    storageKey: varchar('storage_key', { length: 400 }).notNull(),
    /** Filename offered to the user at download time. */
    filename: varchar('filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    checksum: varchar('checksum', { length: 64 }).notNull(),
    /** Result of the post-generation quality gate. */
    validation: jsonb('validation').$type<Record<string, unknown>>(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('generated_documents_user_created_idx').on(table.userId, table.createdAt.desc()),
    index('generated_documents_resume_idx').on(table.resumeId),
    uniqueIndex('generated_documents_storage_key_unique').on(table.storageKey),
  ],
)

/* ==========================================================================
   usage + audit
   ========================================================================== */

export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: usageKindEnum('kind').notNull(),
    /** Cost accounting only — never contains prompt or document content. */
    provider: varchar('provider', { length: 32 }).notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('usage_records_user_created_idx').on(table.userId, table.createdAt.desc())],
)

export const auditRecords = pgTable(
  'audit_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null for pre-authentication events such as a failed login. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: auditActionEnum('action').notNull(),
    /** Truncated to a /24 or /48 prefix before storage. */
    ipPrefix: varchar('ip_prefix', { length: 64 }),
    userAgentHash: varchar('user_agent_hash', { length: 64 }),
    /** Non-sensitive structured detail, e.g. `{ resumeId }`. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_records_user_created_idx').on(table.userId, table.createdAt.desc()),
    index('audit_records_action_created_idx').on(table.action, table.createdAt.desc()),
  ],
)

/* ==========================================================================
   relations
   ========================================================================== */

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  resumes: many(resumes),
  jobDescriptions: many(jobDescriptions),
  analyses: many(analyses),
  optimizationRuns: many(optimizationRuns),
  generatedDocuments: many(generatedDocuments),
}))

export const resumesRelations = relations(resumes, ({ one, many }) => ({
  user: one(users, { fields: [resumes.userId], references: [users.id] }),
  versions: many(resumeVersions),
  analyses: many(analyses),
  documents: many(generatedDocuments),
}))

export const resumeVersionsRelations = relations(resumeVersions, ({ one }) => ({
  resume: one(resumes, { fields: [resumeVersions.resumeId], references: [resumes.id] }),
}))

export const jobDescriptionsRelations = relations(jobDescriptions, ({ one, many }) => ({
  user: one(users, { fields: [jobDescriptions.userId], references: [users.id] }),
  analyses: many(analyses),
}))

export const analysesRelations = relations(analyses, ({ one, many }) => ({
  user: one(users, { fields: [analyses.userId], references: [users.id] }),
  resume: one(resumes, { fields: [analyses.resumeId], references: [resumes.id] }),
  jobDescription: one(jobDescriptions, {
    fields: [analyses.jobDescriptionId],
    references: [jobDescriptions.id],
  }),
  runs: many(optimizationRuns),
}))

export const optimizationRunsRelations = relations(optimizationRuns, ({ one, many }) => ({
  user: one(users, { fields: [optimizationRuns.userId], references: [users.id] }),
  analysis: one(analyses, { fields: [optimizationRuns.analysisId], references: [analyses.id] }),
  resume: one(resumes, { fields: [optimizationRuns.resumeId], references: [resumes.id] }),
  changes: many(changeRecords),
}))

export const changeRecordsRelations = relations(changeRecords, ({ one }) => ({
  run: one(optimizationRuns, {
    fields: [changeRecords.optimizationRunId],
    references: [optimizationRuns.id],
  }),
}))

export const generatedDocumentsRelations = relations(generatedDocuments, ({ one }) => ({
  user: one(users, { fields: [generatedDocuments.userId], references: [users.id] }),
  resume: one(resumes, { fields: [generatedDocuments.resumeId], references: [resumes.id] }),
}))

/* ==========================================================================
   inferred row types
   ========================================================================== */

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Profile = typeof profiles.$inferSelect
export type Resume = typeof resumes.$inferSelect
export type NewResume = typeof resumes.$inferInsert
export type ResumeVersion = typeof resumeVersions.$inferSelect
export type JobDescription = typeof jobDescriptions.$inferSelect
export type Analysis = typeof analyses.$inferSelect
export type OptimizationRun = typeof optimizationRuns.$inferSelect
export type ChangeRecord = typeof changeRecords.$inferSelect
export type NewChangeRecord = typeof changeRecords.$inferInsert
export type GeneratedDocument = typeof generatedDocuments.$inferSelect
export type AuditRecord = typeof auditRecords.$inferSelect
