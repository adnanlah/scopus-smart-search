import { Skeleton } from '@/components/ui/skeleton';

export const PaperRowSkeleton = () => (
  <article className="px-4 py-6 sm:px-7">
    <Skeleton className="h-7 w-11/12" />
    <Skeleton className="mt-3 h-4 w-2/5" />
    <div className="mt-5 space-y-3">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-3/5" />
    </div>
    <div className="mt-5 flex justify-end gap-2">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-8 w-24" />
    </div>
  </article>
);