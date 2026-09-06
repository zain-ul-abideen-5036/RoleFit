import { Skeleton } from '@/components/ui/feedback'

/**
 * Route-level loading state for the app section.
 *
 * Mirrors the shape of the page underneath (header band, then cards) so the
 * transition does not shift layout when the real content arrives.
 */
export default function AppLoading() {
  return (
    <div>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>

      <span className="sr-only" role="status">
        Loading
      </span>
    </div>
  )
}
