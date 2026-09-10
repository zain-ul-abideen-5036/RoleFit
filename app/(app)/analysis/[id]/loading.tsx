import { Skeleton } from '@/components/ui/feedback'

/**
 * The analysis screen's own skeleton.
 *
 * Worth a bespoke one because this route is the slowest in the product — it
 * reads a resume, a job description and a report — and because its body is a
 * distinctive two-column band that the generic skeleton would misdraw badly
 * enough to cause a visible jump.
 */
export default function AnalysisLoading() {
  return (
    <div>
      <div className="border-b border-line bg-surface">
        <div className="container-app py-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-7 w-72 max-w-full" />
          <Skeleton className="mt-2.5 h-4 w-96 max-w-full" />
        </div>
      </div>

      <div className="container-app py-6 sm:py-8">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-5">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
        <Skeleton className="mt-8 h-9 w-full max-w-lg" />
        <Skeleton className="mt-5 h-64 rounded-xl" />
      </div>

      <span className="sr-only" role="status">
        Loading the analysis
      </span>
    </div>
  )
}
