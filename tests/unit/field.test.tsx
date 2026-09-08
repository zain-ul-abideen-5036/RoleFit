import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Field, FieldDescription, FieldLabel, Input } from '@/components/ui/field'

/**
 * Form field primitives.
 *
 * The accessibility contract lives in these components rather than at each call
 * site, which is the only reason it holds consistently — so it is worth
 * asserting here once, thoroughly, instead of hoping every form remembers.
 *
 * What is being pinned: a real label wired to the control, `aria-describedby`
 * pointing at both the description and the error, `aria-invalid` agreeing with
 * whether an error is shown, and the error announced when it appears.
 */

describe('labelling', () => {
  it('associates the label with the control', async () => {
    render(
      <Field>
        <FieldLabel>Email</FieldLabel>
        <Input />
      </Field>,
    )

    // getByLabelText only resolves through a real association, so this is the
    // assertion rather than a convenience.
    expect(screen.getByLabelText('Email')).toBeInstanceOf(HTMLInputElement)
  })

  it('focuses the control when the label is clicked', async () => {
    render(
      <Field>
        <FieldLabel>Email</FieldLabel>
        <Input />
      </Field>,
    )

    await userEvent.click(screen.getByText('Email'))
    expect(screen.getByLabelText('Email')).toHaveFocus()
  })

  it('marks a field optional in the label rather than in a placeholder', () => {
    // Placeholder-only guidance disappears the moment someone types.
    render(
      <Field>
        <FieldLabel optional>Name</FieldLabel>
        <Input />
      </Field>,
    )

    expect(screen.getByText('Optional')).toBeInTheDocument()
  })

  it('works with an explicit id', () => {
    render(
      <Field id="my-email">
        <FieldLabel>Email</FieldLabel>
        <Input />
      </Field>,
    )

    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'my-email')
  })

  it('generates distinct ids for two fields on one page', () => {
    render(
      <>
        <Field>
          <FieldLabel>First</FieldLabel>
          <Input />
        </Field>
        <Field>
          <FieldLabel>Second</FieldLabel>
          <Input />
        </Field>
      </>,
    )

    const first = screen.getByLabelText('First')
    const second = screen.getByLabelText('Second')
    expect(first.id).not.toBe(second.id)
  })
})

describe('descriptions', () => {
  it('is announced as part of the control', () => {
    render(
      <Field>
        <FieldLabel>Password</FieldLabel>
        <Input />
        <FieldDescription>Use at least 12 characters.</FieldDescription>
      </Field>,
    )

    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      /Use at least 12 characters/,
    )
  })
})

describe('errors', () => {
  it('shows the message', () => {
    render(
      <Field error="Enter a valid email address">
        <FieldLabel>Email</FieldLabel>
        <Input />
      </Field>,
    )

    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
  })

  it('announces the message the moment it appears', () => {
    // role="alert" rather than a polite region: a submit that failed needs to
    // interrupt, because the user is waiting on it.
    render(
      <Field error="Enter a valid email address">
        <FieldLabel>Email</FieldLabel>
        <Input />
      </Field>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address')
  })

  it('marks the control invalid, so assistive tech and the focus ring agree', () => {
    render(
      <Field error="Enter a valid email address">
        <FieldLabel>Email</FieldLabel>
        <Input />
      </Field>,
    )

    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('is not marked invalid without an error', () => {
    render(
      <Field>
        <FieldLabel>Email</FieldLabel>
        <Input />
      </Field>,
    )

    const input = screen.getByLabelText('Email')
    expect(input.getAttribute('aria-invalid')).not.toBe('true')
  })

  it('makes the error part of the accessible description', () => {
    render(
      <Field error="Enter a valid email address">
        <FieldLabel>Email</FieldLabel>
        <Input />
      </Field>,
    )

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      /Enter a valid email address/,
    )
  })

  it('announces the description and the error together', () => {
    // Both, not the error replacing the description — the requirement is still
    // relevant while the value is wrong.
    render(
      <Field error="Include a number">
        <FieldLabel>Password</FieldLabel>
        <Input />
        <FieldDescription>Use at least 12 characters.</FieldDescription>
      </Field>,
    )

    const description = screen.getByLabelText('Password').getAttribute('aria-describedby') ?? ''
    expect(description.split(/\s+/).length).toBeGreaterThan(1)
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/12 characters/)
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/Include a number/)
  })

  it('shows the first message when given several', () => {
    // A stack of four messages under one input is noise; the first is the one
    // the user has to fix to make progress.
    render(
      <Field error={['Include a number', 'Include an uppercase letter']}>
        <FieldLabel>Password</FieldLabel>
        <Input />
      </Field>,
    )

    expect(screen.getByText('Include a number')).toBeInTheDocument()
    expect(screen.queryByText('Include an uppercase letter')).not.toBeInTheDocument()
  })

  it('renders no alert at all for an empty error array', () => {
    render(
      <Field error={[]}>
        <FieldLabel>Email</FieldLabel>
        <Input />
      </Field>,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('the input itself', () => {
  it('accepts typing', async () => {
    render(
      <Field>
        <FieldLabel>Email</FieldLabel>
        <Input />
      </Field>,
    )

    await userEvent.type(screen.getByLabelText('Email'), 'someone@example.com')
    expect(screen.getByLabelText('Email')).toHaveValue('someone@example.com')
  })

  it('forwards arbitrary input attributes', () => {
    render(
      <Field>
        <FieldLabel>Email</FieldLabel>
        <Input type="email" autoComplete="email" required />
      </Field>,
    )

    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toHaveAttribute('autocomplete', 'email')
    expect(input).toBeRequired()
  })
})

describe('misuse', () => {
  it('fails loudly when a subcomponent is used outside a Field', () => {
    // Silently rendering an unassociated label would produce a form that looks
    // right and is unusable with a screen reader.
    expect(() => render(<FieldLabel>Orphan</FieldLabel>)).toThrowError(/inside <Field>/)
  })
})
