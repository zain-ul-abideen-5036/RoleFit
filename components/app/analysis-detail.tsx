'use client'

import * as React from 'react'

import { AlertTriangle, CheckCircle2, Info, MinusCircle } from 'lucide-react'

import { RequirementList } from '@/components/app/requirement-list'
import { Alert, Badge, Callout } from '@/components/ui/feedback'
import { Panel, PanelHeader } from '@/components/ui/layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { AnalysisReport } from '@/lib/domain/types'
import { pluralize } from '@/lib/utils'

/**
 * The requirement views on the analysis screen.
 *
 * This screen was six stacked cards: gaps, then strong matches beside partial
 * evidence, then keyword coverage, then recommendations. Reaching the
 * recommendations meant scrolling past sixty requirement rows, and the two
 * side-by-side columns meant a long "strong" list ran alongside an empty
 * "partial" one with a paragraph of dead space beside it.
 *
 * They are alternative views of one data set, which is what tabs are for. The
 * gaps tab leads, because the gaps are the reason to read this page — unless
 * there are none, in which case leading with an empty panel would be a strange
 * way to deliver good news.
 */

export function AnalysisDetail({ report }: { report: AnalysisReport }) {
  const matches = report.requirementMatches

  const missing = React.useMemo(
    () => matches.filter((match) => match.status === 'missing'),
    [matches],
  )
  const strong = React.useMemo(
    () => matches.filter((match) => match.status === 'strong'),
    [matches],
  )
  const partial = React.useMemo(
    () => matches.filter((match) => match.status === 'partial'),
    [matches],
  )

  // Gaps first when there are any; otherwise the matches, which is then the
  // most informative thing on the page.
  const defaultTab = missing.length > 0 ? 'gaps' : 'strong'

  const presentKeywords = report.keywordCoverage.filter((entry) => entry.present)
  const absentKeywords = report.keywordCoverage.filter((entry) => !entry.present)

  return (
    <Tabs defaultValue={defaultTab}>
      <div className="border-b border-line">
        <TabsList>
          <TabsTrigger value="gaps" count={missing.length}>
            Gaps
          </TabsTrigger>
          <TabsTrigger value="strong" count={strong.length}>
            Strong matches
          </TabsTrigger>
          <TabsTrigger value="partial" count={partial.length}>
            Partial evidence
          </TabsTrigger>
          <TabsTrigger value="keywords" count={report.keywordCoverage.length}>
            Keywords
          </TabsTrigger>
          {report.recommendations.length > 0 ? (
            <TabsTrigger value="recommendations" count={report.recommendations.length}>
              What to do
            </TabsTrigger>
          ) : null}
        </TabsList>
      </div>

      {/* ----------------------------------------------------------- gaps */}
      <TabsContent value="gaps">
        {missing.length === 0 ? (
          <Alert tone="success" title="Every extracted requirement is evidenced">
            Your resume supports each requirement this posting states. Nothing was left out and
            nothing had to be invented.
          </Alert>
        ) : (
          <Panel flush>
            <PanelHeader
              title={`${missing.length} ${pluralize(missing.length, 'requirement')} your resume does not evidence`}
              description="These will never be written into your resume. They are shown so you know where the gap is, and can address it honestly."
            />
            <div className="px-4 py-3 sm:px-5 sm:py-4">
              <RequirementList matches={missing} suggestions={report.gapSuggestions} hideStatus />
            </div>
          </Panel>
        )}
      </TabsContent>

      {/* --------------------------------------------------------- strong */}
      <TabsContent value="strong">
        {strong.length === 0 ? (
          <EmptyPanel>
            No requirement was clearly demonstrated by your experience. That usually means the
            posting and the resume describe different kinds of work, rather than that the experience
            is missing — check the partial evidence tab.
          </EmptyPanel>
        ) : (
          <Panel flush>
            <PanelHeader
              title="Strong matches"
              description="Requirements clearly demonstrated by your experience, with the resume span each one rests on."
            />
            <div className="px-4 py-3 sm:px-5 sm:py-4">
              <RequirementList matches={strong} showEvidence hideStatus />
            </div>
          </Panel>
        )}
      </TabsContent>

      {/* -------------------------------------------------------- partial */}
      <TabsContent value="partial">
        {partial.length === 0 ? (
          <EmptyPanel>
            Nothing partially matched. Every requirement was either clearly evidenced or not
            evidenced at all.
          </EmptyPanel>
        ) : (
          <Panel flush>
            <PanelHeader
              title="Partial evidence"
              description="Related experience, but not a clear demonstration of the requirement. Worth strengthening in your own words if you do have it."
            />
            <div className="px-4 py-3 sm:px-5 sm:py-4">
              <RequirementList matches={partial} showEvidence hideStatus />
            </div>
          </Panel>
        )}
      </TabsContent>

      {/* ------------------------------------------------------- keywords */}
      <TabsContent value="keywords">
        <Panel flush>
          <PanelHeader
            title="Keyword coverage"
            description="Terms from the posting, and whether they appear in your resume. Use the posting’s wording only where you genuinely have the experience."
          />
          <div className="flex flex-col gap-5 px-4 py-4 sm:px-5">
            <KeywordGroup
              title={`Present in your resume (${presentKeywords.length})`}
              tone="success"
              entries={presentKeywords}
            />
            <KeywordGroup
              title={`Not found (${absentKeywords.length})`}
              tone="neutral"
              entries={absentKeywords}
            />
          </div>
        </Panel>
      </TabsContent>

      {/* ------------------------------------------------ recommendations */}
      {report.recommendations.length > 0 ? (
        <TabsContent value="recommendations">
          <Panel flush>
            <PanelHeader
              title="What to do next"
              description="Ordered by how much each would move your score. Every one is something you can act on without inventing anything."
            />
            <ol className="divide-y divide-line">
              {report.recommendations.map((recommendation, index) => (
                <li key={recommendation.id} className="flex gap-3.5 px-4 py-3.5 sm:px-5">
                  {/*
                    The severity icon and the position both carry the ordering.
                    The number is what makes "ordered by impact" legible as an
                    ordering rather than as a list that happens to be in some
                    order.
                  */}
                  <span
                    aria-hidden="true"
                    className="mt-px w-4 shrink-0 text-right text-2xs font-medium tabular-nums text-fg-disabled"
                  >
                    {index + 1}
                  </span>
                  <span className="mt-px shrink-0">
                    {recommendation.severity === 'critical' ? (
                      <AlertTriangle className="size-4 text-danger-fg" aria-hidden="true" />
                    ) : recommendation.severity === 'important' ? (
                      <AlertTriangle className="size-4 text-warning-fg" aria-hidden="true" />
                    ) : (
                      <Info className="size-4 text-fg-subtle" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-meta font-semibold text-fg">
                      {recommendation.title}
                      {/* Severity in words as well as by icon colour. */}
                      <span className="eyebrow text-fg-subtle">{recommendation.severity}</span>
                    </p>
                    <p className="mt-1 measure text-meta leading-relaxed text-fg-muted">
                      {recommendation.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </TabsContent>
      ) : null}
    </Tabs>
  )
}

/**
 * Keywords, split into present and absent rather than interleaved.
 *
 * They were one flat wrap of sixty badges, tinted green or grey, which meant
 * the only way to answer "what am I missing" was to scan every one. Two
 * groups answer it by structure. Occurrence counts come along because they are
 * already computed and they distinguish a term used once in passing from one
 * the resume is actually about.
 */
function KeywordGroup({
  title,
  tone,
  entries,
}: {
  title: string
  tone: 'success' | 'neutral'
  entries: readonly AnalysisReport['keywordCoverage'][number][]
}) {
  if (entries.length === 0) {
    return (
      <div>
        <h3 className="eyebrow text-fg-subtle">{title}</h3>
        <p className="mt-2 text-2xs text-fg-subtle">None.</p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="eyebrow text-fg-subtle">{title}</h3>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {entries.map((entry) => (
          <li key={entry.keyword}>
            <Badge tone={tone}>
              {tone === 'success' ? (
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
              ) : (
                <MinusCircle className="size-3.5" aria-hidden="true" />
              )}
              {entry.keyword}
              {entry.present && entry.occurrences > 1 ? (
                <span className="text-fg-subtle">×{entry.occurrences}</span>
              ) : null}
              <span className="sr-only">
                {entry.present
                  ? ` — appears ${entry.occurrences} ${pluralize(entry.occurrences, 'time')} in your resume`
                  : ' — not found in your resume'}
              </span>
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <Callout tone="neutral" icon={<Info />}>
      {children}
    </Callout>
  )
}
