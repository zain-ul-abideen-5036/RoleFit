import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ChangeReview,
  type ChangeReviewProps,
  type ReviewChange,
} from '@/components/app/change-review'

/**
 * Change review.
 *
 * The screen where the product's central promise is kept, so these tests are
 * about that promise rather than about layout: the original is always visible
 * beside the rewrite, the reason is stated, the evidence is quoted, nothing is
 * applied without a decision, and every decision is reversible.
 */

const { push, refresh, apiPatch, apiPost } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}))

vi.mock('@/lib/client/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/client/api')>()
  return { ...actual, apiPatch, apiPost }
})

const BEFORE = 'Built the payments service on Node and PostgreSQL'
const AFTER = 'Built and operated the payments service on Node.js and PostgreSQL'

function change(overrides: Partial<ReviewChange> = {}): ReviewChange {
  return {
    id: 'chg-1',
    targetPath: 'experience.exp-1.bullets.0',
    section: 'experience',
    action: 'modified',
    before: BEFORE,
    after: AFTER,
    rationale: 'Aligns terminology with the posting.',
    // Deliberately not identical to `before`: the two are rendered separately
    // and a shared string would make an assertion ambiguous.
    evidence: ['Shipped the payments service end to end'],
    decision: 'pending',
    editedText: null,
    ...overrides,
  }
}

function props(overrides: Partial<ChangeReviewProps> = {}): ChangeReviewProps {
  return {
    runId: 'run-1',
    resumeId: 'resume-1',
    changes: [change()],
    unaddressed: [],
    baselineScore: 61,
    projectedScore: 74,
    provider: 'deterministic',
    canRewriteProse: false,
    ...overrides,
  }
}

