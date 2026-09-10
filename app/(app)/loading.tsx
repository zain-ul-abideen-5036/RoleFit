import { Skeleton } from '@/components/ui/feedback'

/**
 * Route-level loading state for the app section.
 *
 * Mirrors the shape of the header band and the first two regions beneath it,
 * so the transition does not shift layout when the real content arrives. It
 * used to draw four tiles and two tall cards — a shape no screen in the
 * product has any more, so every navigation reflowed the moment it resolved.
 *
 * Deliberately generic beyond the header: this is the fallback for six routes
 * with different bodies, and a skeleton that guesses one of them precisely is
 * wrong for the other five. The routes worth a bespoke skeleton have their own
 * `loading.tsx`.
 */
export default function AppLoading() {
  return (
    <div>
      <div className="border-b border-line bg-surface">
        <div className="container-app py-5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2.5 h-4 w-80 max-w-full" />
        </div>
      </div>

      <div className="container-app py-6 sm:py-8">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="mt-8 h-6 w-40" />
        <div className="mt-4 flex flex-col gap-px">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-11 rounded-none" />
          ))}
        </div>
      </div>

      <span className="sr-only" role="status">
        Loading
      </span>
    </div>
  )
}
