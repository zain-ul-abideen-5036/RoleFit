/**
 * Product-wide constants shared by client and server.
 * Safe to import from anywhere — contains no secrets.
 */

export const PRODUCT = {
  name: 'RoleFit',
  tagline: 'Tailor Your Resume. Match the Role. Get Hired.',
  description:
    'RoleFit rewrites your existing resume for a specific job description — evidence-based, ATS-friendly, and never inventing experience you do not have.',
  owner: 'Zain Ul Abideen',
  supportEmail: 'abideen5036@gmail.com',
  repository: 'https://github.com/zain-ul-abideen-5036/RoleFit',
  githubOwner: 'zain-ul-abideen-5036',
} as const

/**
 * The disclaimer that must accompany every surfaced score. The score is our
 * estimate of ATS compatibility, not a value produced by any real ATS vendor.
 */
export const ATS_SCORE_DISCLAIMER =
  'This score estimates compatibility using common ATS-friendly formatting and job-description alignment practices. Different employers and ATS systems may score resumes differently.'

export const UPLOAD = {
  /** Kept at/below Vercel's 4.5 MB serverless request body cap. */
  maxBytes: 4_500_000,
  maxBytesLabel: '4.5 MB',
  acceptedMimeTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ] as const,
  acceptedExtensions: ['.pdf', '.docx'] as const,
  acceptAttribute:
    '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const

export const JOB_DESCRIPTION = {
  minLength: 120,
  maxLength: 30_000,
} as const

export const RESUME_TEXT = {
  minLength: 180,
  maxLength: 60_000,
} as const

/** Requirement importance, ordered from most to least critical. */
export const REQUIREMENT_PRIORITIES = ['required', 'preferred', 'optional'] as const
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number]

export const MATCH_STATUSES = ['strong', 'partial', 'missing'] as const
export type MatchStatus = (typeof MATCH_STATUSES)[number]

/** Human-readable copy for the anti-fabrication rule, reused across the UI. */
export const MISSING_REQUIREMENT_LABEL = 'Missing / not verified'

export const SCORE_BANDS = [
  { min: 85, label: 'Excellent', tone: 'success' },
  { min: 70, label: 'Strong', tone: 'success' },
  { min: 55, label: 'Moderate', tone: 'warning' },
  { min: 0, label: 'Needs work', tone: 'danger' },
] as const

export function scoreBand(score: number): (typeof SCORE_BANDS)[number] {
  return SCORE_BANDS.find((band) => score >= band.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1]!
}

export const OPTIMIZATION_STAGES = [
  { key: 'parsing_resume', label: 'Reading your resume' },
  { key: 'parsing_job', label: 'Analyzing the job description' },
  { key: 'matching', label: 'Comparing requirements against your evidence' },
  { key: 'optimizing', label: 'Optimizing relevant experience' },
  { key: 'validating', label: 'Checking ATS compatibility' },
  { key: 'generating', label: 'Preparing your resume' },
] as const

export type OptimizationStageKey = (typeof OPTIMIZATION_STAGES)[number]['key']
