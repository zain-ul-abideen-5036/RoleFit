import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AuthForm } from '@/components/auth/auth-form'
import { emailIsConfigured } from '@/lib/email'
import { getCurrentUser } from '@/server/auth/service'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your RoleFit account.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>
}) {
  // Already signed in: send them where they were going.
  if (await getCurrentUser()) redirect('/dashboard')

  const { reset } = await searchParams

  return <AuthForm mode="login" recoveryEnabled={emailIsConfigured()} justReset={reset === '1'} />
}
