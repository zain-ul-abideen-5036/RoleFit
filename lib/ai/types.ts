import type { z } from 'zod'

/**
 * The AI provider contract.
 *
 * Everything above this interface is provider-agnostic. Swapping Anthropic for
 * OpenAI — or for the offline deterministic engine — is an environment variable,
 * not a code change. Two rules are enforced at this boundary:
 *
 *  1. Callers ask for *structured* output against a Zod schema. There is no
 *     "give me some text" method, because unvalidated model output must never
 *     reach the database or a generated document.
 *  2. Untrusted document content is passed separately from instructions, so a
 *     provider implementation can wrap it in whatever isolation its API offers.
 */

export type AiProviderName = 'deterministic' | 'anthropic' | 'openai'

/** A block of untrusted, user-supplied content handed to the model as data. */
export interface UntrustedDocument {
  /** Stable identifier used in the delimiter, e.g. `RESUME` or `JOB_DESCRIPTION`. */
  id: string
  /** What this document is, for the model's benefit. */
  description: string
  content: string
}

export interface StructuredRequest<TSchema extends z.ZodTypeAny> {
  /** Which versioned prompt this request uses. Recorded on the run for audit. */
  promptId: string
  promptVersion: string
  /** Authoritative instructions. Never contains user content. */
  system: string
  /** The task, in the operator's voice. Never contains raw user content. */
  instruction: string
  /** User-supplied content, isolated from the instructions above. */
  documents: readonly UntrustedDocument[]
  /** The shape the response must take. */
  schema: TSchema
  /** Name of the output type, used by providers that support tool schemas. */
  schemaName: string
  maxOutputTokens?: number
  /** 0 for reproducibility-sensitive tasks. */
  temperature?: number
}

export interface StructuredResponse<TOutput> {
  data: TOutput
  usage: {
    inputTokens: number | null
    outputTokens: number | null
  }
  /** How many schema-repair attempts were needed. 0 on a clean first response. */
  repairAttempts: number
  provider: AiProviderName
  model: string | null
}

export interface AiProvider {
  readonly name: AiProviderName
  readonly model: string | null

  /**
   * Produces a value matching `request.schema`.
   * Throws `AppError(AI_INVALID_OUTPUT)` if a valid response cannot be obtained,
   * and `AppError(AI_UNAVAILABLE)` on transport failure. It never returns
   * partially-valid data.
   */
  generateStructured<TSchema extends z.ZodTypeAny>(
    request: StructuredRequest<TSchema>,
  ): Promise<StructuredResponse<z.infer<TSchema>>>
}

/** Capability flags so callers can degrade gracefully. */
export interface AiCapabilities {
  /** False for the deterministic engine, which cannot rewrite free text. */
  canRewriteProse: boolean
  /** Whether calls leave the machine. Drives the privacy notice in the UI. */
  sendsDataToThirdParty: boolean
}

export function capabilitiesFor(provider: AiProviderName): AiCapabilities {
  return provider === 'deterministic'
    ? { canRewriteProse: false, sendsDataToThirdParty: false }
    : { canRewriteProse: true, sendsDataToThirdParty: true }
}
