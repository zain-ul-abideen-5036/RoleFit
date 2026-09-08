import type { Metadata } from 'next'
import Link from 'next/link'

import { eq } from 'drizzle-orm'
import { Cpu, Database, Lock, ShieldCheck } from 'lucide-react'

import { PageBody, PageHeader } from '@/components/app/app-shell'
import { DangerZone } from '@/components/app/danger-zone'
import { EmailVerificationCard } from '@/components/app/email-verification-card'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/feedback'
import { profiles, users } from '@/db/schema'
import { activeCapabilities, activeProviderName } from '@/lib/ai'
import { emailIsConfigured } from '@/lib/email'
import { PRODUCT } from '@/lib/constants'
import { requirePageUser } from '@/server/auth/service'
import { getDashboardStats } from '@/server/repositories'
import { getDb } from '@/server/db/client'

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const user = await requirePageUser()

  const [profile, stats, account] = await Promise.all([
    getDb().query.profiles.findFirst({
      where: eq(profiles.userId, user.userId),
      columns: { displayName: true, analyticsOptIn: true },
    }),
    getDashboardStats(user.userId),
    getDb().query.users.findFirst({
      where: eq(users.id, user.userId),
      columns: { emailVerifiedAt: true },
    }),
  ])

  const provider = activeProviderName()
  const capabilities = activeCapabilities()

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your account, how your data is handled, and how to delete it."
      />

      <PageBody className="flex max-w-3xl flex-col gap-6">
        {/* Only shown where the deployment can actually send the link. */}
        {emailIsConfigured() ? (
          <EmailVerificationCard email={user.email} verified={account?.emailVerifiedAt != null} />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle as="h2">Profile</CardTitle>
            <CardDescription>The account you are signed in as.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col divide-y divide-line">
              <Row label="Email" value={user.email} />
              <Row label="Name" value={profile?.displayName ?? 'Not set'} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Appearance</CardTitle>
            <CardDescription>
              Follows your system setting unless you choose otherwise.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">How your data is processed</CardTitle>
            <CardDescription>
              What this deployment is configured to do with your resume.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-line bg-canvas p-4">
              <Cpu className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-fg">Optimization engine</p>
                  <Badge tone={capabilities.sendsDataToThirdParty ? 'warning' : 'success'}>
                    {provider}
                  </Badge>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                  {capabilities.sendsDataToThirdParty
                    ? 'Your resume text and the job description are sent to this provider to generate rewrite suggestions. Their terms and retention policy apply to that data.'
                    : 'Everything runs on this server. Your resume is not sent to any third-party AI provider. Terminology alignment, filler removal and relevance reordering are performed locally; sentence-level rewriting is not available in this mode.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-line bg-canvas p-4">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0 text-success-solid"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold text-fg">Anti-fabrication is always on</p>
                <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                  Regardless of engine, every proposed change is verified against your original
                  resume, and anything introducing a skill, metric or qualification you have not
                  written is discarded before you see it.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-line bg-canvas p-4">
              <Lock className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-fg">Logging</p>
                <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                  Resume text, job descriptions and contact details are never written to application
                  logs. Read the{' '}
                  <Link href="/privacy" className="text-fg-accent underline underline-offset-4">
                    privacy policy
                  </Link>{' '}
                  for the full detail.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Your data</CardTitle>
            <CardDescription>What is currently stored on this account.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Resumes" value={stats.resumeCount} />
              <Stat label="Analyses" value={stats.analysisCount} />
              <Stat label="Optimizations" value={stats.optimizationCount} />
              <Stat label="Documents" value={stats.documentCount} />
            </dl>
            <p className="mt-4 flex items-start gap-2 text-xs text-fg-subtle">
              <Database className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Analytics are {profile?.analyticsOptIn === false ? 'disabled' : 'enabled'} for this
              account. {PRODUCT.name} never sends resume content to an analytics provider — only
              event names such as &ldquo;optimization_completed&rdquo;.
            </p>
          </CardContent>
        </Card>

        <Card className="border-danger-line">
          <CardHeader>
            <CardTitle as="h2">Delete your account</CardTitle>
            <CardDescription>Remove everything, permanently.</CardDescription>
          </CardHeader>
          <CardContent>
            <DangerZone email={user.email} />
          </CardContent>
        </Card>
      </PageBody>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="truncate text-sm font-medium text-fg">{value}</dd>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-canvas px-3 py-2.5">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="text-xl font-bold tabular-nums text-fg">{value}</dd>
    </div>
  )
}
