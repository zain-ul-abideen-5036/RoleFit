import type { OptimizationProposal } from '@/lib/ai/schemas'
import type { RequirementMatch, ResumeProfile } from '@/lib/domain/types'
import {
  buildSourceIndex,
  checkForFabrication,
  verifyEvidenceQuotes,
  type FabricationFinding,
  type SourceIndex,
} from '@/lib/optimization/anti-fabrication'
import {
  summarizeChanges,
  type ChangeSet,
  type ProposedChange,
  type ReviewableChange,
} from '@/lib/optimization/types'

/**
 * Turns a raw optimization proposal into a validated, reviewable change set.
 *
 * Every proposal — whether it came from a language model or from the rule-based
 * engine — passes through here, and every change is checked against the source
 * resume before it is allowed to exist. A change that cannot be justified is
 * discarded, not surfaced with a warning: the user should never be asked to
 * adjudicate whether the product just invented their work history.
 */

export interface RejectedChange {
  path: string
  reason: 'unknown_path' | 'unverified_evidence' | 'fabrication' | 'not_a_permutation' | 'no_change'
  findings?: FabricationFinding[]
  detail: string
}

export interface ValidationOutcome {
  changeSet: ChangeSet
  proposedProfile: ResumeProfile
  rejected: RejectedChange[]
}

/* ==========================================================================
   Path resolution
   ========================================================================== */

type ResolvedPath =
  | { kind: 'summary' }
  | { kind: 'experienceBullet'; entryId: string; index: number }
  | { kind: 'projectBullet'; entryId: string; index: number }

function parsePath(path: string): ResolvedPath | null {
  if (path === 'summary') return { kind: 'summary' }

  const match = /^(experience|projects)\.([A-Za-z0-9_-]+)\.bullets\.(\d+)$/.exec(path)
  if (!match) return null

  const [, section, entryId, indexText] = match
  const index = Number.parseInt(indexText!, 10)
  if (!Number.isInteger(index) || index < 0) return null

  return section === 'experience'
    ? { kind: 'experienceBullet', entryId: entryId!, index }
    : { kind: 'projectBullet', entryId: entryId!, index }
}

/** Reads the current text at a path, or null when the path does not exist. */
function readAtPath(profile: ResumeProfile, resolved: ResolvedPath): string | null {
  switch (resolved.kind) {
    case 'summary':
      return profile.summary
    case 'experienceBullet': {
      const entry = profile.experience.find((item) => item.id === resolved.entryId)
      return entry?.bullets[resolved.index] ?? null
    }
    case 'projectBullet': {
      const entry = profile.projects.find((item) => item.id === resolved.entryId)
      return entry?.bullets[resolved.index] ?? null
    }
  }
}

function writeAtPath(profile: ResumeProfile, resolved: ResolvedPath, value: string): void {
  switch (resolved.kind) {
    case 'summary':
      profile.summary = value
      return
    case 'experienceBullet': {
      const entry = profile.experience.find((item) => item.id === resolved.entryId)
      if (entry && resolved.index < entry.bullets.length) entry.bullets[resolved.index] = value
      return
    }
    case 'projectBullet': {
      const entry = profile.projects.find((item) => item.id === resolved.entryId)
      if (entry && resolved.index < entry.bullets.length) entry.bullets[resolved.index] = value
      return
    }
  }
}

/* ==========================================================================
   Validation
   ========================================================================== */

let changeCounter = 0
function nextChangeId(): string {
  changeCounter += 1
  return `chg-${changeCounter}`
}

/** Whether `candidate` is a permutation of `original` (same items, any order). */
function isPermutation(original: readonly string[], candidate: readonly string[]): boolean {
  if (original.length !== candidate.length) return false
  const counts = new Map<string, number>()
  for (const item of original) counts.set(item, (counts.get(item) ?? 0) + 1)
  for (const item of candidate) {
    const count = counts.get(item)
    if (count === undefined || count === 0) return false
    counts.set(item, count - 1)
  }
  return true
}

function impactOf(before: string, after: string): ProposedChange['impact'] {
  // A change that alters most of the sentence deserves explicit review; one
  // that swaps a single term does not.
  const longer = Math.max(before.length, after.length)
  if (longer === 0) return 'low'
  const delta = Math.abs(before.length - after.length) / longer
  const wordsChanged = after.split(/\s+/).filter((word) => !before.includes(word)).length
  if (delta > 0.35 || wordsChanged > 6) return 'high'
  if (wordsChanged > 2) return 'medium'
  return 'low'
}

interface ValidateTextChangeInput {
  path: string
  section: ProposedChange['section']
  after: string
  rationale: string
  evidence: readonly string[]
  addressesRequirements: readonly string[]
  original: ResumeProfile
  index: SourceIndex
}

