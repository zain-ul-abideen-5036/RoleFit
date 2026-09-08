import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { VerifyEmailStatus } from '@/components/auth/verify-email-status'
import { emailIsConfigured } from '@/lib/email'

export const metadata: Metadata = {
  title: 'Confirm your email',
  description: 'Confirm your email address.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  if (!emailIsConfigured()) notFound()

  const { token } = await searchParams
  return <VerifyEmailStatus token={token ?? ''} />
}
