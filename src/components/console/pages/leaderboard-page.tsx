"use client";

import Link from "next/link";
import * as React from "react";
import { Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BagworkerTag, ProfileAvatar, formatPoints } from "@/components/console/identity";
import { LeaderboardPodium } from "@/components/console/leaderboard-podium";
import { EmptyState, ErrorState, PageHeader, SectionCard } from "@/components/console/ui";
import { useConsoleLeaderboard, type LeaderboardEntry } from "@/lib/console/hooks";
import { bagworkerHref } from "@/lib/profile/href";
import {
  DEFAULT_LEADERBOARD_RANGE,
  LEADERBOARD_RANGE_META,
  isLeaderboardRange,
  leaderboardRangeMeta,
  type LeaderboardRange,
} from "@/lib/leaderboard-ranges";
import { cn } from "@/lib/utils";

/**
 * The leaderboard.
 *
 * Ranked purely on Points, so the page is a straight read of the progression system: 33 points
 * for every $1 that actually settled. Nothing here is gated and nothing is editable — the only
 * way up this board is to get work approved and paid for.
 *
 * Layout order is deliberate: filters, then the podium (ranks 1–3, the loud part), then the long
 * list from rank 4 down. The podium is the only thing on the page competing for attention,
 * which is what makes it read as a prize rather than as three more cards.
 */
