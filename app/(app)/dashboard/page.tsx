import type { Metadata } from 'next'
import Link from 'next/link'

import { ArrowRight, FileText, Sparkles, Upload } from 'lucide-react'

import { PageBody, PageHeader } from '@/components/app/app-shell'
import { Button } from '@/components/ui/button'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { ScoreDisclaimer } from '@/components/ui/score'
import { scoreBand } from '@/lib/constants'
import { cn, formatRelative, pluralize } from '@/lib/utils'
import { requirePageUser } from '@/server/auth/service'
import {
  getDashboardStats,
  listAnalyses,
  listOptimizationRuns,
  listResumes,
} from '@/server/repositories'

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await requirePageUser()

  const [stats, resumes, analyses, runs] = await Promise.all([
    getDashboardStats(user.userId),
    listResumes(user.userId, 5),
    listAnalyses(user.userId, 5),
    listOptimizationRuns(user.userId, 5),
  ])

  const isNewAccount = stats.resumeCount === 0
  const latestResume = resumes[0] ?? null

  const readinessTone =
    stats.averageScore === null
      ? 'text-fg'
      : scoreBand(stats.averageScore).tone === 'success'
        ? 'text-success-fg'
        : scoreBand(stats.averageScore).tone === 'warning'
          ? 'text-warning-fg'
          : 'text-danger-fg'

  /**
   * Analyses and runs merged into one chronology.
   *
   * Built here rather than in the repository layer: this is a presentation
   * decision about one screen, and the two queries are still the same two
   * queries. Nothing about what is fetched has changed.
   */
  const activity = [
    ...analyses.map((analysis) => {
      const band = scoreBand(analysis.overallScore)
      return {
        key: `analysis-${analysis.id}`,
        kindLabel: 'Analysis',
        href: `/analysis/${analysis.id}`,
        createdAt: analysis.createdAt,
        label: `${analysis.report.counts.strong} strong, ${analysis.report.counts.missing} missing`,
        trailing: (
          <Badge
            tone={
              band.tone === 'success' ? 'success' : band.tone === 'warning' ? 'warning' : 'danger'
            }
          >
            {analysis.overallScore} · {band.label}
          </Badge>
        ),
      }
    }),
    ...runs.map((run) => {
      const count = run.changeSet?.changes.length ?? 0
      return {
        key: `run-${run.id}`,
        kindLabel: 'Optimized',
        href: `/resume/${run.resumeId}?run=${run.id}`,
        createdAt: run.createdAt,
        label: `${count} ${pluralize(count, 'change')} proposed`,
        trailing:
          run.projectedScore !== null ? (
            <Badge tone="accent">{run.projectedScore} projected</Badge>
          ) : (
            <Badge tone="neutral">{run.status}</Badge>
          ),
      }
    }),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8)

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          isNewAccount
            ? 'Upload a resume and a job description to see where you stand.'
            : 'Your resumes, analyses and optimization runs.'
        }
        actions={
          /*
            Hidden from `lg` up, where the sidebar already carries this exact
            button. Both were on screen at once: the same label, the same icon,
            the same destination, 30cm apart. Below `lg` the sidebar is behind
            the drawer, so here it is the only way to start a run and it stays.
          */
          <Button className="lg:hidden" asChild>
            <Link href="/optimize">
              <Sparkles className="size-4" aria-hidden="true" />
              New optimization
            </Link>
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-6">
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
          <>
            {/*
              What to do next, before what has been done.

              This page opened with four counts — resumes, analyses,
              optimizations, average readiness — in four equal cells. Three of
              them are numbers that go up and never inform a decision: knowing
              you have uploaded six resumes does not tell you anything you would
              act on. They led the page because they are easy to render, not
              because anyone needed them.

              What a returning user arrives wanting is the next run. So that is
              the top of the page, with the readiness figure beside it — the one
              number here that is a judgement rather than a tally.
            */}
            <section
              aria-label="Start"
              className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-[1fr_auto]"
            >
              <div className="bg-surface p-6 sm:p-7">
                <h2 className="font-display text-xl font-medium tracking-tight text-fg">
                  Optimize a resume for a role
                </h2>
                <p className="mt-1.5 max-w-md text-sm leading-relaxed text-fg-muted">
                  Paste a job description and RoleFit shows you where you match before it rewrites
                  anything.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Button asChild>
                    <Link href="/optimize">
                      <Sparkles className="size-4" aria-hidden="true" />
                      New optimization
                    </Link>
                  </Button>
                  {latestResume ? (
                    <Button variant="secondary" asChild>
                      <Link href={`/resume/${latestResume.id}`}>
                        Open {latestResume.title}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>

              {/*
                Readiness in its own cell rather than in a row of four, because
                it is the only figure on this page that is a verdict.
              */}
              <div className="flex flex-col justify-center bg-surface p-6 sm:min-w-52 sm:p-7">
                <p className="text-2xs font-medium uppercase tracking-[0.08em] text-fg-subtle">
                  Average readiness
                </p>
                <p
                  className={cn(
                    'mt-2 font-display text-display-md tabular-nums',
                    stats.averageScore === null ? 'text-fg-disabled' : readinessTone,
                  )}
                >
                  {stats.averageScore === null ? '—' : stats.averageScore}
                </p>
                <p className="mt-1.5 text-xs text-fg-subtle">
                  {stats.averageScore === null
                    ? 'no analyses yet'
                    : `${scoreBand(stats.averageScore).label.toLowerCase()} · ${stats.analysisCount} ${pluralize(stats.analysisCount, 'analysis', 'analyses')}`}
                </p>
              </div>
            </section>

            <ScoreDisclaimer />

            {/*
              One activity stream, not two parallel cards.

              Analyses and optimization runs were listed side by side under
              separate headings, which asks the reader to merge two chronologies
              in their head to answer "what was I last doing". They are steps in
              one workflow, so they read as one list, newest first, each row
              saying which kind of thing it was.
            */}
            <SectionRule title="Recent activity" action={{ href: '/history', label: 'View all' }} />
            {activity.length === 0 ? (
              <p className="text-sm text-fg-muted">
                Nothing yet. Your analyses and optimization runs will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-line border-b border-line">
                {activity.map((entry) => (
                  <li key={entry.key}>
                    <Link
                      href={entry.href}
                      className="flex items-center justify-between gap-4 py-3.5 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <span className="w-20 shrink-0 text-2xs font-medium uppercase tracking-[0.08em] text-fg-subtle">
                          {entry.kindLabel}
                        </span>
                        <p className="truncate text-sm text-fg">{entry.label}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <span className="text-xs tabular-nums text-fg-subtle">
                          {formatRelative(entry.createdAt)}
                        </span>
                        <span className="w-28 text-right">{entry.trailing}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {/*
              Resumes as rows, not a three-column grid of bordered tiles. A
              resume has a name and a date; a tile forces that into a box with
              an icon and a format pill, and gives it the weight of a feature.
            */}
            <SectionRule title="Your resumes" action={{ href: '/optimize', label: 'Upload' }} />
            <ul className="divide-y divide-line border-b border-line">
              {resumes.map((resume) => (
                <li key={resume.id}>
                  <Link
                    href={`/resume/${resume.id}`}
                    className="flex items-center justify-between gap-4 py-3.5 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                      <p className="truncate text-sm text-fg">{resume.title}</p>
                    </div>
                    <p className="shrink-0 text-xs text-fg-subtle">
                      {resume.sourceFormat.toUpperCase()} · {resume.profile.experience.length}{' '}
                      {pluralize(resume.profile.experience.length, 'role')} ·{' '}
                      {formatRelative(resume.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </PageBody>
    </>
  )
}

/**
 * A section boundary: a label, a rule, and at most one action.
 *
 * Replaces the CardHeader each of these sections used to sit inside. A card
 * around a list of links adds a border, a shadow and 24px of padding to state
 * a grouping that a heading and a hairline already state — and once every
 * section on a page is a card, the page has no emphasis left to spend on the
 * one thing that matters.
 */
function SectionRule({
  title,
  action,
}: {
  title: string
  action?: { href: string; label: string }
}) {
  return (
    <div className="mt-2 flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
      <h2 className="font-display text-title font-medium tracking-tight text-fg">{title}</h2>
      {action ? (
        <Link
          href={action.href}
          className="rounded text-sm text-fg-accent transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}