function validateTextChange(
  input: ValidateTextChangeInput,
): { change: ProposedChange } | { rejected: RejectedChange } {
  const resolved = parsePath(input.path)
  if (!resolved) {
    return {
      rejected: {
        path: input.path,
        reason: 'unknown_path',
        detail: 'The proposal referenced a location that does not exist in this resume.',
      },
    }
  }

  const before = readAtPath(input.original, resolved)
  if (before === null) {
    return {
      rejected: {
        path: input.path,
        reason: 'unknown_path',
        detail: 'The proposal referenced a bullet that does not exist in this resume.',
      },
    }
  }

  const after = input.after.trim()
  if (after === before.trim()) {
    return {
      rejected: { path: input.path, reason: 'no_change', detail: 'The rewrite was identical.' },
    }
  }

  // The model must quote real source text. A fabricated quote is itself a
  // signal that the rewrite is not grounded.
  const evidenceCheck = verifyEvidenceQuotes(input.evidence, input.index)
  if (!evidenceCheck.ok) {
    return {
      rejected: {
        path: input.path,
        reason: 'unverified_evidence',
        detail: `${evidenceCheck.unverified.length} cited quote(s) do not appear in the original resume.`,
      },
    }
  }

  const fabrication = checkForFabrication(after, input.index, {
    originalText: before,
    citedEvidence: input.evidence,
  })
  if (!fabrication.ok) {
    return {
      rejected: {
        path: input.path,
        reason: 'fabrication',
        findings: fabrication.findings,
        detail: fabrication.findings.map((finding) => finding.detail).join(' '),
      },
    }
  }

  return {
    change: {
      id: nextChangeId(),
      targetPath: input.path,
      section: input.section,
      action: 'modified',
      before,
      after,
      rationale: input.rationale,
      evidence: input.evidence.map((quote) => ({
        path: input.path,
        section:
          input.section === 'summary'
            ? 'summary'
            : input.section === 'projects'
              ? 'projects'
              : 'experience',
        excerpt: quote,
      })),
      addressesRequirements: [...input.addressesRequirements],
      impact: impactOf(before, after),
      orderedItems: null,
    },
  }
}

export interface ValidateProposalInput {
  original: ResumeProfile
  proposal: OptimizationProposal
  matches: readonly RequirementMatch[]
}

/**
 * Validates a proposal and produces the change set plus a preview profile.
 *
 * `proposedProfile` is the resume as it would look with every proposed change
 * accepted — a preview, not a commitment. The document the user actually
 * downloads is always rebuilt by `applyDecisions` from the original plus the
 * decisions they made, so a rejected change (reorder included) leaves no trace.
 */
