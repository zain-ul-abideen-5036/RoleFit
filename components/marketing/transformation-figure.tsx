import * as React from 'react'

import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The hero figure: a resume being tailored, on the page.
 *
 * A single-column sheet, set the way the product's own generator sets one —
 * the same section headings as `SECTION_TITLES` in `lib/documents/layout.ts`,
 * the same candidate as the demo fixture — with a review pass sweeping down it
 * once. As the pass reaches each weak bullet, that bullet is replaced by the
 * rewrite the product would actually propose.
 *
 * This is the third attempt at this figure and the reasoning is worth keeping.
 *
 * It began as three panels of grey rounded bars with an arrow between them:
 * the placeholder-lines mock every product page ships, which says "a document
 * is involved" and nothing else, and which works equally well for a CRM or an
 * invoice tool. It was then a requirement-match readout — real and specific,
 * but static, and it explained the *mechanism* where a hero should show the
 * *outcome*.
 *
 * What it is not is a person celebrating. `docs/product.md` sets the register
 * for this product explicitly — "no emoji, no gamification, no robot mascot" —
 * and a stock figure throwing their arms up is the exact template look the
 * design brief was to avoid. The outcome this product delivers is a document
 * someone can send and defend in an interview, so the document is the subject.
 *
 * Pure CSS, on a loop.
 *
 *  - No JavaScript: nothing to hydrate, nothing to fail, no observer. The
 *    finished sheet is complete in the served HTML.
 *  - It repeats, so a visitor who scrolls back up still sees the product
 *    working. Each cycle holds the finished sheet for about five seconds
 *    before it reverts, so it reads as a demonstration rather than flicker.
 *  - A loop past five seconds must be stoppable (WCAG 2.2.2). Hover pauses
 *    it, and the Pause checkbox under the figure pauses it for touch and
 *    keyboard. Reduced motion skips the loop and shows the finished sheet.
 *
 * The sheet is `aria-hidden`. Its text changes mid-animation, and a screen
 * reader being read a bullet that is halfway through being replaced is noise —
 * the same reason the rotating role in the headline is hidden behind a stable
 * sentence. The figcaption describes the figure once.
 */

/**
 * When the scan line reaches each rewritten line and the footer. The sweep is
 * linear, so these are its start (0.3s) plus each row's share of 2.4s.
 */
const FIRST_REWRITE = '1.6s'
const SECOND_REWRITE = '1.9s'
const FOOTER_ARRIVES = '2.5s'

