import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { RequestResetForm } from '@/components/auth/request-reset-form'
import { emailIsConfigured } from '@/lib/email'

export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Request a password reset link.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function ForgotPasswordPage() {
  // A deployment with EMAIL_PROVIDER=none has no way to send the link, so the
  // page does not exist rather than offering a form that cannot work.
  if (!emailIsConfigured()) notFound()
  return <RequestResetForm />
}