export function validateAndApplyProposal(input: ValidateProposalInput): ValidationOutcome {
  changeCounter = 0

  const { original, proposal, matches } = input
  const index = buildSourceIndex(original)

  const changes: ProposedChange[] = []
  const rejected: RejectedChange[] = []

  /* ---------------------------------------------------------- text changes */
  if (proposal.summary) {
    const outcome = validateTextChange({
      path: 'summary',
      section: 'summary',
      after: proposal.summary.after,
      rationale: proposal.summary.rationale,
      evidence: proposal.summary.evidence,
      addressesRequirements: [],
      original,
      index,
    })
    if ('change' in outcome) changes.push(outcome.change)
    else rejected.push(outcome.rejected)
  }

  for (const rewrite of proposal.bulletRewrites) {
    const outcome = validateTextChange({
      path: rewrite.path,
      section: rewrite.path.startsWith('projects.') ? 'projects' : 'experience',
      after: rewrite.after,
      rationale: rewrite.rationale,
      evidence: rewrite.evidence,
      addressesRequirements: rewrite.addressesRequirements,
      original,
      index,
    })
    if ('change' in outcome) changes.push(outcome.change)
    else rejected.push(outcome.rejected)
  }

  /* ----------------------------------------------------------- reordering */
  for (const group of proposal.skillOrder) {
    const sourceGroup = original.skills.find((entry) => entry.id === group.groupId)
    if (!sourceGroup) {
      rejected.push({
        path: `skills.${group.groupId}`,
        reason: 'unknown_path',
        detail: 'The proposal reordered a skill group that does not exist.',
      })
      continue
    }
    if (!isPermutation(sourceGroup.items, group.items)) {
      rejected.push({
        path: `skills.${group.groupId}`,
        reason: 'not_a_permutation',
        detail: 'The proposed skill order added or removed skills rather than reordering them.',
      })
      continue
    }
    if (sourceGroup.items.join(' ') === group.items.join(' ')) continue

    changes.push({
      id: nextChangeId(),
      targetPath: `skills.${group.groupId}.items`,
      section: 'skills',
      action: 'reordered',
      before: sourceGroup.items.join(', '),
      after: group.items.join(', '),
      rationale: 'Reordered so the skills this role asks for appear first.',
      evidence: [],
      addressesRequirements: [],
      impact: 'low',
      orderedItems: [...group.items],
    })
  }

  const applyEntryOrder = (
    kind: 'experience' | 'projects',
    proposedOrder: readonly string[],
  ): void => {
    if (proposedOrder.length === 0) return

    const sourceIds = (kind === 'experience' ? original.experience : original.projects).map(
      (entry) => entry.id,
    )
    if (!isPermutation(sourceIds, proposedOrder)) {
      rejected.push({
        path: kind,
        reason: 'not_a_permutation',
        detail: `The proposed ${kind} order added or removed entries rather than reordering them.`,
      })
      return
    }
    if (sourceIds.join(' ') === proposedOrder.join(' ')) return

    const byId = new Map(
      (kind === 'experience' ? proposedProfile.experience : proposedProfile.projects).map(
        (entry) => [entry.id, entry] as const,
      ),
    )
    const reordered = proposedOrder.map((id) => byId.get(id)!).filter(Boolean)

    if (kind === 'experience')
      proposedProfile.experience = reordered as typeof proposedProfile.experience
    else proposedProfile.projects = reordered as typeof proposedProfile.projects

    changes.push({
      id: nextChangeId(),
      targetPath: kind,
      section: 'ordering',
      action: 'reordered',
      before: sourceIds.join(' → '),
      after: proposedOrder.join(' → '),
      rationale: `Reordered ${kind} so the most relevant appear first.`,
      evidence: [],
      addressesRequirements: [],
      impact: 'medium',
      orderedItems: [...proposedOrder],
    })
  }

  applyEntryOrder('experience', proposal.experienceOrder)
  applyEntryOrder('projects', proposal.projectOrder)

  /* --------------------------------------------------------- unaddressed */
  const matchById = new Map(matches.map((match) => [match.requirementId, match] as const))
  const unaddressedRequirements = proposal.unaddressed
    .filter((entry) => matchById.has(entry.requirementId))
    .map((entry) => ({
      requirementId: entry.requirementId,
      text: matchById.get(entry.requirementId)!.text,
      reason: entry.reason,
    }))

  // Every missing requirement is reported, whether or not the proposal
  // mentioned it. The user must see the full gap list, not the model's summary.
  for (const match of matches) {
    if (match.status !== 'missing') continue
    if (unaddressedRequirements.some((entry) => entry.requirementId === match.requirementId))
      continue
    unaddressedRequirements.push({
      requirementId: match.requirementId,
      text: match.text,
      reason: 'Your resume contains no evidence for this, so it was not added.',
    })
  }

  // The preview is produced through exactly the same code path the final
  // document uses, so what the user reviews is what they get.
  const proposedProfile = applyDecisions(
    original,
    changes.map((change) => ({ ...change, decision: 'accepted' as const, editedText: null })),
  )

  return {
    changeSet: {
      changes,
      unaddressedRequirements,
      summary: summarizeChanges(changes),
    },
    proposedProfile,
    rejected,
  }
}

/**
 * Produces the final resume from the user's decisions.
 *
 * Pending changes are treated as rejected: nothing the user has not explicitly
 * accepted is written into their document.
 */
export function applyDecisions(
  baseProfile: ResumeProfile,
  changes: readonly ReviewableChange[],
): ResumeProfile {
  const result: ResumeProfile = structuredClone(baseProfile)

  for (const change of changes) {
    if (change.decision !== 'accepted' && change.decision !== 'edited') continue

    if (change.action === 'reordered') {
      applyReorder(result, change)
      continue
    }

    const resolved = parsePath(change.targetPath)
    if (!resolved) continue

    const text = change.decision === 'edited' ? (change.editedText ?? change.after) : change.after
    if (text === null) continue

    writeAtPath(result, resolved, text)
  }

  return result
}

/**
 * Applies an accepted reorder.
 *
 * Reordering is validated as a permutation at proposal time, and re-checked
 * here: a stored change set could have been written before the resume was
 * edited, and applying a stale order must never drop or duplicate an entry.
 */
function applyReorder(profile: ResumeProfile, change: ReviewableChange): void {
  const order = change.orderedItems
  if (!order || order.length === 0) return

  if (change.targetPath === 'experience') {
    const byId = new Map(profile.experience.map((entry) => [entry.id, entry] as const))
    if (!isPermutation([...byId.keys()], order)) return
    profile.experience = order.map((id) => byId.get(id)!).filter(Boolean)
    return
  }

  if (change.targetPath === 'projects') {
    const byId = new Map(profile.projects.map((entry) => [entry.id, entry] as const))
    if (!isPermutation([...byId.keys()], order)) return
    profile.projects = order.map((id) => byId.get(id)!).filter(Boolean)
    return
  }

  const skillMatch = /^skills\.([A-Za-z0-9_-]+)\.items$/.exec(change.targetPath)
  if (skillMatch) {
    const group = profile.skills.find((entry) => entry.id === skillMatch[1])
    if (!group || !isPermutation(group.items, order)) return
    group.items = [...order]
  }
}

export const __testing = { parsePath, readAtPath, isPermutation, impactOf }
