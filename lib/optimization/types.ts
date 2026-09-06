import { z } from 'zod'

import { entryIdSchema, evidenceSchema } from '@/lib/domain/schemas'

/**
 * The before/after change model.
 *
 * Every difference between the original resume and the proposed one is
 * represented as an explicit, reviewable record. Nothing reaches a generated
 * document without a corresponding change the user could have rejected — that
 * is the mechanism behind "no silent major changes".
 */

export const changeActionSchema = z.enum(['added', 'modified', 'removed', 'reordered'])
export const changeDecisionSchema = z.enum(['pending', 'accepted', 'rejected', 'edited'])

export const changeSectionSchema = z.enum([
  'summary',
  'skills',
  'experience',
  'projects',
  'ordering',
])

export const proposedChangeSchema = z.object({
  id: entryIdSchema,
  /** Dotted path into the resume profile this change applies to. */
  targetPath: z.string().min(1).max(200),
  section: changeSectionSchema,
  action: changeActionSchema,
  /** Original text. Null when the change adds a previously absent element. */
  before: z.string().max(2000).nullable(),
  /** Proposed text. Null when the change removes an element. */
  after: z.string().max(2000).nullable(),
  /** Plain-language justification shown next to the diff. */
  rationale: z.string().min(1).max(500),
  /**
   * Spans from the ORIGINAL resume that support the rewritten text. A change
   * with no evidence is rejected by the anti-fabrication validator.
   */
  evidence: z.array(evidenceSchema).max(6).default([]),
  /** Requirement ids this change helps satisfy. Empty is allowed. */
  addressesRequirements: z.array(entryIdSchema).max(20).default([]),
  /** High-impact changes are surfaced first and default to explicit review. */
  impact: z.enum(['high', 'medium', 'low']).default('medium'),
})

export const changeSetSchema = z.object({
  changes: z.array(proposedChangeSchema).max(200),
  /**
   * Requirements the optimizer deliberately did NOT address because the resume
   * contains no supporting evidence. Surfaced verbatim to the user.
   */
  unaddressedRequirements: z
    .array(
      z.object({
        requirementId: entryIdSchema,
        text: z.string().max(400),
        reason: z.string().max(300),
      }),
    )
    .max(100)
    .default([]),
  summary: z.object({
    added: z.number().int().min(0),
    modified: z.number().int().min(0),
    removed: z.number().int().min(0),
    reordered: z.number().int().min(0),
  }),
})

export type ChangeAction = z.infer<typeof changeActionSchema>
export type ChangeDecision = z.infer<typeof changeDecisionSchema>
export type ChangeSection = z.infer<typeof changeSectionSchema>
export type ProposedChange = z.infer<typeof proposedChangeSchema>
export type ChangeSet = z.infer<typeof changeSetSchema>

/** A change joined with the user's decision, as rendered in the review UI. */
export interface ReviewableChange extends ProposedChange {
  decision: ChangeDecision
  /** Set when the user hand-edited the proposed text. */
  editedText: string | null
}

/** The text that should actually be written, given the user's decision. */
export function resolvedText(change: ReviewableChange): string | null {
  switch (change.decision) {
    case 'rejected':
      return change.before
    case 'edited':
      return change.editedText ?? change.after
    case 'accepted':
      return change.after
    case 'pending':
      // Pending changes are not applied. The user must decide explicitly.
      return change.before
  }
}

export function summarizeChanges(changes: readonly ProposedChange[]): ChangeSet['summary'] {
  return {
    added: changes.filter((change) => change.action === 'added').length,
    modified: changes.filter((change) => change.action === 'modified').length,
    removed: changes.filter((change) => change.action === 'removed').length,
    reordered: changes.filter((change) => change.action === 'reordered').length,
  }
}
