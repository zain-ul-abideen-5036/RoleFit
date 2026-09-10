import type { Metadata } from 'next'
import Link from 'next/link'

import { ArrowRight, FileText, Sparkles, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { PageBody, PageHeader, Panel, Section, SectionLink, Stack } from '@/components/ui/layout'
import { InfoTip, TooltipProvider } from '@/components/ui/menu'
import { ScoreDisclaimer } from '@/components/ui/score'
import { Stat, StatDelta, StatRow } from '@/components/ui/stat'
import {
  ResponsiveTable,
  Table,
  TableBody,
  TableCard,
  TableCards,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableRowLink,
} from '@/components/ui/table'
import { scoreBand } from '@/lib/constants'
import { formatRelative, pluralize } from '@/lib/utils'
import { requirePageUser } from '@/server/auth/service'
import {
  getDashboardStats,
  listAnalysesWithContext,
  listOptimizationRunsWithContext,
  listResumes,
} from '@/server/repositories'

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/** Maps a score band's tone onto the tokens the presentation components take. */
function bandTone(score: number): 'success' | 'warning' | 'danger' {
  const { tone } = scoreBand(score)
  return tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'danger'
}

export default async function DashboardPage() {
  const user = await requirePageUser()

  const [stats, resumes, analyses, runs] = await Promise.all([
    getDashboardStats(user.userId),
    listResumes(user.userId, 6),
    listAnalysesWithContext(user.userId, 6),
    listOptimizationRunsWithContext(user.userId, 6),
  ])

  const isNewAccount = stats.resumeCount === 0
  const latestResume = resumes[0] ?? null

  /*
   * The three figures this page leads with.
   *
   * It used to lead with four counts — resumes, analyses, optimizations,
   * average readiness — in four equal cells. Three of those are numbers that
   * go up and never inform a decision: knowing you have uploaded six resumes
   * does not tell you anything you would act on. They led the page because
   * they were the easiest thing to render.
   *
   * Every figure below is either a verdict or a thing to do next. The tallies
   * moved to Settings, under "what is stored on this account", which is the
   * one place they answer a real question.
   */
  const latest = analyses[0] ?? null
  const previous = analyses[1] ?? null
  const latestRun = runs.find((run) => run.status === 'succeeded' && run.projectedScore !== null)

  const readinessDelta = latest && previous ? latest.overallScore - previous.overallScore : null
  const requiredGaps = latest?.report.counts.requiredMissing ?? 0
  const projectedGain = latestRun?.projectedScore
    ? latestRun.projectedScore - latestRun.baselineScore
    : null

  /**
   * Analyses and runs merged into one chronology.
   *
   * They were listed side by side under separate headings, which asks the
   * reader to merge two chronologies in their head to answer "what was I last
   * doing". They are consecutive steps in one workflow, so they read as one
   * list, newest first, each row saying which kind of thing it was — and,
   * now, which role it was for.
   */
  const activity = [
    ...analyses.map((analysis) => ({
      key: `analysis-${analysis.id}`,
      kind: 'Analysis' as const,
      href: `/analysis/${analysis.id}`,
      createdAt: analysis.createdAt,
      role: analysis.jobTitle,
      company: analysis.company,
      resumeTitle: analysis.resumeTitle,
      detail: `${analysis.report.counts.strong} strong · ${analysis.report.counts.missing} missing`,
      score: analysis.overallScore,
      scoreLabel: `${analysis.overallScore} · ${scoreBand(analysis.overallScore).label}`,
      tone: bandTone(analysis.overallScore),
    })),
    ...runs.map((run) => ({
      key: `run-${run.id}`,
      kind: 'Optimization' as const,
      href: `/resume/${run.resumeId}?run=${run.id}`,
      createdAt: run.createdAt,
      role: run.jobTitle,
      company: run.company,
      resumeTitle: run.resumeTitle,
      detail: `${run.changeCount} ${pluralize(run.changeCount, 'change')} proposed`,
      score: run.projectedScore,
      scoreLabel: run.projectedScore !== null ? `${run.projectedScore} projected` : run.status,
      tone:
        run.projectedScore !== null
          ? bandTone(run.projectedScore)
          : run.status === 'failed'
            ? ('danger' as const)
            : ('neutral' as const),
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8)

  return (
    <TooltipProvider>
      <PageHeader
        title="Dashboard"
        description={
          isNewAccount
            ? 'Upload a resume and a job description to see where you stand.'
            : 'Where your applications stand, and what to do next.'
        }
        /*
          No header action.

          The sidebar carries "New optimization" from `md` up, and the panel
          immediately below this header carries it at every width — as does the
          empty state, on a new account. A header button would be the third
          copy of one destination on one screen, which is the same duplication
          this header used to have with the sidebar at desktop widths.
        */
      />

      <PageBody>
        {isNewAccount ? (
          <EmptyState
            icon={<Upload className="size-5" />}
            title="Upload your first resume to get started"
            description="RoleFit reads your resume and a job description, shows you exactly where you match, and rewrites what you already have to fit the role."
            action={
              <Button size="lg" asChild>
                <Link href="/optimize">
                  Start an optimization
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            }
          />
        ) : (
          <Stack gap="lg">
            {/* ------------------------------------------------- continue */}
            <Panel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-title font-semibold text-fg">Optimize a resume for a role</h2>
                <p className="mt-1 measure text-meta leading-relaxed text-fg-muted">
                  Paste a job description and RoleFit shows you where you match before it rewrites
                  anything.
                </p>
              </div>
              {/*
                Full width when stacked, natural width when in a row. Two
                content-width buttons stacked on a phone are two different
                widths, which reads as an accident rather than a pair.
              */}
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Button className="w-full sm:w-auto" asChild>
                  <Link href="/optimize">
                    <Sparkles className="size-4" aria-hidden="true" />
                    New optimization
                  </Link>
                </Button>
                {latestResume ? (
                  <Button variant="secondary" className="w-full sm:w-auto" asChild>
                    <Link href={`/resume/${latestResume.id}`}>
                      <span className="max-w-56 truncate">Open {latestResume.title}</span>
                    </Link>
                  </Button>
                ) : null}
              </div>
            </Panel>

            {/* -------------------------------------------------- figures */}
            <div>
              <StatRow columns={3}>
                <Stat
                  label="Latest readiness"
                  value={latest ? latest.overallScore : '—'}
                  tone={latest ? bandTone(latest.overallScore) : 'muted'}
                  annotation={
                    <InfoTip label="What the readiness estimate measures">
                      An estimate of ATS compatibility from your most recent analysis, computed
                      deterministically from formatting and job-description alignment. Not a score
                      any real ATS produces.
                    </InfoTip>
                  }
                  detail={
                    latest ? (
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>{scoreBand(latest.overallScore).label.toLowerCase()}</span>
                        {readinessDelta !== null ? (
                          <StatDelta value={readinessDelta} suffix="vs previous" />
                        ) : null}
                      </span>
                    ) : (
                      'no analyses yet'
                    )
                  }
                />
                <Stat
                  label="Required gaps"
                  value={latest ? requiredGaps : '—'}
                  tone={!latest ? 'muted' : requiredGaps === 0 ? 'success' : 'warning'}
                  annotation={
                    <InfoTip label="What a required gap means">
                      Requirements the posting states as required that your resume does not
                      evidence. RoleFit will not write these in — they are listed so you know where
                      the gap is.
                    </InfoTip>
                  }
                  detail={
                    latest ? (
                      <Link
                        href={`/analysis/${latest.id}`}
                        className="focus-ring rounded text-fg-accent transition-colors hover:text-fg"
                      >
                        {requiredGaps === 0
                          ? 'all required items evidenced'
                          : `in ${latest.jobTitle}`}
                      </Link>
                    ) : (
                      'run an analysis to see'
                    )
                  }
                />
                <Stat
                  label="Projected movement"
                  value={
                    projectedGain === null ? '—' : `${projectedGain > 0 ? '+' : ''}${projectedGain}`
                  }
                  tone={
                    projectedGain === null
                      ? 'muted'
                      : projectedGain > 0
                        ? 'success'
                        : projectedGain < 0
                          ? 'danger'
                          : 'default'
                  }
                  annotation={
                    <InfoTip label="What projected movement means">
                      The change in the readiness estimate if every proposed rewrite in your most
                      recent run is accepted. Rejecting changes lowers it.
                    </InfoTip>
                  }
                  detail={
                    latestRun ? (
                      <Link
                        href={`/resume/${latestRun.resumeId}?run=${latestRun.id}`}
                        className="focus-ring rounded text-fg-accent transition-colors hover:text-fg"
                      >
                        {latestRun.baselineScore} → {latestRun.projectedScore} in review
                      </Link>
                    ) : (
                      'no optimization run yet'
                    )
                  }
                />
              </StatRow>
              <ScoreDisclaimer className="mt-2.5" />
            </div>

            {/* ------------------------------------------------- activity */}
            <Section
              title="Recent activity"
              actions={<SectionLink href="/history">View all</SectionLink>}
            >
              {activity.length === 0 ? (
                <p className="py-3 text-meta text-fg-muted">
                  Nothing yet. Your analyses and optimization runs will appear here.
                </p>
              ) : (
                <ResponsiveTable
                  table={
                    <Table label="Recent analyses and optimization runs">
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>Role</TableHeaderCell>
                          <TableHeaderCell tight>Step</TableHeaderCell>
                          <TableHeaderCell>Result</TableHeaderCell>
                          <TableHeaderCell tight>When</TableHeaderCell>
                          <TableHeaderCell numeric tight>
                            Readiness
                          </TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {activity.map((entry) => (
                          <TableRow key={entry.key} interactive>
                            <TableCell rowHeader>
                              <TableRowLink href={entry.href}>{entry.role}</TableRowLink>
                              {entry.company ? (
                                <span className="mt-0.5 block text-2xs text-fg-subtle">
                                  {entry.company}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell tight>
                              <span className="eyebrow text-fg-subtle">{entry.kind}</span>
                            </TableCell>
                            <TableCell>{entry.detail}</TableCell>
                            <TableCell tight>
                              <time dateTime={entry.createdAt.toISOString()}>
                                {formatRelative(entry.createdAt)}
                              </time>
                            </TableCell>
                            <TableCell numeric tight>
                              <Badge tone={entry.tone}>{entry.scoreLabel}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  }
                  cards={
                    <TableCards>
                      {activity.map((entry) => (
                        <TableCard
                          key={entry.key}
                          href={entry.href}
                          title={entry.role}
                          meta={
                            <>
                              {entry.kind} ·{' '}
                              <time dateTime={entry.createdAt.toISOString()}>
                                {formatRelative(entry.createdAt)}
                              </time>
                            </>
                          }
                          trailing={<Badge tone={entry.tone}>{entry.scoreLabel}</Badge>}
                          fields={[{ label: 'Result', value: entry.detail }]}
                        />
                      ))}
                    </TableCards>
                  }
                />
              )}
            </Section>

            {/* -------------------------------------------------- resumes */}
            <Section
              title="Your resumes"
              actions={<SectionLink href="/optimize">Upload</SectionLink>}
            >
              <ResponsiveTable
                table={
                  <Table label="Your uploaded resumes">
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Resume</TableHeaderCell>
                        <TableHeaderCell tight>Format</TableHeaderCell>
                        <TableHeaderCell numeric tight>
                          Roles
                        </TableHeaderCell>
                        <TableHeaderCell numeric tight>
                          Skills
                        </TableHeaderCell>
                        <TableHeaderCell tight>Uploaded</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {resumes.map((resume) => (
                        <TableRow key={resume.id} interactive>
                          <TableCell rowHeader>
                            <span className="flex items-center gap-2.5">
                              <FileText
                                className="size-4 shrink-0 text-fg-subtle"
                                aria-hidden="true"
                              />
                              <TableRowLink href={`/resume/${resume.id}`}>
                                {resume.title}
                              </TableRowLink>
                            </span>
                          </TableCell>
                          <TableCell tight>{resume.sourceFormat.toUpperCase()}</TableCell>
                          <TableCell numeric tight>
                            {resume.profile.experience.length}
                          </TableCell>
                          <TableCell numeric tight>
                            {resume.profile.skills.reduce(
                              (sum, group) => sum + group.items.length,
                              0,
                            )}
                          </TableCell>
                          <TableCell tight>
                            <time dateTime={resume.createdAt.toISOString()}>
                              {formatRelative(resume.createdAt)}
                            </time>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                }
                cards={
                  <TableCards>
                    {resumes.map((resume) => (
                      <TableCard
                        key={resume.id}
                        href={`/resume/${resume.id}`}
                        title={resume.title}
                        meta={
                          <>
                            {resume.sourceFormat.toUpperCase()} ·{' '}
                            <time dateTime={resume.createdAt.toISOString()}>
                              {formatRelative(resume.createdAt)}
                            </time>
                          </>
                        }
                        fields={[
                          { label: 'Roles', value: resume.profile.experience.length },
                          {
                            label: 'Skills',
                            value: resume.profile.skills.reduce(
                              (sum, group) => sum + group.items.length,
                              0,
                            ),
                          },
                        ]}
                      />
                    ))}
                  </TableCards>
                }
              />
            </Section>
          </Stack>
        )}
      </PageBody>
    </TooltipProvider>
  )
}
