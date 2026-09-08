import 'server-only'

import { getEnv } from '@/lib/config/env'
import { createConsoleTransport } from '@/lib/email/console'
import { createResendTransport } from '@/lib/email/resend'
import type { EmailProviderName, EmailTransport } from '@/lib/email/types'

/**
 * Email transport factory.
 *
 * Returns `null` when `EMAIL_PROVIDER=none`, which is the default and not an
 * error: RoleFit is fully usable without email. Callers branch on the null and
 * the UI stops offering the flows that need it, rather than presenting a
 * "reset your password" link that silently does nothing.
 */

let cached: EmailTransport | null | undefined

export function getEmailTransport(): EmailTransport | null {
  if (cached !== undefined) return cached

  const env = getEnv()

  switch (env.EMAIL_PROVIDER) {
    case 'none':
      cached = null
      break

    case 'console':
      cached = createConsoleTransport()
      break

    case 'resend':
      cached = createResendTransport({
        // Both validated non-empty by the env schema for this provider.
        apiKey: env.EMAIL_API_KEY!,
        from: env.EMAIL_FROM!,
      })
      break
  }

  return cached ?? null
}

/** Whether the verification and reset flows are available in this deployment. */
export function emailIsConfigured(): boolean {
  return getEmailTransport() !== null
}

/** Test-only: clears the memoised transport between cases. */
export function resetEmailTransportCache(): void {
  cached = undefined
}

export type { EmailTransport, EmailProviderName }
