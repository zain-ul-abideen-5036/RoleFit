'use client'

import * as React from 'react'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Panel, PanelHeader } from '@/components/ui/layout'
import { TEMPLATE_IDS, TEMPLATES, type TemplateId } from '@/lib/documents/templates'
import { cn } from '@/lib/utils'

/**
 * Template choice for the preview and export.
 *
 * The choice lives in the URL (`?template=`), not in client state, so the
 * server-rendered preview, the export request and a reload all agree on it.
 * Native radio inputs carry the semantics: arrow keys move between templates
 * and a screen reader announces one group with a checked option, which a row
 * of styled buttons would not.
 */
export function TemplatePicker({ value }: { value: TemplateId }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = React.useTransition()

  function choose(id: TemplateId): void {
    const params = new URLSearchParams(searchParams.toString())
    params.set('template', id)
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <Panel flush aria-busy={pending}>
      <PanelHeader
        title="Template"
        description="Every template is single-column with standard headings and real text, so each one reads cleanly in applicant tracking systems. Only the styling and section order change."
      />
      <fieldset className="p-4 sm:p-5">
        <legend className="sr-only">Resume template</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATE_IDS.map((id) => {
            const template = TEMPLATES[id]
            const checked = id === value
            return (
              <label
                key={id}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors',
                  'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
                  checked ? 'border-line-accent bg-accent-subtle' : 'border-line hover:bg-hover',
                )}
              >
                <input
                  type="radio"
                  name="resume-template"
                  value={id}
                  checked={checked}
                  onChange={() => choose(id)}
                  className="mt-1 size-4 shrink-0 accent-(--color-accent)"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full border border-line"
                      style={{ backgroundColor: `#${template.accent}` }}
                    />
                    <span
                      className={cn(
                        'text-sm font-semibold text-fg',
                        template.typeface === 'serif' && 'font-serif',
                      )}
                    >
                      {template.name}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
                    {template.description}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-fg-subtle">
                    {template.bestFor}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>
    </Panel>
  )
}
