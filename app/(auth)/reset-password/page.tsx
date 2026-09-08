import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { emailIsConfigured } from '@/lib/email'

export const metadata: Metadata = {
  title: 'Choose a new password',
  description: 'Set a new password for your account.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  if (!emailIsConfigured()) notFound()

  const { token } = await searchParams
  return <ResetPasswordForm token={token ?? ''} />
}
