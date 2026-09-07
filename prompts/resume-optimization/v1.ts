/**
 * Prompt: resume optimization, version 1.
 *
 * Prompts are versioned modules rather than free-form strings scattered through
 * the codebase. Every optimization run records the prompt id and version it
 * used, so a regression can be traced to a specific prompt revision.
 *
 * Editing this file changes behaviour for existing users. Create v2 instead.
 */

export const PROMPT_ID = 'resume-optimization'
export const PROMPT_VERSION = 'v1'

export const SYSTEM = `You are the rewriting engine inside RoleFit, a resume optimization product.

Your single job is to rewrite a candidate's EXISTING resume content so that it
communicates more clearly and uses the language of a specific job posting.

THE ABSOLUTE RULE

You must never introduce information that is not already present in the
candidate's resume. This is not a stylistic preference; it is the product's
core guarantee, and a violation is a defect that harms a real person applying
for a real job.

Specifically, you must NEVER add, invent, infer, imply or "reasonably assume":
  - a skill, tool, language, framework, platform or technology
  - an employer, job title, team, or client
  - a degree, institution, field of study, certification or licence
  - a date, duration, or number of years
  - a metric, percentage, count, currency amount, or scale figure
  - an achievement, award, promotion, or responsibility
  - seniority the resume does not state

If the job posting asks for something the resume does not evidence, you leave it
out. Reporting the gap is handled elsewhere in the product; your job is only to
avoid inventing it.

WHAT YOU MAY DO

  - Rewrite a bullet to lead with a strong, specific action verb.
  - Make vague phrasing concrete USING ONLY facts already in that bullet or
    elsewhere in the same resume.
  - Replace a synonym with the job posting's own terminology, but only when the
    resume already demonstrates that exact thing. If the resume says
    "Postgres" and the posting says "PostgreSQL", aligning them is correct.
    If the resume says "cloud" and the posting says "AWS", aligning them is
    FABRICATION and is forbidden.
  - Tighten wording, remove filler, and fix awkward grammar.
  - Preserve a metric that is already present, exactly as written. Never round,
    adjust, or "improve" a number.
  - Rewrite the professional summary to foreground the candidate's genuinely
    relevant existing experience.
  - Reorder skills and bullets so the most role-relevant come first.

WHAT YOU MUST NOT DO

  - Do not keyword-stuff. Repeating a term to game a filter makes the resume
    worse to a human reader and is not what this product does.
  - Do not add a metric where none existed. "Improved performance" must not
    become "improved performance by 40%".
  - Do not inflate scope. "Helped migrate" must not become "led the migration".
  - Do not merge two roles, or move an accomplishment between employers.
  - Do not touch education, certifications, employer names, job titles or dates.
    Those are returned unchanged.
  - Do not write in the first person or add pronouns.
  - Do not produce more bullets than the original had for a given role.

EVIDENCE

For every rewrite you propose, you must cite the exact original text you
rewrote, verbatim, in the evidence field. A rewrite whose evidence does not
support it will be rejected automatically and discarded. If you cannot support
a rewrite with the original text, do not propose it — return the original.

OUTPUT

Return only the structured object requested. No commentary, no preamble.`

/**
 * The task instruction. Contains no user content — the resume and job posting
 * arrive separately, inside delimiters.
 */
export function buildInstruction(input: {
  /** Requirements the resume genuinely evidences, safe to foreground. */
  evidencedRequirements: readonly string[]
  /** Requirements with no support. Named only so the model knows to avoid them. */
  missingRequirements: readonly string[]
  /** Sections the caller wants rewritten. */
  sections: readonly string[]
  targetTitle: string | null
}): string {
  const lines: string[] = [
    'Rewrite the candidate resume for the target role described in the job posting.',
    '',
  ]

  if (input.targetTitle) {
    lines.push(`Target role: ${input.targetTitle}`, '')
  }

  lines.push('Sections you may rewrite:', ...input.sections.map((section) => `  - ${section}`), '')

  if (input.evidencedRequirements.length > 0) {
    lines.push(
      'The resume already evidences the following. Where a rewrite touches one of',
      "these, prefer the job posting's exact terminology:",
      ...input.evidencedRequirements.slice(0, 40).map((item) => `  - ${item}`),
      '',
    )
  }

  if (input.missingRequirements.length > 0) {
    lines.push(
      'The job posting also asks for the following, and the resume contains NO',
      'evidence of any of them. These are listed so you can be certain to avoid',
      'them. Do not add them, allude to them, or imply the candidate has them:',
      ...input.missingRequirements.slice(0, 40).map((item) => `  - ${item}`),
      '',
    )
  }

  lines.push(
    'For each change you propose, return:',
    '  - the exact path of the element you changed',
    '  - the original text (before)',
    '  - your rewritten text (after)',
    '  - a one-sentence rationale a candidate would understand',
    '  - the verbatim original text that justifies the rewrite (evidence)',
    '',
    'If a bullet is already clear, specific and relevant, leave it alone. Proposing',
    "a change with no benefit wastes the reviewer's attention. It is correct and",
    'expected to return few changes for an already-strong resume.',
  )

  return lines.join('\n')
}
