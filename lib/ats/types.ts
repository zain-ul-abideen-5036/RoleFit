import { z } from 'zod'

/**
 * ATS readiness checks.
 *
 * Every check here is deterministic and inspectable. The product never claims
 * to reproduce any specific vendor's parser — it reports whether a resume
 * follows the formatting and completeness conventions that ATS parsers in
 * general depend on, and says exactly which convention is at risk.
 */

export const atsCheckStatusSchema = z.enum(['pass', 'warn', 'fail'])

export const atsCheckSchema = z.object({
  id: z.string().max(64),
  label: z.string().max(120),
  /** Which score dimension this check contributes to. */
  group: z.enum(['structure', 'formatting', 'completeness']),
  status: atsCheckStatusSchema,
  /** What was observed, in plain language. */
  detail: z.string().max(400),
  /** What to do about it. Absent when the check passed. */
  recommendation: z.string().max(400).nullable().default(null),
  /** Relative importance within its group. */
  weight: z.number().min(0).max(1),
})

export const atsReportSchema = z.object({
  checks: z.array(atsCheckSchema),
  /** 0-100 per group, derived from the checks above. */
  structureScore: z.number().min(0).max(100),
  formattingScore: z.number().min(0).max(100),
  completenessScore: z.number().min(0).max(100),
  /** Counts for quick display. */
  counts: z.object({
    pass: z.number().int().min(0),
    warn: z.number().int().min(0),
    fail: z.number().int().min(0),
  }),
})

export type AtsCheckStatus = z.infer<typeof atsCheckStatusSchema>
export type AtsCheck = z.infer<typeof atsCheckSchema>
export type AtsReport = z.infer<typeof atsReportSchema>

/**
 * Signals observed while parsing the *source* document that cannot be recovered
 * from the structured profile alone (a profile has no notion of "this PDF had
 * two columns"). Populated by the parser, consumed by the ATS analyzer.
 */
export interface SourceDocumentSignals {
  /** True when the extractor saw text laid out in more than one column. */
  multiColumnSuspected: boolean
  /** Tables detected in the source document. */
  tableCount: number
  /** Embedded images — a resume rendered as an image cannot be parsed at all. */
  imageCount: number
  /** Text characters recovered. Near-zero implies a scanned document. */
  extractedCharacters: number
  /** Pages, when the format reports them. */
  pageCount: number | null
  /** Text boxes / floating frames, where the format exposes them. */
  textBoxCount: number
}

export function emptySourceSignals(): SourceDocumentSignals {
  return {
    multiColumnSuspected: false,
    tableCount: 0,
    imageCount: 0,
    extractedCharacters: 0,
    pageCount: null,
    textBoxCount: 0,
  }
}
