import type { Metadata } from 'next'
import Link from 'next/link'

import { eq } from 'drizzle-orm'
import { Cpu, Database, Lock, ShieldCheck } from 'lucide-react'

import { DangerZone } from '@/components/app/danger-zone'
import { EmailVerificationCard } from '@/components/app/email-verification-card'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Badge, Callout } from '@/components/ui/feedback'
import {
  DescriptionList,
  DescriptionRow,
  PageBody,
  PageHeader,
  Panel,
  Section,
  Stack,
} from '@/components/ui/layout'
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

      {/*
        `prose` width. At the content width a two-column definition list puts
        30cm of empty page between "Email" and the address next to it.
      */}
      <PageBody width="prose">
        <Stack gap="xl">
          {/* Only shown where the deployment can actually send the link. */}
          {emailIsConfigured() ? (
            <EmailVerificationCard email={user.email} verified={account?.emailVerifiedAt != null} />
          ) : null}

          {/* ------------------------------------------------------ account */}
          <Section title="Account" description="The account you are signed in as.">
            <DescriptionList>
              <DescriptionRow label="Email">
                <span className="break-all">{user.email}</span>
              </DescriptionRow>
              <DescriptionRow label="Name">
                {profile?.displayName ?? <span className="text-fg-subtle">Not set</span>}
              </DescriptionRow>
              <DescriptionRow label="Theme" hint="Follows your system setting by default">
                <ThemeToggle />
              </DescriptionRow>
            </DescriptionList>
          </Section>

          {/* ---------------------------------------------------- processing */}
          <Section
            title="How your data is processed"
            description="What this deployment is configured to do with your resume."
          >
            {/*
              Three callouts on the page ground, not three bordered boxes
              nested inside a bordered card. Each has its own icon, because
              these explain three specific things — an engine, a guarantee, a
              logging policy — and a generic info circle repeated three times
              says nothing at all.
            */}
            <Stack gap="sm">
              <Callout
                icon={<Cpu />}
                tone={capabilities.sendsDataToThirdParty ? 'warning' : 'success'}
                title="Optimization engine"
              >
                <span className="mb-1.5 block">
                  <Badge tone={capabilities.sendsDataToThirdParty ? 'warning' : 'success'}>
                    <span className="font-mono">{provider}</span>
                  </Badge>
                </span>
                {capabilities.sendsDataToThirdParty
                  ? 'Your resume text and the job description are sent to this provider to generate rewrite suggestions. Their terms and retention policy apply to that data.'
                  : 'Everything runs on this server. Your resume is not sent to any third-party AI provider. Terminology alignment, filler removal and relevance reordering are performed locally; sentence-level rewriting is not available in this mode.'}
              </Callout>

              <Callout icon={<ShieldCheck />} tone="success" title="Anti-fabrication is always on">
                Regardless of engine, every proposed change is verified against your original
                resume, and anything introducing a skill, metric or qualification you have not
                written is discarded before you see it.
              </Callout>

              <Callout icon={<Lock />} title="Logging">
                Resume text, job descriptions and contact details are never written to application
                logs. Read the{' '}
                <Link
                  href="/privacy"
                  className="focus-ring rounded text-fg-accent underline underline-offset-4"
                >
                  privacy policy
                </Link>{' '}
                for the full detail.
              </Callout>
            </Stack>
          </Section>

          {/* --------------------------------------------------- stored data */}
          <Section title="Your data" description="What is currently stored on this account.">
            {/*
              The tallies live here rather than on the dashboard.
              "You have 6 resumes" answers a question about what would be
              destroyed if you deleted the account, which is a real question
              and the one this page is for. It is not a thing to act on every
              morning, which is why it led the dashboard badly.
            */}
            <Panel flush>
              <DescriptionList className="px-4 sm:px-5">
                <DescriptionRow label="Resumes">
                  <span data-numeric>{stats.resumeCount}</span>
                </DescriptionRow>
                <DescriptionRow label="Analyses">
                  <span data-numeric>{stats.analysisCount}</span>
                </DescriptionRow>
                <DescriptionRow label="Optimization runs">
                  <span data-numeric>{stats.optimizationCount}</span>
                </DescriptionRow>
                <DescriptionRow label="Exported documents">
                  <span data-numeric>{stats.documentCount}</span>
                </DescriptionRow>
                <DescriptionRow label="Analytics">
                  {profile?.analyticsOptIn === false ? 'Disabled' : 'Enabled'}
                </DescriptionRow>
              </DescriptionList>
            </Panel>

            <p className="mt-3 flex items-start gap-2 text-2xs leading-relaxed text-fg-subtle">
              <Database className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                {PRODUCT.name} never sends resume content to an analytics provider — only event
                names such as &ldquo;optimization_completed&rdquo;.
              </span>
            </p>
          </Section>

          {/* --------------------------------------------------------- danger */}
          <Section
            title="Delete your account"
            description="Remove everything, permanently. There is no recovery and no grace period."
          >
            <DangerZone email={user.email} />
          </Section>
        </Stack>
      </PageBody>
    </>
  )
}
