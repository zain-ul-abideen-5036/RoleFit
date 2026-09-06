import { z } from 'zod'

import { requirementSchema } from '@/lib/domain/schemas'

/**
 * Schemas for model output.
 *
 * These are deliberately narrower than the domain model. The model is given the
 * smallest surface that lets it do its job, because every field it can write is
 * a field it can get wrong.
 *
 * Note what is absent: the model never supplies the "before" text of a change.
 * The application looks that up by path from its own copy of the resume, so a
 * model cannot misrepresent what the original said in order to make a rewrite
 * look justified.
 */

/** Verbatim source text supporting a rewrite. Checked, not trusted. */
const evidenceQuoteSchema = z
  .string()
  .trim()
  .min(3, 'Evidence must quote the original text')
  .max(1000)

export const bulletRewriteSchema = z.object({
  /**
   * Dotted path of the bullet being rewritten, e.g.
   * `experience.exp-1.bullets.2`. Paths not present in the resume are dropped.
   */
  path: z.string().min(1).max(200),
  /** The rewritten bullet. */
  after: z.string().trim().min(10).max(600),
  /** One sentence, in plain language, a candidate would understand. */
  rationale: z.string().trim().min(5).max(300),
  /**
   * Verbatim spans from the ORIGINAL resume that justify the rewrite. Every
   * factual claim in `after` must be supported by these plus the original text
   * at `path`.
   */
  evidence: z.array(evidenceQuoteSchema).min(1).max(4),
  /** Requirement ids this rewrite helps evidence. May be empty. */
  addressesRequirements: z.array(z.string().max(64)).max(10).default([]),
})

export const summaryRewriteSchema = z.object({
  after: z.string().trim().min(20).max(1200),
  rationale: z.string().trim().min(5).max(300),
  evidence: z.array(evidenceQuoteSchema).min(1).max(6),
})

export const optimizationProposalSchema = z.object({
  /** Null when the existing summary is already appropriate, or none exists. */
  summary: summaryRewriteSchema.nullable().default(null),
  bulletRewrites: z.array(bulletRewriteSchema).max(60).default([]),
  /**
   * Skill items reordered by relevance to the role. Must be a permutation of
   * the skills already on the resume; anything new is discarded.
   */
  skillOrder: z
    .array(
      z.object({
        groupId: z.string().max(64),
        items: z.array(z.string().max(80)).max(80),
      }),
    )
    .max(12)
    .default([]),
  /**
   * Experience and project entry ids in the order the model believes is most
   * relevant. Must be a permutation of the existing ids.
   */
  experienceOrder: z.array(z.string().max(64)).max(25).default([]),
  projectOrder: z.array(z.string().max(64)).max(25).default([]),
  /**
   * Requirements the model deliberately did not address because the resume
   * has no supporting evidence. Surfaced to the user verbatim.
   */
  unaddressed: z
    .array(
      z.object({
        requirementId: z.string().max(64),
        reason: z.string().trim().min(3).max(300),
      }),
    )
    .max(60)
    .default([]),
})

export type OptimizationProposal = z.infer<typeof optimizationProposalSchema>
export type BulletRewrite = z.infer<typeof bulletRewriteSchema>
export type SummaryRewrite = z.infer<typeof summaryRewriteSchema>

/* ==========================================================================
   Job description enrichment
   ========================================================================== */

/**
 * Additional requirements the deterministic parser missed. The model may only
 * add; the parser's output is authoritative for everything it already found.
 */
export const jobEnrichmentSchema = z.object({
  title: z.string().trim().max(200).nullable().default(null),
  company: z.string().trim().max(200).nullable().default(null),
  location: z.string().trim().max(160).nullable().default(null),
  employmentType: z.string().trim().max(80).nullable().default(null),
  additionalRequirements: z
    .array(
      requirementSchema.omit({ id: true }).extend({
        text: z.string().trim().min(3).max(400),
      }),
    )
    .max(60)
    .default([]),
  additionalKeywords: z.array(z.string().trim().min(2).max(80)).max(40).default([]),
  minYearsExperience: z.number().min(0).max(50).nullable().default(null),
})

export type JobEnrichment = z.infer<typeof jobEnrichmentSchema>

/**
 * Produces a compact JSON Schema for a Zod object, for providers that accept
 * tool/function schemas.
 *
 * Only the subset the schemas above actually use is supported; anything
 * unrecognised degrades to an unconstrained value rather than throwing, since
 * the authoritative validation is the Zod parse on the way back.
 */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def as { typeName?: string } & Record<string, unknown>

  switch (def.typeName) {
    case 'ZodObject': {
      const shape = (schema as unknown as z.ZodObject<z.ZodRawShape>).shape
      const properties: Record<string, unknown> = {}
      const required: string[] = []

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = toJsonSchema(value as z.ZodTypeAny)
        if (!(value as z.ZodTypeAny).isOptional()) required.push(key)
      }

      return {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
      }
    }

    case 'ZodArray': {
      const inner = (def as { type: z.ZodTypeAny }).type
      return {
        type: 'array',
        items: toJsonSchema(inner),
        ...(typeof (def as { maxLength?: { value: number } }).maxLength?.value === 'number'
          ? { maxItems: (def as { maxLength: { value: number } }).maxLength.value }
          : {}),
      }
    }

    case 'ZodString': {
      return { type: 'string' }
    }

    case 'ZodNumber':
      return { type: 'number' }

    case 'ZodBoolean':
      return { type: 'boolean' }

    case 'ZodEnum':
      return { type: 'string', enum: (def as { values: string[] }).values }

    case 'ZodNullable':
      return {
        anyOf: [toJsonSchema((def as { innerType: z.ZodTypeAny }).innerType), { type: 'null' }],
      }

    case 'ZodOptional':
    case 'ZodDefault':
      return toJsonSchema((def as { innerType: z.ZodTypeAny }).innerType)

    default:
      return {}
  }
}
