import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  ScoreBar,
  ScoreBreakdown,
  ScoreDelta,
  ScoreDisclaimer,
  ScoreRing,
} from '@/components/ui/score'
import { ATS_SCORE_DISCLAIMER } from '@/lib/constants'
import type { ScoreDimension } from '@/lib/domain/types'

/**
 * Score presentation.
 *
 * The product's most consequential copy lives here. The score is an estimate,
 * and the whole design rests on it never being shown as anything else — so
 * these tests are as much about wording and accessible names as about layout.
 *
 * A sighted user reads the number off a ring; a screen reader user gets
 * whatever the SVG's accessible name says. If those two disagree, the second
 * user is being told something different about their own resume.
 */

function dimension(overrides: Partial<ScoreDimension> = {}): ScoreDimension {
  return {
    key: 'skill_alignment',
    label: 'Skill alignment',
    score: 72,
    weight: 0.3,
    detail: 'Most required skills are evidenced.',
    ...overrides,
  } as ScoreDimension
}

describe('ScoreDisclaimer', () => {
  it('renders the one canonical wording', () => {
    render(<ScoreDisclaimer />)
    expect(screen.getByText(ATS_SCORE_DISCLAIMER)).toBeInTheDocument()
  })

  it('says the score is an estimate and that systems differ', () => {
    // The two claims that keep the number honest. If either disappears, the
    // product is overstating what it knows.
    render(<ScoreDisclaimer />)

    const text = screen.getByText(ATS_SCORE_DISCLAIMER).textContent ?? ''
    expect(text).toMatch(/estimates/i)
    expect(text).toMatch(/may score resumes differently/i)
  })

  it('never promises or guarantees anything', () => {
    render(<ScoreDisclaimer />)

    const text = (screen.getByText(ATS_SCORE_DISCLAIMER).textContent ?? '').toLowerCase()
    for (const forbidden of ['guarantee', 'guaranteed', 'ensure', 'will pass', 'ats compliant']) {
      expect(text, forbidden).not.toContain(forbidden)
    }
  })
})

describe('ScoreRing', () => {
  it('shows the number and its band', () => {
    render(<ScoreRing score={72} />)

    expect(screen.getByText('72')).toBeInTheDocument()
  })

  it('gives assistive technology the same number a sighted user sees', () => {
    render(<ScoreRing score={72} />)

    // Same value, and named as an estimate out of 100 rather than a bare digit.
    const image = screen.getByRole('img')
    expect(image).toHaveAccessibleName(/72 out of 100/)
    expect(image).toHaveAccessibleName(/estimate/i)
  })

  it('rounds rather than truncating, so 71.6 is not shown as 71', () => {
    render(<ScoreRing score={71.6} />)
    expect(screen.getByText('72')).toBeInTheDocument()
  })

  it.each([
    ['above 100', 150, '100'],
    ['below 0', -20, '0'],
  ])('clamps a score %s', (_label, score, expected) => {
    // A score outside the range means a bug upstream. Showing "150" would
    // make the product look like it invented a number.
    render(<ScoreRing score={score} />)
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('keeps the accessible name consistent with a clamped value', () => {
    render(<ScoreRing score={150} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(/100 out of 100/)
  })

  it('renders a caption when given one', () => {
    render(<ScoreRing score={50} caption="Before optimization" />)
    expect(screen.getByText('Before optimization')).toBeInTheDocument()
  })

  it('renders no caption element when none is given', () => {
    render(<ScoreRing score={50} />)
    expect(screen.queryByText('Before optimization')).not.toBeInTheDocument()
  })

  it.each(['sm', 'md', 'lg'] as const)(
    'renders at size %s with the same accessible name',
    (size) => {
      render(<ScoreRing score={64} size={size} />)
      expect(screen.getByRole('img')).toHaveAccessibleName(/64 out of 100/)
    },
  )
})

describe('ScoreBar', () => {
  it('labels the dimension and shows its score', () => {
    render(<ScoreBar label="Skill alignment" score={72} />)

    expect(screen.getByText('Skill alignment')).toBeInTheDocument()
    expect(screen.getByText(/72/)).toBeInTheDocument()
  })

  it('states the weight, so the contribution is never hidden', () => {
    // A dimension scoring badly matters more or less depending on its weight.
    // Hiding that makes the overall number look arbitrary.
    render(<ScoreBar label="Skill alignment" score={40} weight={0.3} />)
    expect(screen.getByText(/30%/)).toBeInTheDocument()
  })

  it('renders the detail when given', () => {
    render(<ScoreBar label="Formatting" score={90} detail="Single column, no tables." />)
    expect(screen.getByText('Single column, no tables.')).toBeInTheDocument()
  })

  it('clamps an out-of-range score', () => {
    render(<ScoreBar label="Broken" score={999} />)
    expect(screen.getByText(/100/)).toBeInTheDocument()
  })
})

describe('ScoreBreakdown', () => {
  it('renders every dimension it is given', () => {
    render(
      <ScoreBreakdown
        dimensions={[
          dimension({ key: 'skill_alignment', label: 'Skill alignment' }),
          dimension({ key: 'keyword_alignment', label: 'Keyword alignment', score: 55 }),
          dimension({ key: 'resume_structure', label: 'Resume structure', score: 88 }),
        ]}
      />,
    )

    expect(screen.getByText('Skill alignment')).toBeInTheDocument()
    expect(screen.getByText('Keyword alignment')).toBeInTheDocument()
    expect(screen.getByText('Resume structure')).toBeInTheDocument()
  })

  it('renders nothing rather than an empty shell for no dimensions', () => {
    const { container } = render(<ScoreBreakdown dimensions={[]} />)
    expect(container.textContent).toBe('')
  })
})

describe('ScoreDelta', () => {
  it('shows an improvement with a sign', () => {
    render(<ScoreDelta from={61} to={74} />)

    expect(screen.getByText('61')).toBeInTheDocument()
    expect(screen.getByText('74')).toBeInTheDocument()
    expect(screen.getByText(/\+13/)).toBeInTheDocument()
  })

  it('shows a regression without inventing a plus sign', () => {
    render(<ScoreDelta from={74} to={61} />)
    expect(screen.getByText(/\(-13\)/)).toBeInTheDocument()
  })

  it('shows no change as zero rather than hiding it', () => {
    // An optimization that changed nothing is information, not an error.
    render(<ScoreDelta from={70} to={70} />)
    expect(screen.getByText(/\(0\)/)).toBeInTheDocument()
  })

  it('hides the decorative arrow from assistive technology', () => {
    const { container } = render(<ScoreDelta from={60} to={70} />)

    const arrow = container.querySelector('[aria-hidden="true"]')
    expect(arrow?.textContent).toBe('→')
  })

  it('computes the delta from rounded values, so it always matches what is shown', () => {
    // 61.4 → 74.6 displays as 61 and 75. A delta of 13.2 rounded to 13 would
    // contradict the two numbers either side of it.
    render(<ScoreDelta from={61.4} to={74.6} />)

    expect(screen.getByText('61')).toBeInTheDocument()
    expect(screen.getByText('75')).toBeInTheDocument()
    expect(screen.getByText(/\+14/)).toBeInTheDocument()
  })
})