export function Leaderboard() {
  /**
   * The filter lives in the URL fragment — `/dashboard/leaderboard#weekly` is a shareable board,
   * and a reload or a bookmark lands back on the same period.
   *
   * One source of truth, on purpose. An effect that mirrored React state into the fragment while
   * another mirrored the fragment back into state is a ping-pong: React runs both in the same
   * commit, so each would publish the value the other was about to correct. Instead the fragment
   * is read *from* (on mount and on `hashchange`) and written *to* in the click handler only.
   * `replaceState` fires no `hashchange`, so the write cannot re-enter the read.
   */
  const [range, setRangeState] = React.useState<LeaderboardRange>(DEFAULT_LEADERBOARD_RANGE);

  const setRange = React.useCallback((next: LeaderboardRange) => {
    setRangeState(next);
    // `replaceState`, not `pushState`: switching filters should not fill the back button.
    window.history.replaceState(null, "", `#${next}`);
  }, []);

  React.useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (isLeaderboardRange(hash)) setRangeState(hash);
    };
    applyHash();
    // Publish the default so the address bar always describes the board that is on screen —
    // and so a copied link carries it.
    if (!isLeaderboardRange(window.location.hash.replace(/^#/, ""))) {
      window.history.replaceState(null, "", `#${DEFAULT_LEADERBOARD_RANGE}`);
    }
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const { data, isLoading, isFetching, isError, refetch } = useConsoleLeaderboard(range);

  const entries = data?.entries ?? [];
  const meta = leaderboardRangeMeta(range);
  // `keepPreviousData` means `data` can still describe the range the user just left.
  const stale = data !== undefined && data.range !== range;

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Leaderboard"
        description="Every Bagworker ranked by Points, earned from real settled work and completed weekly quests. Daily and weekly boards are won on the points earned inside that window; Overall is the lifetime total that never goes down."
        actions={
          data && !stale ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Trophy aria-hidden="true" className="size-3.5 text-brand" />
              <span className="tabular-nums text-foreground">{data.total}</span>
              <span>ranked {meta.caption}</span>
            </span>
          ) : null
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ToggleGroup
            type="single"
            aria-label="Ranking period"
            value={range}
            // A single-select group reports "" when the active chip is clicked again; the board
            // always has a period, so that is ignored rather than clearing the filter.
            onValueChange={(next) => {
              if (isLeaderboardRange(next)) setRange(next);
            }}
            className="w-full gap-1 rounded-lg border border-border bg-card/50 p-1 sm:w-fit"
          >
            {LEADERBOARD_RANGE_META.map((entry) => (
              <ToggleGroupItem
                key={entry.key}
                value={entry.key}
                className="h-8 flex-1 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=on]:bg-brand/15 data-[state=on]:text-brand sm:flex-none sm:px-4"
              >
                {entry.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>

        <BoardBody
          range={range}
          entries={entries}
          meta={meta}
          isLoading={isLoading}
          isError={isError}
          busy={isFetching || stale}
          onRetry={() => void refetch()}
          onRangeChange={setRange}
        />
      </div>
    </>
  );
}

/* -------------------------------------------------------------- the board */

function BoardBody({
  range,
  entries,
  meta,
  isLoading,
  isError,
  busy,
  onRetry,
  onRangeChange,
}: {
  range: LeaderboardRange;
  entries: LeaderboardEntry[];
  meta: ReturnType<typeof leaderboardRangeMeta>;
  isLoading: boolean;
  isError: boolean;
  busy: boolean;
  onRetry: () => void;
  onRangeChange: (range: LeaderboardRange) => void;
}) {
  if (isError) {
    return (
      <ErrorState
        title="We couldn't load the board"
        description="The ranking request failed. Retry — this is a direct read, so it is almost always a connection problem."
        onRetry={onRetry}
      />
    );
  }

  if (isLoading) return <BoardSkeleton />;

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title={
          range === "overall"
            ? "No Bagworkers ranked yet"
            : `Nothing settled ${meta.caption}`
        }
        description={
          range === "overall"
            ? "Points only come from payouts that actually settled, so the board fills the moment the first one lands. Claim a bag, post the work, get paid — that is the whole entry fee."
            : `The ${meta.label.toLowerCase()} board fills as payouts settle, and nobody has been paid ${meta.caption}. The lifetime ranking is the one that is always live.`
        }
        action={
          <Button asChild size="sm">
            <Link href="/dashboard">Explore bags</Link>
          </Button>
        }
        secondary={
          range === "overall" ? null : (
            <Button variant="outline" size="sm" onClick={() => onRangeChange("overall")}>
              See the overall board
            </Button>
          )
        }
      />
    );
  }

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    // Dimmed rather than collapsed while the next period loads, so the numbers swap in place
    // instead of the page falling back to skeletons.
    <div className={cn("space-y-6 transition-opacity duration-200", busy && "opacity-60")}>
      <LeaderboardPodium entries={podium} rangeCaption={meta.caption} />

      {rest.length > 0 ? (
        <SectionCard
          title="Ranks 4 and up"
          description={`The rest of the ${meta.label.toLowerCase()} board, in order.`}
          contentClassName="p-2 sm:p-3"
        >
          <ol className="space-y-1">
            {rest.map((entry) => (
              <RankRow key={entry.userId} entry={entry} caption={meta.caption} />
            ))}
          </ol>
        </SectionCard>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- one row */

function RankRow({ entry, caption }: { entry: LeaderboardEntry; caption: string }) {
  const name =
    entry.displayName?.trim() || (entry.handle ? `@${entry.handle}` : "Bagworker");

  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-150",
          entry.isYou ? "bg-brand/[0.06]" : "hover:bg-card/60",
        )}
        // The console theme forces `* { border-color: var(--border) }` from an unlayered rule, so
        // the accent border on your own row has to be inline to survive.
        style={entry.isYou ? { borderColor: "rgba(255, 231, 14, 0.4)" } : undefined}
      >
        <span className="w-7 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-muted-foreground">
          {entry.rank}
        </span>

        <Link href={bagworkerHref(entry)} tabIndex={-1} aria-hidden="true" className="shrink-0">
          <ProfileAvatar
            character={entry.character}
            avatarId={entry.avatarId}
            profileNumber={entry.profileNumber}
            className="size-9 shrink-0 rounded-lg"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Link
              href={bagworkerHref(entry)}
              className="truncate rounded-sm underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {name}
            </Link>
            {entry.isYou ? (
              <span
                className="shrink-0 rounded border bg-brand/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-brand"
                style={{ borderColor: "rgba(255, 231, 14, 0.45)" }}
              >
                You
              </span>
            ) : null}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <BagworkerTag number={entry.profileNumber} className="text-[10px]" />
            <span className="hidden truncate text-[10px] text-muted-foreground sm:inline">
              {contributionLabel(entry, caption)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {formatPoints(entry.points)}
            <span className="ml-1 text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
              pts
            </span>
          </p>
          <span className="inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-px text-[10px] font-medium tabular-nums text-muted-foreground">
            Lv {entry.level}
          </span>
        </div>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------ contribution */

/**
 * What put this creator on the board, in words.
 *
 * A windowed total can now come from two places — settled payouts and completed weekly quests —
 * so the row says which, instead of assuming every point behind it was money. Rows with neither
 * (possible on `overall`, where lifetime points and the in-window counts are different questions)
 * say so rather than rendering an empty gap.
 */
function contributionLabel(entry: LeaderboardEntry, caption: string): string {
  // A zero-point account really is on the board now (see `rankedLeaderboard`), and "lifetime
  // total, nothing all time" is a strange way to greet someone who just signed up.
  if (entry.points === 0) return "no points yet";
  const parts: string[] = [];
  if (entry.settled > 0) {
    parts.push(`${entry.settled} settled ${entry.settled === 1 ? "payout" : "payouts"}`);
  }
  if (entry.quests > 0) {
    parts.push(`${entry.quests} ${entry.quests === 1 ? "quest" : "quests"} completed`);
  }
  if (parts.length === 0) return `lifetime total, nothing ${caption}`;
  return `${parts.join(" · ")} ${caption}`;
}

/* --------------------------------------------------------------- skeleton */

/** Shaped like the real board — three podium cards, then rows — so nothing shifts on load. */
function BoardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading the leaderboard">
      <div className="grid gap-4 lg:grid-cols-3 lg:items-end lg:gap-5">
        {["lg:order-1 h-[296px]", "lg:order-2 h-[336px]", "lg:order-3 h-[296px]"].map(
          (style) => (
            <Skeleton key={style} className={cn("rounded-2xl", style)} />
          ),
        )}
      </div>

      <div className="space-y-1">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="h-4 w-6 rounded" />
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-14 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}


