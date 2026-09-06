import { z } from 'zod'

import { MATCH_STATUSES, REQUIREMENT_PRIORITIES } from '@/lib/constants'

/**
 * The canonical domain model.
 *
 * These schemas are the single source of truth: TypeScript types are inferred
 * from them, and every AI response is parsed through them before it is allowed
 * anywhere near the database or the UI. If the model returns something that
 * does not fit, it is rejected — never coerced silently.
 */

/* ==========================================================================
   Shared primitives
   ========================================================================== */

/** Stable identifier for an entry, so change paths survive re-ordering. */
export const entryIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Entry ids must be URL-safe')

/** Free text that appears in a generated document. */
const documentText = (max: number) => z.string().trim().max(max)

export const dateRangeSchema = z.object({
  /** Free-form as it appeared on the resume, e.g. "Mar 2021". Never invented. */
  start: documentText(40).nullable().default(null),
  end: documentText(40).nullable().default(null),
  isCurrent: z.boolean().default(false),
})

export const linkSchema = z.object({
  label: documentText(60),
  url: z.string().trim().max(500),
})

/* ==========================================================================
   Resume profile
   ========================================================================== */

export const personalDetailsSchema = z.object({
  fullName: documentText(120).nullable().default(null),
  email: documentText(320).nullable().default(null),
  phone: documentText(50).nullable().default(null),
  location: documentText(120).nullable().default(null),
  links: z.array(linkSchema).max(12).default([]),
})

export const skillGroupSchema = z.object({
  id: entryIdSchema,
  /** e.g. "Languages", "Cloud & DevOps". "Skills" when the resume had no groups. */
  category: documentText(80),
  items: z.array(documentText(80)).max(80).default([]),
})

export const experienceEntrySchema = z.object({
  id: entryIdSchema,
  company: documentText(160),
  title: documentText(160),
  location: documentText(120).nullable().default(null),
  dates: dateRangeSchema,
  bullets: z.array(documentText(600)).max(20).default([]),
})

export const educationEntrySchema = z.object({
  id: entryIdSchema,
  institution: documentText(200),
  degree: documentText(200).nullable().default(null),
  field: documentText(160).nullable().default(null),
  location: documentText(120).nullable().default(null),
  dates: dateRangeSchema,
  details: z.array(documentText(400)).max(10).default([]),
})

export const projectEntrySchema = z.object({
  id: entryIdSchema,
  name: documentText(160),
  description: documentText(600).nullable().default(null),
  bullets: z.array(documentText(600)).max(12).default([]),
  technologies: z.array(documentText(80)).max(40).default([]),
  link: z.string().trim().max(500).nullable().default(null),
})

export const certificationEntrySchema = z.object({
  id: entryIdSchema,
  name: documentText(200),
  issuer: documentText(160).nullable().default(null),
  issued: documentText(40).nullable().default(null),
  expires: documentText(40).nullable().default(null),
  credentialId: documentText(120).nullable().default(null),
})

export const additionalSectionSchema = z.object({
  id: entryIdSchema,
  heading: documentText(80),
  items: z.array(documentText(600)).max(20).default([]),
})

export const resumeProfileSchema = z.object({
  personal: personalDetailsSchema,
  summary: documentText(2000).nullable().default(null),
  skills: z.array(skillGroupSchema).max(12).default([]),
  experience: z.array(experienceEntrySchema).max(25).default([]),
  education: z.array(educationEntrySchema).max(15).default([]),
  projects: z.array(projectEntrySchema).max(25).default([]),
  certifications: z.array(certificationEntrySchema).max(30).default([]),
  achievements: z.array(documentText(600)).max(25).default([]),
  additionalSections: z.array(additionalSectionSchema).max(10).default([]),
})

/* ==========================================================================
   Job description profile
   ========================================================================== */

export const requirementPrioritySchema = z.enum(REQUIREMENT_PRIORITIES)

export const requirementSchema = z.object({
  id: entryIdSchema,
  /** The requirement as written in the posting. */
  text: documentText(400),
  /** Canonical skill token when the requirement names a specific technology. */
  canonical: documentText(80).nullable().default(null),
  priority: requirementPrioritySchema,
  /** Which JD section it came from — used to weight the score. */
  category: z.enum(['skill', 'responsibility', 'qualification', 'education', 'certification']),
})

export const experienceRequirementSchema = z.object({
  /** Minimum years, when the posting states a number. Null when unstated. */
  minYears: z.number().min(0).max(50).nullable().default(null),
  text: documentText(300),
})