export function TransformationFigure({ className }: { className?: string }) {
  return (
    <figure className={cn('tailor-stage w-full min-w-0', className)}>
      {/*
        A sheet, not a UI panel: near-square corners and a real shadow — the
        one place in this product where a shadow stands in for a physical
        object rather than for a UI layer. It matches the `paper` variant of
        `ResumeDocument`, which is the same idea on the preview screen.
      */}
      <div
        aria-hidden="true"
        className="relative isolate overflow-hidden rounded-sm border border-line bg-surface shadow-lg"
      >
        {/* ------------------------------------------------- review pass */}
        {/*
          A hairline travelling the height of the sheet. The wrapper is
          full-height and is translated by its own height, so the distance is
          the sheet's height without anything having to measure it — and it is
          a transform, so it composites.

          A solid accent line with a soft glow, so the pass is unmistakable
          on every repeat, light or dark.
        */}
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="tailor-sweep h-full w-full">
            <div className="h-0.5 w-full bg-accent shadow-[0_0_14px_2px_var(--color-accent)]" />
          </div>
        </div>

        {/* ------------------------------------------------------ header */}
        <div className="border-b border-line px-5 py-4 sm:px-7 sm:pt-6">
          <p className="text-body-lg font-semibold tracking-tight text-fg">Avery Chen</p>
          <p className="mt-1 text-3xs text-fg-muted">
            avery.chen@example.com · +1 415 555 0142 · San Francisco, CA
          </p>
        </div>

        {/* -------------------------------------------------------- body */}
        <div className="px-5 pb-4 pt-4 sm:px-7">
          <Heading>Professional Summary</Heading>
          <p className="mt-1.5 text-2xs leading-relaxed text-fg">
            Software engineer with four years of experience building web applications, focused on
            backend services and data pipelines.
          </p>

          <Heading className="mt-5">Experience</Heading>
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <p className="text-2xs font-semibold text-fg">
              Software Engineer
              <span className="font-normal text-fg-muted"> — Northwind Logistics</span>
            </p>
            <p className="shrink-0 text-3xs text-fg-subtle">Mar 2022 – Present</p>
          </div>

          <ul className="mt-2 flex flex-col gap-1.5">
            <Bullet
              rewrittenAt={FIRST_REWRITE}
              before="Worked on the shipment tracking service."
              after="Built and owned the shipment tracking service used by internal operations teams."
            />
            <Bullet before="Built REST APIs in Node.js and Express for the customer portal." />
            <Bullet
              rewrittenAt={SECOND_REWRITE}
              before="Helped migrate the reporting database, which reduced query times by 35%."
              after="Migrated the reporting database to PostgreSQL, cutting query times by 35%."
            />
          </ul>

          <Heading className="mt-5">Skills</Heading>
          <p className="mt-1.5 text-2xs leading-relaxed text-fg">
            <span className="font-semibold">Languages:</span> Python, SQL, JavaScript, TypeScript
          </p>
        </div>

        {/* ------------------------------------------------------ footer */}
        {/*
          The guarantees, not a celebration. These are the three things the
          generated document is actually checked for, and they arrive after the
          rewrites land — so the sequence reads: tailored, then verified.
        */}
        <div
          className="tailor-arrive flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line bg-sunken px-5 py-2.5 sm:px-7"
          style={{ '--at': FOOTER_ARRIVES } as React.CSSProperties}
        >
          <p className="text-3xs font-medium text-fg-muted">
            Tailored for Backend Engineer · Meridian Data
          </p>
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {['Evidence-checked', 'Single column', 'Selectable text'].map((claim) => (
              <li key={claim} className="flex items-center gap-1 text-3xs text-success-fg">
                <Check className="size-2.5 shrink-0" />
                {claim}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <figcaption className="mt-3 flex items-start justify-between gap-4">
        <span className="measure text-2xs leading-relaxed text-fg-subtle">
          An example. Two bullets are rewritten as the review pass reaches them — stronger wording,
          built only from experience the resume already contains.
        </span>
        {/* A real checkbox, so pausing works by touch and keyboard with no
            JavaScript; the stylesheet pauses the loop while it is checked. */}
        <label className="tailor-pause-control flex shrink-0 cursor-pointer items-center gap-1.5 text-2xs text-fg-muted">
          <input type="checkbox" className="tailor-pause size-3.5 accent-(--color-accent)" />
          Pause
        </label>
      </figcaption>
    </figure>
  )
}

function Heading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'border-b border-line pb-1 text-3xs font-semibold uppercase tracking-[0.09em] text-fg',
        className,
      )}
    >
      {children}
    </p>
  )
}

/**
 * A resume bullet, optionally one that gets rewritten.
 *
 * Both wordings occupy the same grid cell, so the row is as tall as the longer
 * of the two and nothing below it moves when they swap. Replacing the text in
 * place instead would reflow the rest of the sheet mid-animation, which is the
 * failure that makes this kind of figure look broken.
 */
function Bullet({
  before,
  after,
  rewrittenAt,
}: {
  before: string
  after?: string
  rewrittenAt?: string
}) {
  const at = { '--at': rewrittenAt } as React.CSSProperties

  return (
    <li className="flex gap-2 text-2xs leading-relaxed">
      <span className="shrink-0 text-fg-subtle">–</span>

      {after && rewrittenAt ? (
        <span className="relative grid min-w-0 flex-1">
          {/* A brief tint under the line as it is replaced — the only signal
              that this row is the one being worked on. */}
          <span
            className="tailor-mark pointer-events-none absolute -inset-x-1.5 -inset-y-0.5 -z-10 rounded-sm bg-accent-subtle ring-1 ring-line-accent"
            style={at}
          />
          <span className="tailor-retire col-start-1 row-start-1 text-fg-muted" style={at}>
            {before}
          </span>
          <span className="tailor-arrive col-start-1 row-start-1 text-fg" style={at}>
            {after}
          </span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 text-fg">{before}</span>
      )}
    </li>
  )
}
