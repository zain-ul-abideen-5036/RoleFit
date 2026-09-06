import type { ChangeRecord } from '@/db/schema'

/**
 * Response shapes shared between routes.
 *
 * Lives outside `app/api` because a Next.js route module may only export HTTP
 * verb handlers and route configuration — anything else fails the build.
 *
 * These functions are also where the wire format is decided. Note what is
 * omitted: internal ids beyond the change id, user ids, and storage keys.
 */

export interface ChangeDto {
  id: string
  targetPath: string
  section: string
  action: string
  before: string | null
  after: string | null
  rationale: string
  evidence: string[]
  decision: string
  editedText: string | null
}

export function toChangeDto(change: ChangeRecord): ChangeDto {
  return {
    id: change.id,
    targetPath: change.targetPath,
    section: change.section,
    action: change.action,
    before: change.beforeText,
    after: change.afterText,
    rationale: change.rationale,
    evidence: change.evidence,
    decision: change.decision,
    editedText: change.editedText,
  }
}
