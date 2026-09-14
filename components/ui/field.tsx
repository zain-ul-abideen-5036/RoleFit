'use client'

import * as React from 'react'

import * as LabelPrimitive from '@radix-ui/react-label'
import { AlertCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Form field primitives.
 *
 * The accessibility contract is handled here rather than at each call site:
 * a visible label is always rendered (never placeholder-only), the control is
 * wired to its description and error through `aria-describedby`, the error is
 * announced via a live region, and `aria-invalid` is set so assistive tech and
 * the focus ring agree about validity.
 */

const FieldContext = React.createContext<{
  id: string
  descriptionId: string
  errorId: string
  hasError: boolean
} | null>(null)

function useField() {
  const context = React.useContext(FieldContext)
  if (!context) throw new Error('Field subcomponents must be used inside <Field>')
  return context
}

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stable id; one is generated when omitted. */
  id?: string
  error?: string | string[] | undefined
}

export function Field({ id, error, className, children, ...props }: FieldProps) {
  const generatedId = React.useId()
  const fieldId = id ?? generatedId
  const message = Array.isArray(error) ? error[0] : error

  const value = React.useMemo(
    () => ({
      id: fieldId,
      descriptionId: `${fieldId}-description`,
      errorId: `${fieldId}-error`,
      hasError: Boolean(message),
    }),
    [fieldId, message],
  )

  return (
    <FieldContext.Provider value={value}>
      <div className={cn('flex flex-col gap-1.5', className)} {...props}>
        {children}
        {message ? (
          // `role="alert"` so the message is announced the moment it appears.
          <p
            id={value.errorId}
            role="alert"
            className="flex animate-enter items-start gap-1.5 text-sm text-danger-fg"
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{message}</span>
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  )
}

export function FieldLabel({
  className,
  children,
  optional,
  ...props
}: React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { optional?: boolean }) {
  const { id } = useField()
  return (
    <LabelPrimitive.Root
      htmlFor={id}
      className={cn('flex items-center gap-2 text-sm font-medium text-fg', className)}
      {...props}
    >
      {children}
      {optional ? <span className="text-xs font-normal text-fg-subtle">Optional</span> : null}
    </LabelPrimitive.Root>
  )
}

export function FieldDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const { descriptionId } = useField()
  return <p id={descriptionId} className={cn('text-sm text-fg-subtle', className)} {...props} />
}

const controlClasses = [
  'w-full rounded-md border bg-surface text-fg',
  'placeholder:text-fg-disabled',
  'transition-[border-color,box-shadow,background-color] duration-(--duration-fast) ease-(--ease-standard)',
  // A control that does not react to the pointer reads as display text. The
  // border is the whole affordance here, so it is the thing that moves.
  'hover:border-line-bold',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
  // Disabled is not merely dimmer: it loses the hover response too, otherwise
  // the field keeps inviting a click it will not accept.
  'disabled:cursor-not-allowed disabled:border-line disabled:bg-sunken disabled:text-fg-disabled',
  'disabled:hover:border-line',
  // 16px on mobile prevents iOS Safari zooming the viewport on focus.
  'text-base sm:text-sm',
].join(' ')

/**
 * Border and ring for a control's validity.
 *
 * The ring colour is the part that was missing. `aria-invalid` already tells
 * assistive technology the field is in error, and the file's own contract says
 * the focus ring agrees with it — but the ring rendered the neutral accent
 * either way, so a sighted keyboard user focusing an invalid field saw the
 * same affirmative colour as a valid one. Two channels describing one field,
 * disagreeing.
 */
function validityClasses(hasError: boolean): string {
  return hasError
    ? 'border-danger-line hover:border-danger-solid focus-visible:outline-ring-danger'
    : 'border-line-strong'
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  const { id, descriptionId, errorId, hasError } = useField()
  return (
    <input
      ref={ref}
      id={id}
      aria-invalid={hasError || undefined}
      aria-describedby={cn(descriptionId, hasError && errorId)}
      className={cn(controlClasses, 'h-10 px-3', validityClasses(hasError), className)}
      {...props}
    />
  )
})

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  const { id, descriptionId, errorId, hasError } = useField()
  return (
    <textarea
      ref={ref}
      id={id}
      aria-invalid={hasError || undefined}
      aria-describedby={cn(descriptionId, hasError && errorId)}
      className={cn(
        controlClasses,
        'min-h-28 resize-y px-3 py-2 leading-relaxed',
        validityClasses(hasError),
        className,
      )}
      {...props}
    />
  )
})

/** A standalone label for controls outside a `Field`. */
export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(function Label({ className, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn('text-sm font-medium text-fg', className)}
      {...props}
    />
  )
})
