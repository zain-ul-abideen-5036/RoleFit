'use client'

import * as React from 'react'

import { Download, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/feedback'
import { Panel } from '@/components/ui/layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScoreDisclaimer } from '@/components/ui/score'
import {
  ResponsiveTable,
  Table,
  TableBody,
  TableCard,
  TableCards,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableNote,
  TableRow,
  TableRowLink,
} from '@/components/ui/table'
import { scoreBand } from '@/lib/constants'
import { formatBytes, formatDateTime, pluralize } from '@/lib/utils'

/**
 * History.
 *
 * This screen was three stacked cards — analyses, then runs, then exports —
 * each with a heading, a description and its own bordered box. On an account
 * with any real use that is a very long page where the thing you came for is
 * below two things you did not, and the only way to reach the exports is to
 * scroll past fifty analyses.
 *
 * They are alternatives, not a sequence, which is what tabs are for. Each
 * panel is a table rather than a flex row, so the scores in a column actually
 * line up and can be compared.
 */

export interface HistoryAnalysis {
  id: string
  createdAt: Date
  overallScore: number
  jobTitle: string
  company: string | null
  resumeTitle: string
  strong: number
  partial: number
  missing: number
  requiredMissing: number
}

export interface HistoryRun {
  id: string
  resumeId: string
  createdAt: Date
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  provider: string
  baselineScore: number
  projectedScore: number | null
  changeCount: number
  jobTitle: string
  company: string | null
  resumeTitle: string
}

export interface HistoryDocument {
  id: string
  filename: string
  createdAt: Date
  sizeBytes: number
  kind: string
}

function bandTone(score: number): 'success' | 'warning' | 'danger' {
  const { tone } = scoreBand(score)
  return tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'danger'
}

const RUN_STATUS_TONE = {
  succeeded: 'success',
  failed: 'danger',
  queued: 'neutral',
  running: 'info',
} as const

export function HistoryView({
  analyses,
  runs,
  documents,
}: {
  analyses: readonly HistoryAnalysis[]
  runs: readonly HistoryRun[]
  documents: readonly HistoryDocument[]
}) {
  return (
    <Tabs defaultValue="analyses">
      {/*
        The tab strip sits on its own rule so the boundary between "choose a
        view" and "here is the view" is unambiguous. The counts are inside the
        trigger's accessible name because the number is usually the reason
        somebody picks a tab.
      */}
      <div className="border-b border-line">
        <TabsList>
          <TabsTrigger value="analyses" count={analyses.length}>
            Analyses
          </TabsTrigger>
          <TabsTrigger value="runs" count={runs.length}>
            Optimization runs
          </TabsTrigger>
          <TabsTrigger value="documents" count={documents.length}>
            Exports
          </TabsTrigger>
        </TabsList>
      </div>

      {/* ------------------------------------------------------- analyses */}
      <TabsContent value="analyses">
        {analyses.length === 0 ? (
          <EmptyTab>No analyses yet. Every resume you check against a posting lands here.</EmptyTab>
        ) : (
          <Panel flush>
            <ResponsiveTable
              table={
                <Table label="Analyses" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Role</TableHeaderCell>
                      <TableHeaderCell>Resume</TableHeaderCell>
                      <TableHeaderCell numeric tight>
                        Strong
                      </TableHeaderCell>
                      <TableHeaderCell numeric tight>
                        Partial
                      </TableHeaderCell>
                      <TableHeaderCell numeric tight>
                        Missing
                      </TableHeaderCell>
                      <TableHeaderCell tight>Run</TableHeaderCell>
                      <TableHeaderCell numeric tight>
                        Readiness
                      </TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {analyses.map((analysis) => (
                      <TableRow key={analysis.id} interactive>
                        <TableCell rowHeader>
                          <TableRowLink href={`/analysis/${analysis.id}`}>
                            {analysis.jobTitle}
                          </TableRowLink>
                          {analysis.company ? (
                            <span className="mt-0.5 block text-2xs text-fg-subtle">
                              {analysis.company}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <span className="block max-w-52 truncate">{analysis.resumeTitle}</span>
                        </TableCell>
                        <TableCell numeric tight className="text-success-fg">
                          {analysis.strong}
                        </TableCell>
                        <TableCell numeric tight className="text-warning-fg">
                          {analysis.partial}
                        </TableCell>
                        <TableCell numeric tight className="text-danger-fg">
                          {analysis.missing}
                        </TableCell>
                        <TableCell tight>
                          <time dateTime={analysis.createdAt.toISOString()}>
                            {formatDateTime(analysis.createdAt)}
                          </time>
                        </TableCell>
                        <TableCell numeric tight>
                          <span className="inline-flex flex-wrap justify-end gap-1.5">
                            {analysis.requiredMissing > 0 ? (
                              <Badge tone="warning">
                                {analysis.requiredMissing} required{' '}
                                {pluralize(analysis.requiredMissing, 'gap')}
                              </Badge>
                            ) : null}
                            <Badge tone={bandTone(analysis.overallScore)}>
                              {analysis.overallScore} · {scoreBand(analysis.overallScore).label}
                            </Badge>
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={
                <TableCards>
                  {analyses.map((analysis) => (
                    <TableCard
                      key={analysis.id}
                      href={`/analysis/${analysis.id}`}
                      title={analysis.jobTitle}
                      meta={
                        <>
                          {analysis.company ? `${analysis.company} · ` : ''}
                          <time dateTime={analysis.createdAt.toISOString()}>
                            {formatDateTime(analysis.createdAt)}
                          </time>
                        </>
                      }
                      trailing={
                        <Badge tone={bandTone(analysis.overallScore)}>
                          {analysis.overallScore}
                        </Badge>
                      }
                      fields={[
                        { label: 'Strong', value: analysis.strong },
                        { label: 'Partial', value: analysis.partial },
                        { label: 'Missing', value: analysis.missing },
                      ]}
                    />
                  ))}
                </TableCards>
              }
            />
            <TableNote>{ScoreNote()}</TableNote>
          </Panel>
        )}
      </TabsContent>

      {/* ----------------------------------------------------------- runs */}
      <TabsContent value="runs">
        {runs.length === 0 ? (
          <EmptyTab>
            No optimization runs yet. Return to any run to review or change your decisions.
          </EmptyTab>
        ) : (
          <Panel flush>
            <ResponsiveTable
              table={
                <Table label="Optimization runs" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Role</TableHeaderCell>
                      <TableHeaderCell>Resume</TableHeaderCell>
                      <TableHeaderCell numeric tight>
                        Changes
                      </TableHeaderCell>
                      <TableHeaderCell tight>Engine</TableHeaderCell>
                      <TableHeaderCell tight>Run</TableHeaderCell>
                      <TableHeaderCell numeric tight>
                        Readiness
                      </TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.id} interactive>
                        <TableCell rowHeader>
                          <TableRowLink href={`/resume/${run.resumeId}?run=${run.id}`}>
                            {run.jobTitle}
                          </TableRowLink>
                          {run.company ? (
                            <span className="mt-0.5 block text-2xs text-fg-subtle">
                              {run.company}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <span className="block max-w-52 truncate">{run.resumeTitle}</span>
                        </TableCell>
                        <TableCell numeric tight>
                          {run.changeCount}
                        </TableCell>
                        <TableCell tight>
                          <span className="font-mono text-2xs">{run.provider}</span>
                        </TableCell>
                        <TableCell tight>
                          <time dateTime={run.createdAt.toISOString()}>
                            {formatDateTime(run.createdAt)}
                          </time>
                        </TableCell>
                        <TableCell numeric tight>
                          {run.status === 'succeeded' && run.projectedScore !== null ? (
                            /*
                              The movement, not the destination. A projected 74
                              means nothing on its own; 61 → 74 is the whole
                              point of the run.
                            */
                            <span className="whitespace-nowrap tabular-nums">
                              <span className="text-fg-subtle">{run.baselineScore}</span>
                              <span className="px-1 text-fg-disabled" aria-hidden="true">
                                →
                              </span>
                              <span className="font-medium text-fg">{run.projectedScore}</span>
                              <span className="sr-only"> projected, from {run.baselineScore}</span>
                            </span>
                          ) : (
                            <Badge tone={RUN_STATUS_TONE[run.status]}>{run.status}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={
                <TableCards>
                  {runs.map((run) => (
                    <TableCard
                      key={run.id}
                      href={`/resume/${run.resumeId}?run=${run.id}`}
                      title={run.jobTitle}
                      meta={
                        <>
                          {run.company ? `${run.company} · ` : ''}
                          <time dateTime={run.createdAt.toISOString()}>
                            {formatDateTime(run.createdAt)}
                          </time>
                        </>
                      }
                      trailing={
                        run.status === 'succeeded' && run.projectedScore !== null ? (
                          <Badge tone={bandTone(run.projectedScore)}>
                            {run.baselineScore} → {run.projectedScore}
                          </Badge>
                        ) : (
                          <Badge tone={RUN_STATUS_TONE[run.status]}>{run.status}</Badge>
                        )
                      }
                      fields={[
                        { label: 'Changes', value: run.changeCount },
                        { label: 'Engine', value: run.provider },
                      ]}
                    />
                  ))}
                </TableCards>
              }
            />
            <TableNote>{ScoreNote()}</TableNote>
          </Panel>
        )}
      </TabsContent>

      {/* ------------------------------------------------------ documents */}
      <TabsContent value="documents">
        {documents.length === 0 ? (
          <EmptyTab>
            No documents exported yet. Every PDF and DOCX you generate is kept here, private to your
            account.
          </EmptyTab>
        ) : (
          <Panel flush>
            <ResponsiveTable
              table={
                <Table label="Exported documents" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>File</TableHeaderCell>
                      <TableHeaderCell tight>Format</TableHeaderCell>
                      <TableHeaderCell numeric tight>
                        Size
                      </TableHeaderCell>
                      <TableHeaderCell tight>Generated</TableHeaderCell>
                      <TableHeaderCell tight srOnly>
                        Download
                      </TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {documents.map((document) => (
                      <TableRow key={document.id} interactive>
                        <TableCell rowHeader>
                          <span className="flex items-center gap-2.5">
                            <FileText
                              className="size-4 shrink-0 text-fg-subtle"
                              aria-hidden="true"
                            />
                            <span className="block max-w-72 truncate font-mono text-2xs">
                              {document.filename}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell tight>{document.kind.toUpperCase()}</TableCell>
                        <TableCell numeric tight>
                          {formatBytes(document.sizeBytes)}
                        </TableCell>
                        <TableCell tight>
                          <time dateTime={document.createdAt.toISOString()}>
                            {formatDateTime(document.createdAt)}
                          </time>
                        </TableCell>
                        <TableCell tight>
                          <Button variant="secondary" size="sm" asChild>
                            <a
                              href={`/api/documents/${document.id}/download`}
                              aria-label={`Download ${document.filename}`}
                            >
                              <Download className="size-3.5" aria-hidden="true" />
                              Download
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={
                <TableCards>
                  {documents.map((document) => (
                    <li key={document.id} className="px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-all font-mono text-2xs text-fg">
                            {document.filename}
                          </p>
                          <p className="mt-1 text-2xs text-fg-subtle">
                            {document.kind.toUpperCase()} · {formatBytes(document.sizeBytes)} ·{' '}
                            <time dateTime={document.createdAt.toISOString()}>
                              {formatDateTime(document.createdAt)}
                            </time>
                          </p>
                        </div>
                        <Button variant="secondary" size="sm" asChild className="shrink-0">
                          <a
                            href={`/api/documents/${document.id}/download`}
                            aria-label={`Download ${document.filename}`}
                          >
                            <Download className="size-3.5" aria-hidden="true" />
                            <span className="sr-only sm:not-sr-only">Download</span>
                          </a>
                        </Button>
                      </div>
                    </li>
                  ))}
                </TableCards>
              }
            />
            <TableNote>
              Both formats are single-column with selectable text, and were verified after
              generation by reading the text back out of the file.
            </TableNote>
          </Panel>
        )}
      </TabsContent>
    </Tabs>
  )
}

/** The disclaimer, rendered inside a table footer note. */
function ScoreNote() {
  return <ScoreDisclaimer className="text-2xs" />
}

function EmptyTab({ children }: { children: React.ReactNode }) {
  return (
    <Panel tone="sunken" className="px-5 py-10 text-center">
      <p className="mx-auto measure-tight text-meta leading-relaxed text-fg-muted">{children}</p>
    </Panel>
  )
}
