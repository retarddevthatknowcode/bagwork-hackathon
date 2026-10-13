"use client";

import * as React from "react";
import { HeatmapCalendar } from "@/components/heatmap-calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfileActivity } from "@/lib/profile/hooks";
import { cn } from "@/lib/utils";

/**
 * The contribution calendar in the Profile header.
 *
 * The grid, its cells, axis labels, tooltip plumbing and legend all come from the registry
 * component (`components/heatmap-calendar.tsx`, installed from
 * https://heatmap-shadcn.vercel.app/r/heatmap-calendar.json). Nothing here re-draws the
 * calendar; this file supplies only what is specific to Bagwork: the surface palette, the
 * intensity thresholds, the wording of a cell, and the loading state.
 *
 * One contribution = one submission activity (opt-in, post link, approval), aggregated by
 * `GET /api/profile/activity`.
 */

/**
 * Empty day first, then four steps of the brand lime. Translucent whites for the empty cell
 * and lime alphas for the steps, rather than fixed greys, so the ramp reads correctly on
 * whichever card it is dropped into.
 */
const PALETTE = [
  "rgba(255, 255, 255, 0.06)",
  "rgba(189, 254, 0, 0.22)",
  "rgba(189, 254, 0, 0.42)",
  "rgba(189, 254, 0, 0.68)",
  "#bdfe00",
];

/** 1-2 contributions is the first step, 3-4 the second, 5-6 the third, 7+ the brightest. */
const THRESHOLDS = [0, 2, 4, 6];

export function ProfileActivity({
  identifier,
  className,
}: {
  /** Any Bagworker, by handle or `Bagworker#number`. Omit for the signed-in user. */
  identifier?: string | number | null;
  className?: string;
}) {
  const { data, isPending, isError } = useProfileActivity(identifier);

  /*
   * The calendar lays its grid out from `new Date()` in the *browser's* timezone, so it is
   * mounted before it is drawn: rendered during SSR it would key every cell to the server's
   * timezone and hydrate onto different cells. The skeleton doubles as the loading state.
   */
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  /* `count` is this app's word for it; the calendar's field is `value`. Only days with
     activity are sent — every other cell renders as the empty level on its own. */
  const cells = React.useMemo(
    () => (data?.days ?? []).map((day) => ({ date: day.date, value: day.count })),
    [data]
  );

  if (!mounted || isPending) {
    return <Skeleton className={cn("h-[196px] w-full rounded-xl", className)} />;
  }

  if (isError || !data) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Activity is unavailable right now.
      </p>
    );
  }

  return (
    <HeatmapCalendar
      title="Contribution activity"
      data={cells}
      rangeDays={data.window.days}
      /* 53 weeks at 8px + 2px is ~530px, which is what keeps a whole year readable inside
         the header card; a narrower viewport scrolls the grid instead of squashing it. */
      cellSize={8}
      cellGap={2}
      palette={PALETTE}
      thresholds={THRESHOLDS}
      legend={{ placement: "bottom" }}
      /* Tighter than a standalone card, with no shadow: this one is a panel inside the
         profile header card, not a card beside it. */
      className={cn("gap-3 py-4 shadow-none", className)}
      renderTooltip={(cell) => (
        <div className="text-xs">
          <div className="font-medium">
            {cell.value === 1 ? "1 contribution" : `${cell.value} contributions`}
          </div>
          <div className="text-muted-foreground">{cell.label}</div>
        </div>
      )}
      /* The built-in legend plus the running total, on one line: "Less → More" on the right,
         the year's count on the left. */
      renderLegend={({ levelCount, palette, cellSize, cellGap }) => (
        <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{data.total}</span>{" "}
            {data.total === 1 ? "contribution" : "contributions"} in the last 12 months
          </span>
          <span className="flex items-center gap-1.5">
            <span>Less</span>
            <span className="flex items-center" style={{ gap: cellGap }}>
              {Array.from({ length: levelCount }).map((_, level) => (
                <span
                  key={level}
                  className="rounded-[3px]"
                  style={{
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: palette?.[level],
                  }}
                />
              ))}
            </span>
            <span>More</span>
          </span>
        </div>
      )}
    />
  );
}