export const jobDescriptionProfileSchema = z.object({
  title: documentText(200).nullable().default(null),
  company: documentText(200).nullable().default(null),
  location: documentText(160).nullable().default(null),
  employmentType: documentText(80).nullable().default(null),
  requiredSkills: z.array(requirementSchema).max(80).default([]),
  preferredSkills: z.array(requirementSchema).max(80).default([]),
  responsibilities: z.array(requirementSchema).max(60).default([]),
  qualifications: z.array(requirementSchema).max(40).default([]),
  experienceRequirements: z.array(experienceRequirementSchema).max(10).default([]),
  education: z.array(requirementSchema).max(15).default([]),
  certifications: z.array(requirementSchema).max(20).default([]),
  /** Deduplicated, normalized ATS keywords worth covering. */
  keywords: z.array(documentText(80)).max(150).default([]),
})

/* ==========================================================================
   Matching + analysis
   ========================================================================== */

export const matchStatusSchema = z.enum(MATCH_STATUSES)

/** A pointer back into the source resume that justifies a claim. */
export const evidenceSchema = z.object({
  /** Dotted path into the resume profile, e.g. `experience.abc123.bullets.2`. */
  path: z.string().max(200),
  section: z.enum([
    'summary',
    'skills',
    'experience',
    'education',
    'projects',
    'certifications',
    'achievements',
    'additional',
  ]),
  excerpt: documentText(600),
})

export const requirementMatchSchema = z.object({
  requirementId: entryIdSchema,
  text: documentText(400),
  canonical: documentText(80).nullable(),
  priority: requirementPrioritySchema,
  category: requirementSchema.shape.category,
  status: matchStatusSchema,
  /** 0-1. Deterministically computed by the matching engine. */
  confidence: z.number().min(0).max(1),
  /** How the match was established — surfaced in the UI for transparency. */
  method: z.enum(['exact', 'alias', 'normalized', 'semantic', 'none']),
  evidence: z.array(evidenceSchema).max(6).default([]),
})

export const keywordCoverageSchema = z.object({
  keyword: documentText(80),
  present: z.boolean(),
  occurrences: z.number().int().min(0),
  sections: z.array(evidenceSchema.shape.section).default([]),
})

export const scoreDimensionSchema = z.object({
  key: z.enum([
    'keyword_alignment',
    'skill_alignment',
    'responsibility_alignment',
    'resume_structure',
    'formatting_compatibility',
    'section_completeness',
    'relevance',
  ]),
  label: z.string().max(80),
  /** 0-100 for this dimension alone. */
  score: z.number().min(0).max(100),
  /** Relative contribution to the overall score; weights sum to 1. */
  weight: z.number().min(0).max(1),
  detail: z.string().max(400),
})

export const recommendationSchema = z.object({
  id: entryIdSchema,
  severity: z.enum(['critical', 'important', 'suggestion']),
  title: z.string().max(160),
  detail: z.string().max(600),
  /** Which score dimension improves if the user acts on this. */
  dimension: scoreDimensionSchema.shape.key.nullable().default(null),
})

export const analysisReportSchema = z.object({
  overallScore: z.number().min(0).max(100),
  dimensions: z.array(scoreDimensionSchema),
  requirementMatches: z.array(requirementMatchSchema),
  keywordCoverage: z.array(keywordCoverageSchema),
  recommendations: z.array(recommendationSchema),
  /** Convenience roll-ups so the UI does not re-derive them. */
  counts: z.object({
    strong: z.number().int().min(0),
    partial: z.number().int().min(0),
    missing: z.number().int().min(0),
    requiredMissing: z.number().int().min(0),
  }),
})

/* ==========================================================================
   Input validation (HTTP boundary)
   ========================================================================== */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(320)
  .email('Enter a valid email address')

export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(200, 'Use at most 200 characters')
  .refine((v) => /[a-z]/.test(v), 'Include a lowercase letter')
  .refine((v) => /[A-Z]/.test(v), 'Include an uppercase letter')
  .refine((v) => /[0-9]/.test(v), 'Include a number')

export const signupInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(120).optional(),
})

export const loginInputSchema = z.object({
  email: emailSchema,
  /** Deliberately not `passwordSchema`: existing passwords must still work. */
  password: z.string().min(1, 'Enter your password').max(200),
})

export type ResumeProfileInput = z.input<typeof resumeProfileSchema>
