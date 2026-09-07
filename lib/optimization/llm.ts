import 'server-only'

import type { AiProvider } from '@/lib/ai/types'
import { optimizationProposalSchema, type OptimizationProposal } from '@/lib/ai/schemas'
import type { JobDescriptionProfile, RequirementMatch, ResumeProfile } from '@/lib/domain/types'
import { skillLabel } from '@/lib/matching/aliases'
import { PROMPTS } from '@/prompts'

/**
 * Model-backed optimization.
 *
 * Builds the request, hands the provider the resume and posting as fenced
 * untrusted data, and returns the raw proposal. It performs no validation of
 * its own — everything the model returns goes through the same
 * `validateAndApplyProposal` path as the rule-based engine's output, so neither
 * strategy can bypass the anti-fabrication checks.
 */

export interface LlmOptimizationInput {
  resume: ResumeProfile
  job: JobDescriptionProfile
  matches: readonly RequirementMatch[]
  /** Which sections the user asked to optimize. */
  sections: readonly string[]
}

/**
 * Renders the resume as text for the model.
 *
 * Paths are included inline so the model can address a specific bullet without
 * being handed the application's internal JSON, and so a returned path can be
 * resolved exactly rather than fuzzily matched back to a bullet.
 */
export function renderResumeForModel(resume: ResumeProfile): string {
  const lines: string[] = []

  if (resume.summary?.trim()) {
    lines.push('[summary]', resume.summary.trim(), '')
  }

  if (resume.skills.length > 0) {
    lines.push('SKILLS')
    for (const group of resume.skills) {
      lines.push(`[skills.${group.id}] ${group.category}: ${group.items.join(', ')}`)
    }
    lines.push('')
  }

  if (resume.experience.length > 0) {
    lines.push('EXPERIENCE')
    for (const entry of resume.experience) {
      const dates = [entry.dates.start, entry.dates.end].filter(Boolean).join(' - ')
      lines.push(`${entry.title} at ${entry.company}${dates ? ` (${dates})` : ''}`)
      entry.bullets.forEach((bullet, index) => {
        lines.push(`[experience.${entry.id}.bullets.${index}] ${bullet}`)
      })
      lines.push('')
    }
  }

  if (resume.projects.length > 0) {
    lines.push('PROJECTS')
    for (const entry of resume.projects) {
      lines.push(entry.name)
      if (entry.description) lines.push(entry.description)
      entry.bullets.forEach((bullet, index) => {
        lines.push(`[projects.${entry.id}.bullets.${index}] ${bullet}`)
      })
      if (entry.technologies.length > 0) {
        lines.push(`Technologies: ${entry.technologies.join(', ')}`)
      }
      lines.push('')
    }
  }

  // Education and certifications are included as read-only context: the model
  // needs to know they exist, and is told elsewhere it may not alter them.
  if (resume.education.length > 0) {
    lines.push('EDUCATION (read-only)')
    for (const entry of resume.education) {
      lines.push(`${entry.degree ?? ''} ${entry.institution}`.trim())
    }
    lines.push('')
  }

  if (resume.certifications.length > 0) {
    lines.push('CERTIFICATIONS (read-only)')
    for (const entry of resume.certifications) {
      lines.push(entry.name)
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

/** Renders the posting's extracted requirements for the model. */
export function renderJobForModel(job: JobDescriptionProfile): string {
  const lines: string[] = []

  if (job.title) lines.push(`Role: ${job.title}`)
  if (job.company) lines.push(`Company: ${job.company}`)
  lines.push('')

  const section = (heading: string, items: readonly { id: string; text: string }[]): void => {
    if (items.length === 0) return
    lines.push(heading)
    for (const item of items) lines.push(`[${item.id}] ${item.text}`)
    lines.push('')
  }

  section('REQUIRED SKILLS', job.requiredSkills)
  section('PREFERRED SKILLS', job.preferredSkills)
  section('RESPONSIBILITIES', job.responsibilities)
  section('QUALIFICATIONS', job.qualifications)

  return lines.join('\n').trim()
}

/** Requests an optimization proposal from a language model. */
export async function proposeLlmOptimization(
  provider: AiProvider,
  input: LlmOptimizationInput,
): Promise<{
  proposal: OptimizationProposal
  usage: { inputTokens: number | null; outputTokens: number | null }
  promptVersion: string
}> {
  const prompt = PROMPTS.resumeOptimization

  const evidencedRequirements = input.matches
    .filter((match) => match.status !== 'missing')
    .map((match) => (match.canonical ? skillLabel(match.canonical) : match.text))
    .slice(0, 40)

  const missingRequirements = input.matches
    .filter((match) => match.status === 'missing')
    .map((match) => (match.canonical ? skillLabel(match.canonical) : match.text))
    .slice(0, 40)

  const response = await provider.generateStructured({
    promptId: prompt.PROMPT_ID,
    promptVersion: prompt.PROMPT_VERSION,
    system: prompt.SYSTEM,
    instruction: prompt.buildInstruction({
      evidencedRequirements,
      missingRequirements,
      sections: input.sections,
      targetTitle: input.job.title,
    }),
    documents: [
      {
        id: 'RESUME',
        description: "The candidate's existing resume. This is the only source of facts.",
        content: renderResumeForModel(input.resume),
      },
      {
        id: 'JOB_POSTING',
        description: 'The target job posting. Use it for terminology and emphasis only.',
        content: renderJobForModel(input.job),
      },
    ],
    schema: optimizationProposalSchema,
    schemaName: 'optimization_proposal',
    temperature: 0,
    maxOutputTokens: 8192,
  })

  return {
    proposal: response.data,
    usage: response.usage,
    promptVersion: prompt.PROMPT_VERSION,
  }
}
