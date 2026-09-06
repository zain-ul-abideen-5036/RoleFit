import { NextResponse } from 'next/server'
import { z } from 'zod'

import { parseJsonBody, requireUuidParam, route } from '@/server/api/handler'
import { decideChange } from '@/server/services/optimization-service'

export const runtime = 'nodejs'

const decisionSchema = z.object({
  decision: z.enum(['pending', 'accepted', 'rejected', 'edited']),
  editedText: z.string().trim().max(2000).nullable().optional(),
})

/** Records the user's decision on a single proposed change. */
export const PATCH = route<{ id: string }>(async ({ request, params, user }) => {
  const changeId = requireUuidParam(params.id, 'id')
  const input = await parseJsonBody(request, decisionSchema)

  const change = await decideChange(user.userId, changeId, input.decision, input.editedText ?? null)

  return NextResponse.json({
    change: {
      id: change.id,
      decision: change.decision,
      editedText: change.editedText,
      decidedAt: change.decidedAt,
    },
  })
})
