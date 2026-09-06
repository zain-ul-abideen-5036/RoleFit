import Link from 'next/link'

import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo />
      <p className="mt-10 text-sm font-semibold uppercase tracking-wider text-fg-subtle">404</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-fg">
        We could not find that page
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-fg-muted">
        The link may be out of date, or the item may belong to a different account.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  )
}
