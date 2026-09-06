import * as jdAnalysisV1 from '@/prompts/jd-analysis/v1'
import * as resumeExtractionV1 from '@/prompts/resume-extraction/v1'
import * as resumeOptimizationV1 from '@/prompts/resume-optimization/v1'

/**
 * Prompt registry.
 *
 * Every prompt is a versioned module. Runs record which id and version produced
 * them, so behaviour changes are traceable and an old run can always be
 * explained by the prompt that actually generated it.
 *
 * To change a prompt's behaviour, add a new version — do not edit a released
 * one in place.
 */

export const PROMPTS = {
  resumeOptimization: resumeOptimizationV1,
  jdAnalysis: jdAnalysisV1,
  resumeExtraction: resumeExtractionV1,
} as const

/** Current version selected for each prompt. */
export const ACTIVE_PROMPT_VERSIONS = {
  [resumeOptimizationV1.PROMPT_ID]: resumeOptimizationV1.PROMPT_VERSION,
  [jdAnalysisV1.PROMPT_ID]: jdAnalysisV1.PROMPT_VERSION,
  [resumeExtractionV1.PROMPT_ID]: resumeExtractionV1.PROMPT_VERSION,
} as const

export type PromptKey = keyof typeof PROMPTS
