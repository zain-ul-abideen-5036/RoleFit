import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/button'
import { Alert, ChangeBadge, EmptyState, MatchBadge } from '@/components/ui/feedback'

/**
 * Buttons and status presentation.
 *
 * The recurring theme is that meaning must not be carried by colour alone. A
 * badge whose only signal is a red tint says nothing to a colour-blind user and
 * nothing at all to a screen reader, so every status here is asserted to carry
 * a text label.
 */

describe('Button', () => {
  it('renders its label and responds to a click', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Optimize</Button>)

    await userEvent.click(screen.getByRole('button', { name: 'Optimize' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disables itself while loading, so one click cannot become two', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Optimize
      </Button>,
    )

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()

    await userEvent.click(button, { pointerEventsCheck: 0 })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('announces that it is busy', () => {
    render(<Button loading>Optimize</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })

  it('swaps in the loading label so the state is readable, not just spinning', () => {
    // A spinner is invisible to a screen reader. The accessible name has to
    // change too, or the button still claims to say "Optimize".
    render(
      <Button loading loadingLabel="Optimizing…">
        Optimize
      </Button>,
    )

    expect(screen.getByRole('button')).toHaveAccessibleName('Optimizing…')
  })

  it('keeps the original label when no loading label is given', () => {
    render(<Button loading>Optimize</Button>)
    expect(screen.getByRole('button')).toHaveAccessibleName('Optimize')
  })

  it('is not busy when idle', () => {
    render(<Button>Optimize</Button>)
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy')
  })

  it('stays disabled when explicitly disabled and not loading', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Optimize
      </Button>,
    )

    expect(screen.getByRole('button')).toBeDisabled()
    await userEvent.click(screen.getByRole('button'), { pointerEventsCheck: 0 })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders a foreign element with asChild, without injecting a spinner', () => {
    // Slot takes exactly one child; a spinner would break that contract.
    render(
      <Button asChild>
        <a href="/dashboard">Go to dashboard</a>
      </Button>,
    )

    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    )
  })

  it('is reachable and activatable by keyboard', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Optimize</Button>)

    await userEvent.tab()
    expect(screen.getByRole('button')).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalled()
  })
})

describe('MatchBadge', () => {
  it.each([
    ['strong', 'Strong match'],
    ['partial', 'Partial evidence'],
    ['missing', 'Missing / not verified'],
  ] as const)('labels %s in words, not only in colour', (status, label) => {
    render(<MatchBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('says "Missing / not verified" rather than just "Missing"', () => {
    // The product's language for a gap: it is not asserting the candidate
    // lacks the skill, only that the resume does not evidence it.
    render(<MatchBadge status="missing" />)
    expect(screen.getByText('Missing / not verified')).toBeInTheDocument()
  })

  it('never claims partial evidence is a match', () => {
    render(<MatchBadge status="partial" />)

    const text = screen.getByText('Partial evidence').textContent ?? ''
    expect(text).not.toMatch(/\bmatch\b/i)
  })

  it('hides its icon from assistive technology, since the label carries it', () => {
    const { container } = render(<MatchBadge status="strong" />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })
})

describe('ChangeBadge', () => {
  it.each([
    ['added', 'Added'],
    ['modified', 'Rewritten'],
    ['removed', 'Removed'],
    ['reordered', 'Reordered'],
  ] as const)('labels %s in words', (action, label) => {
    render(<ChangeBadge action={action} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('distinguishes all four actions by label, not only by tint', () => {
    render(
      <>
        <ChangeBadge action="added" />
        <ChangeBadge action="modified" />
        <ChangeBadge action="removed" />
        <ChangeBadge action="reordered" />
      </>,
    )

    // 'Rewritten' rather than 'Modified': the user is reviewing prose someone
    // rewrote, not a database field that changed.
    const labels = ['Added', 'Rewritten', 'Removed', 'Reordered']
    expect(new Set(labels).size).toBe(4)
    for (const label of labels) expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe('Alert', () => {
  it('renders its content', () => {
    render(<Alert>Something went wrong.</Alert>)
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
  })

  it('interrupts only when told to', () => {
    // An informational note that announced itself would talk over whatever the
    // user was reading.
    const { rerender } = render(<Alert tone="info">Just so you know.</Alert>)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    rerender(
      <Alert tone="danger" live>
        That did not work.
      </Alert>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('That did not work.')
  })

  it('renders a title above the body when given one', () => {
    render(
      <Alert tone="warning" title="Check your formatting">
        Two columns were detected.
      </Alert>,
    )

    expect(screen.getByText('Check your formatting')).toBeInTheDocument()
    expect(screen.getByText('Two columns were detected.')).toBeInTheDocument()
  })

  it('hides its decorative icon from assistive technology', () => {
    const { container } = render(<Alert tone="danger">Nope.</Alert>)
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })
})

describe('EmptyState', () => {
  it('says what is missing and offers the next step', () => {
    // An empty state with no action is a dead end.
    render(
      <EmptyState
        title="No resumes yet"
        description="Upload one to get started."
        action={<Button>Upload a resume</Button>}
      />,
    )

    expect(screen.getByText('No resumes yet')).toBeInTheDocument()
    expect(screen.getByText('Upload one to get started.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload a resume' })).toBeInTheDocument()
  })

  it('renders without an action', () => {
    render(<EmptyState title="Nothing here" description="Nothing to do yet." />)

    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
