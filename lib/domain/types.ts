import type { z } from 'zod'

import type {
  additionalSectionSchema,
  analysisReportSchema,
  certificationEntrySchema,
  dateRangeSchema,
  educationEntrySchema,
  evidenceSchema,
  experienceEntrySchema,
  experienceRequirementSchema,
  jobDescriptionProfileSchema,
  keywordCoverageSchema,
  linkSchema,
  personalDetailsSchema,
  projectEntrySchema,
  recommendationSchema,
  requirementMatchSchema,
  requirementSchema,
  resumeProfileSchema,
  scoreDimensionSchema,
  skillGroupSchema,
} from '@/lib/domain/schemas'

/** Types are inferred from the schemas so the two can never drift apart. */

export type DateRange = z.infer<typeof dateRangeSchema>
export type ResumeLink = z.infer<typeof linkSchema>
export type PersonalDetails = z.infer<typeof personalDetailsSchema>
export type SkillGroup = z.infer<typeof skillGroupSchema>
export type ExperienceEntry = z.infer<typeof experienceEntrySchema>
export type EducationEntry = z.infer<typeof educationEntrySchema>
export type ProjectEntry = z.infer<typeof projectEntrySchema>
export type CertificationEntry = z.infer<typeof certificationEntrySchema>
export type AdditionalSection = z.infer<typeof additionalSectionSchema>
export type ResumeProfile = z.infer<typeof resumeProfileSchema>

export type Requirement = z.infer<typeof requirementSchema>
export type ExperienceRequirement = z.infer<typeof experienceRequirementSchema>
export type JobDescriptionProfile = z.infer<typeof jobDescriptionProfileSchema>

export type Evidence = z.infer<typeof evidenceSchema>
export type EvidenceSection = Evidence['section']
export type RequirementMatch = z.infer<typeof requirementMatchSchema>
export type KeywordCoverage = z.infer<typeof keywordCoverageSchema>
export type ScoreDimension = z.infer<typeof scoreDimensionSchema>
export type ScoreDimensionKey = ScoreDimension['key']
export type Recommendation = z.infer<typeof recommendationSchema>
export type AnalysisReport = z.infer<typeof analysisReportSchema>

/** Sections of a resume that the optimizer is allowed to touch. */
export const OPTIMIZABLE_SECTIONS = ['summary', 'skills', 'experience', 'projects'] as const
export type OptimizableSection = (typeof OPTIMIZABLE_SECTIONS)[number]

/** An empty, schema-valid profile — the safe fallback when parsing yields nothing. */
export function emptyResumeProfile(): ResumeProfile {
  return {
    personal: { fullName: null, email: null, phone: null, location: null, links: [] },
    summary: null,
    skills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    achievements: [],
    additionalSections: [],
  }
}

export function emptyJobDescriptionProfile(): JobDescriptionProfile {
  return {
    title: null,
    company: null,
    location: null,
    employmentType: null,
    requiredSkills: [],
    preferredSkills: [],
    responsibilities: [],
    qualifications: [],
    experienceRequirements: [],
    education: [],
    certifications: [],
    keywords: [],
  }
}

/** Every requirement across all JD categories, in priority order. */
export function allRequirements(profile: JobDescriptionProfile): Requirement[] {
  return [
    ...profile.requiredSkills,
    ...profile.qualifications,
    ...profile.certifications,
    ...profile.education,
    ...profile.preferredSkills,
    ...profile.responsibilities,
  ]
}
