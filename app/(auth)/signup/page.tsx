import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AuthForm } from '@/components/auth/auth-form'
import { getCurrentUser } from '@/server/auth/service'

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create a free RoleFit account and tailor your resume to a specific role.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function SignupPage() {
  if (await getCurrentUser()) redirect('/dashboard')
  return <AuthForm mode="signup" />
}