beforeEach(() => {
  apiPatch.mockResolvedValue({})
  apiPost.mockResolvedValue({
    document: { id: 'doc-1', filename: 'resume.pdf', downloadUrl: '/download' },
    warnings: [],
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('nothing is hidden', () => {
  it('shows the original alongside the rewrite', () => {
    // A rewrite shown without its original asks the user to trust it.
    render(<ChangeReview {...props()} />)

    expect(screen.getByText(BEFORE)).toBeInTheDocument()
    expect(screen.getByText(AFTER)).toBeInTheDocument()
  })

  it('states why the change was proposed', () => {
    render(<ChangeReview {...props()} />)
    expect(screen.getByText('Aligns terminology with the posting.')).toBeInTheDocument()
  })

  it('quotes the evidence the change rests on', () => {
    render(
      <ChangeReview
        {...props({
          changes: [change({ evidence: ['Shipped the orders service end to end'] })],
        })}
      />,
    )

    expect(screen.getByText(/Shipped the orders service end to end/)).toBeInTheDocument()
  })

  it('labels what kind of change it is', () => {
    render(<ChangeReview {...props()} />)
    expect(screen.getByText('Rewritten')).toBeInTheDocument()
  })

  it('shows the score change with its disclaimer', () => {
    // The projected number never appears without the caveat.
    render(<ChangeReview {...props()} />)

    expect(screen.getByText('61')).toBeInTheDocument()
    expect(screen.getByText('74')).toBeInTheDocument()
    expect(screen.getByText(/estimates compatibility/i)).toBeInTheDocument()
  })
})

describe('deciding on a change', () => {
  it('accepts one, and tells the server', async () => {
    render(<ChangeReview {...props()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))

    expect(apiPatch).toHaveBeenCalledWith(
      '/api/changes/chg-1',
      expect.objectContaining({ decision: 'accepted' }),
    )
  })

  it('rejects one, and tells the server', async () => {
    render(<ChangeReview {...props()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))

    expect(apiPatch).toHaveBeenCalledWith(
      '/api/changes/chg-1',
      expect.objectContaining({ decision: 'rejected' }),
    )
  })

  it('shows the decision back to the user', async () => {
    render(<ChangeReview {...props()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(await screen.findByText('Accepted')).toBeInTheDocument()
  })

  it('offers an undo once a decision is made', async () => {
    // Every decision is reversible until export. A one-way accept would make
    // the review screen a trap.
    render(<ChangeReview {...props()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('returns a change to pending on undo', async () => {
    render(<ChangeReview {...props()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))

    expect(apiPatch).toHaveBeenLastCalledWith(
      '/api/changes/chg-1',
      expect.objectContaining({ decision: 'pending' }),
    )
  })

  it('surfaces a failed decision rather than pretending it saved', async () => {
    apiPatch.mockRejectedValue(new Error('network down'))
    render(<ChangeReview {...props()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))

    // Showing "Accepted" on a failed write would tell the user their document
    // contains something it does not.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('editing a change', () => {
  it('lets the user write their own wording', async () => {
    render(<ChangeReview {...props()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const textarea = screen.getByRole('textbox')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'My own version of this bullet')

    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(apiPatch).toHaveBeenCalledWith(
      '/api/changes/chg-1',
      expect.objectContaining({ decision: 'edited', editedText: 'My own version of this bullet' }),
    )
  })

  it('pre-fills the editor with the proposal, not an empty box', async () => {
    render(<ChangeReview {...props()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('textbox')).toHaveValue(AFTER)
  })

  it('abandons an edit without saving it', async () => {
    render(<ChangeReview {...props()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(apiPatch).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('bulk decisions', () => {
  it('accepts every pending change at once', async () => {
    render(
      <ChangeReview
        {...props({ changes: [change({ id: 'a' }), change({ id: 'b' }), change({ id: 'c' })] })}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /Accept all pending/ }))

    expect(apiPatch).toHaveBeenCalledTimes(3)
  })

  it('leaves an already-decided change alone', async () => {
    render(
      <ChangeReview
        {...props({
          changes: [change({ id: 'a' }), change({ id: 'b', decision: 'rejected' })],
        })}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /Accept all pending/ }))

    // "All pending" must not silently overturn a decision the user made.
    expect(apiPatch).toHaveBeenCalledTimes(1)
    expect(apiPatch).toHaveBeenCalledWith('/api/changes/a', expect.anything())
  })
})

describe('what the optimizer could not do', () => {
  it('lists requirements it did not address, with the reason', () => {
    // The honest half of the screen. A gap the optimizer refused to invent
    // experience for has to be visible, or the user assumes it was handled.
    render(
      <ChangeReview
        {...props({
          unaddressed: [
            {
              requirementId: 'req-1',
              text: 'Kubernetes',
              reason: 'No evidence of this on your resume.',
            },
          ],
        })}
      />,
    )

    expect(screen.getByText('Kubernetes')).toBeInTheDocument()
    expect(screen.getByText('No evidence of this on your resume.')).toBeInTheDocument()
  })

  it('says which engine produced the result', () => {
    render(<ChangeReview {...props({ provider: 'deterministic', canRewriteProse: false })} />)
    expect(screen.getByText(/deterministic/i)).toBeInTheDocument()
  })
})

describe('no changes at all', () => {
  it('says so rather than rendering an empty list', () => {
    render(<ChangeReview {...props({ changes: [] })} />)

    // An optimization that proposed nothing is a real outcome and has to read
    // as such rather than as a failure — but it must also say which outcome it
    // was, which is what `describeNoChanges` decides. The default props use the
    // rule-based engine.
    expect(screen.getByText(/found nothing it could change/i)).toBeInTheDocument()
  })

  it('offers no bulk controls with nothing to decide', () => {
    render(<ChangeReview {...props({ changes: [] })} />)
    expect(screen.queryByRole('button', { name: /Accept all pending/ })).not.toBeInTheDocument()
  })
})

describe('exporting', () => {
  it('requests a PDF', async () => {
    render(<ChangeReview {...props()} />)

    const bar = screen.getByRole('button', { name: /PDF/ })
    await userEvent.click(bar)

    expect(apiPost).toHaveBeenCalledWith(
      '/api/documents',
      expect.objectContaining({ format: 'pdf' }),
    )
  })

  it('requests a DOCX', async () => {
    render(<ChangeReview {...props()} />)

    await userEvent.click(screen.getByRole('button', { name: /DOCX/ }))

    expect(apiPost).toHaveBeenCalledWith(
      '/api/documents',
      expect.objectContaining({ format: 'docx' }),
    )
  })

  it('surfaces generator warnings rather than swallowing them', async () => {
    apiPost.mockResolvedValue({
      document: { id: 'doc-1', filename: 'resume.pdf', downloadUrl: '/download' },
      warnings: ['A long URL was wrapped to fit the page.'],
    })

    render(<ChangeReview {...props()} />)
    await userEvent.click(screen.getByRole('button', { name: /PDF/ }))

    expect(await screen.findByText(/A long URL was wrapped/)).toBeInTheDocument()
  })

  it('reports a failed export', async () => {
    apiPost.mockRejectedValue(new Error('storage unavailable'))

    render(<ChangeReview {...props()} />)
    await userEvent.click(screen.getByRole('button', { name: /PDF/ }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('a removal', () => {
  it('shows the original with no replacement text', () => {
    render(
      <ChangeReview
        {...props({
          changes: [
            change({ action: 'removed', after: null, rationale: 'Filler with no content.' }),
          ],
        })}
      />,
    )

    expect(screen.getByText('Removed')).toBeInTheDocument()
    expect(screen.getByText(BEFORE)).toBeInTheDocument()
  })
})

describe('an addition', () => {
  it('shows the new text with no original', () => {
    render(
      <ChangeReview
        {...props({
          changes: [
            change({
              action: 'added',
              before: null,
              after: 'Reordered skills to lead with Python.',
            }),
          ],
        })}
      />,
    )

    const list = screen.getByText('Added').closest('li') ?? document.body
    expect(within(list).getByText('Reordered skills to lead with Python.')).toBeInTheDocument()
  })
})

describe('an empty result explains itself', () => {
  /**
   * The reported bug: a resume scoring 36 produced no changes, and the screen
   * answered "Your resume already reads clearly for this role" beneath a green
   * tick — while listing, directly below, the requirements it had just declined
   * to address. The reader's reasonable conclusion was that optimization was
   * broken.
   */

  it('does not congratulate a resume that scored badly', () => {
    render(<ChangeReview {...props({ changes: [], baselineScore: 36, canRewriteProse: false })} />)

    expect(screen.queryByText(/already reads clearly/i)).not.toBeInTheDocument()
  })

  it('names the engine as the reason when it cannot rewrite prose', () => {
    render(<ChangeReview {...props({ changes: [], baselineScore: 36, canRewriteProse: false })} />)

    expect(screen.getByText(/rule-based engine found nothing/i)).toBeInTheDocument()
    expect(screen.getByText(/does not rewrite sentences/i)).toBeInTheDocument()
  })

  it('ties the empty result to the unaddressed requirements', () => {
    // The two were presented as unrelated, which is what made the screen read
    // as self-contradictory.
    render(
      <ChangeReview
        {...props({
          changes: [],
          baselineScore: 36,
          canRewriteProse: false,
          unaddressed: [
            { requirementId: 'r1', text: 'Kubernetes in production', reason: 'No evidence' },
            { requirementId: 'r2', text: 'Terraform', reason: 'No evidence' },
          ],
        })}
      />,
    )

    expect(screen.getByText(/cannot act on the 2 requirements below/i)).toBeInTheDocument()
  })

  it('says the gap needs real experience when a real provider found nothing', () => {
    render(
      <ChangeReview
        {...props({
          changes: [],
          baselineScore: 36,
          canRewriteProse: true,
          provider: 'anthropic',
          unaddressed: [
            { requirementId: 'r1', text: 'Kubernetes in production', reason: 'No evidence' },
          ],
        })}
      />,
    )

    expect(screen.getByText(/adding real experience rather than rewording/i)).toBeInTheDocument()
  })

  it('still congratulates a genuinely strong match', () => {
    // The original copy was not wrong, only unconditional. This is the case it
    // was written for.
    render(
      <ChangeReview
        {...props({
          changes: [],
          baselineScore: 88,
          canRewriteProse: true,
          provider: 'anthropic',
          unaddressed: [],
        })}
      />,
    )

    expect(screen.getByText(/No changes were needed/i)).toBeInTheDocument()
    expect(screen.getByText(/already reads clearly/i)).toBeInTheDocument()
  })
})
