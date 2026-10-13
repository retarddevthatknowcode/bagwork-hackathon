import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading state for every console page.
 *
 * Rendered inside `dashboard/layout.tsx`, so the sidebar and top bar are already on screen when
 * this appears — it only fills the content area a navigation is still fetching. It existed as
 * nothing before, which meant a slow navigation showed the previous page until the new one was
 * ready; a skeleton that matches the usual page shape (title, KPI row, panel) is a much smaller
 * lie than that.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
