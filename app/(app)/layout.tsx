import { redirect } from 'next/navigation'

import { AppShell } from '@/components/app/app-shell'
import { getCurrentUser } from '@/server/auth/service'
import { getDb } from '@/server/db/client'
import { profiles } from '@/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

/**
 * Authenticated layout.
 *
 * The session check happens here rather than in middleware because it needs a
 * database round trip (the session epoch must match the stored one, so a
 * revoked token stops working immediately). Middleware runs on the edge and
 * cannot reach the database, and a signature-only check there would let a
 * revoked session through until its expiry.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const profile = await getDb().query.profiles.findFirst({
    where: eq(profiles.userId, user.userId),
    columns: { displayName: true },
  })

  return (
    <AppShell user={{ email: user.email, displayName: profile?.displayName ?? null }}>
      {children}
    </AppShell>
  )
}
