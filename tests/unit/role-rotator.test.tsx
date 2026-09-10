import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ROLES, RoleRotator } from '@/components/marketing/role-rotator'

/**
 * The rotating role in the hero headline.
 *
 * The pattern this came from has three failure modes that are invisible in a
 * screenshot and obvious to anyone using the page with a screen reader, with
 * reduced motion on, or reading slowly. All three are asserted here, because a
 * comment claiming they are handled is not evidence that they are.
 */

const { reduceMotion } = vi.hoisted(() => ({ reduceMotion: vi.fn() }))

vi.mock('framer-motion', () => ({ useReducedMotion: reduceMotion }))

beforeEach(() => {
  reduceMotion.mockReturnValue(false)
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

/**
 * Advances the clock and lets React flush.
 *
 * `setIndex` is called from inside the interval callback, so without `act` the
 * timer fires but the re-render has not happened by the time the assertion
 * runs — which looks exactly like the component failing to advance.
 */
function tick(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

/** The role currently shown, read from opacity rather than from presence. */
function visibleRole(): string | undefined {
  return ROLES.find((role) => {
    const node = screen.getAllByText(role).find((n) => n.className.includes('absolute'))
    return node?.className.includes('opacity-100')
  })
}

describe('it does not mutate the heading for assistive technology', () => {
  it('hides every rotating variant from the accessibility tree', () => {
    render(<RoleRotator />)

    for (const role of ROLES) {
      const nodes = screen.getAllByText(role).filter((n) => n.className.includes('absolute'))
      expect(nodes.length, role).toBeGreaterThan(0)
      for (const node of nodes) expect(node).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('hides the width sizer too', () => {
    // It exists only to reserve space, so it must not be read out and must not
    // be `hidden` either — it still has to occupy the box.
    render(<RoleRotator />)
    const sizer = screen
      .getAllByText(ROLES.reduce((a, b) => (b.length > a.length ? b : a)))
      .find((n) => n.className.includes('invisible'))

    expect(sizer).toBeDefined()
    expect(sizer).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('it does not shift the layout', () => {
  it('renders every role at once, stacked, rather than swapping one node', () => {
    // Mounting one word at a time resizes the line as the words change and
    // pushes everything below it. All five are present; opacity decides.
    render(<RoleRotator />)

    for (const role of ROLES) {
      expect(screen.getAllByText(role).length).toBeGreaterThan(0)
    }
  })

  it('animates only opacity and transform', () => {
    render(<RoleRotator />)
    const node = screen.getAllByText(ROLES[0]!).find((n) => n.className.includes('absolute'))

    expect(node?.className).toContain('transition-[opacity,transform]')
    // A width or height transition here would re-run layout every frame.
    expect(node?.className).not.toContain('transition-all')
  })
})

describe('it can be stopped', () => {
  it('advances on its own by default', () => {
    render(<RoleRotator />)
    expect(visibleRole()).toBe(ROLES[0])

    tick(2600)
    expect(visibleRole()).toBe(ROLES[1])
  })

  it('freezes under prefers-reduced-motion', () => {
    // Auto-updating text is exactly what a motion preference is asking to stop.
    reduceMotion.mockReturnValue(true)
    render(<RoleRotator />)

    tick(2600 * 4)
    expect(visibleRole()).toBe(ROLES[0])
  })

  it('freezes while hovered, so a slow reader can hold it still', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<RoleRotator />)

    await user.hover(screen.getByText(ROLES[0]!, { selector: '.absolute' }))
    tick(2600 * 3)

    expect(visibleRole()).toBe(ROLES[0])
  })

  it('resumes once the pointer leaves', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<RoleRotator />)
    const target = screen.getByText(ROLES[0]!, { selector: '.absolute' })

    await user.hover(target)
    await user.unhover(target)
    tick(2600)

    expect(visibleRole()).toBe(ROLES[1])
  })

  it('clears its interval on unmount', () => {
    const clear = vi.spyOn(window, 'clearInterval')
    const { unmount } = render(<RoleRotator />)
    unmount()

    expect(clear).toHaveBeenCalled()
  })
})

describe('the roles themselves', () => {
  it('are job titles, not adjectives', () => {
    // The whole point of the reinterpretation. "amazing / wonderful / smart"
    // describes nothing and would suit any product; a job title states what
    // this one does.
    for (const role of ROLES) {
      expect(role, role).toMatch(/^[A-Z]/)
      expect(role.split(' ').length, role).toBeGreaterThan(1)
    }
  })
})
