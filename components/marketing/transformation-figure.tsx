import * as React from 'react'

import { ArrowRight, FileText, ShieldCheck, Target } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The hero figure: resume + job description → optimized resume.
 *
 * Drawn with real DOM and text rather than an illustration, so it scales, reads
 * in both themes, respects the user's font size, and does not ship an image.
 * Each panel is decorative in aggregate — the surrounding copy carries the
 * meaning — so the whole figure is hidden from assistive technology and
 * described once by its caption.
 */

function DocumentLines({ widths, tone }: { widths: number[]; tone: 'muted' | 'accent' }) {
  return (
    <div className="flex flex-col gap-1.5">
      {widths.map((width, index) => (
        <div
          key={index}
          className={cn(
            'h-1.5 rounded-full',
            tone === 'accent' ? 'bg-accent/45' : 'bg-fg-subtle/25',
          )}
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  )
}

function Panel({
  label,
  icon,
  children,
  className,
  highlighted = false,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
  className?: string
  highlighted?: boolean
}) {
  return (
    <div
      className={cn(
        'flex w-full flex-col gap-3 rounded-lg border bg-surface p-4 shadow-xs',
        highlighted ? 'border-line-accent ring-1 ring-accent/20' : 'border-line',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-md',
            highlighted ? 'bg-accent-subtle text-fg-accent' : 'bg-sunken text-fg-subtle',
          )}
        >
          {icon}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}

export function TransformationFigure({ className }: { className?: string }) {
  return (
    <figure className={cn('w-full', className)}>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center" aria-hidden="true">
        <div className="flex flex-col gap-3">
          <Panel label="Your resume" icon={<FileText className="size-3.5" />}>
            <DocumentLines widths={[92, 78, 85, 64]} tone="muted" />
          </Panel>
          <Panel label="Job description" icon={<Target className="size-3.5" />}>
            <DocumentLines widths={[88, 70, 90]} tone="muted" />
          </Panel>
        </div>

        <div className="flex justify-center py-1 sm:py-0">
          <span className="flex size-9 items-center justify-center rounded-full border border-line bg-surface text-fg-subtle shadow-xs">
            <ArrowRight className="size-4 rotate-90 sm:rotate-0" />
          </span>
        </div>

        <Panel
          label="Tailored resume"
          icon={<ShieldCheck className="size-3.5" />}
          highlighted
          className="sm:self-stretch sm:justify-center"
        >
          <DocumentLines widths={[95, 88, 92, 76, 84]} tone="accent" />
          <div className="mt-1 flex flex-wrap gap-1.5">
            {['Evidence-checked', 'Single column', 'Selectable text'].map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-success-line bg-success-bg px-2 py-0.5 text-[0.625rem] font-medium text-success-fg"
              >
                {chip}
              </span>
            ))}
          </div>
        </Panel>
      </div>

      <figcaption className="mt-4 text-center text-xs text-fg-subtle">
        Your resume and a job description go in. A tailored, ATS-friendly resume comes out — built
        only from experience you already have.
      </figcaption>
    </figure>
  )
}
