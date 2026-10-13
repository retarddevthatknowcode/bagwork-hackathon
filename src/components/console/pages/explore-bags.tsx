"use client";

import { Coins, Compass, Fuel, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useCampaigns } from "@/lib/queries";
import type { Campaign } from "@/lib/types";
import { BagCard } from "../bag-card";
import { FlywheelCard } from "../flywheel-card";
import { CardGridSkeleton, EmptyState, ErrorState, PageHeader } from "../ui";

/**
 * The Explore header's artwork, from `public/`.
 *
 * A public path rather than an import: this is a CSS background, so nothing bundles it, the browser
 * fetches it once and caches it with the rest of the static assets, and the file is a 5 MB SVG whose
 * art is embedded raster — the one thing a build step could not have made smaller.
 */
const EXPLORE_BANNER = "/explorepagebanner.svg";

type TypeFilter = "ALL" | "PER_VIEW" | "FIXED" | "HYBRID";
type StatusFilter = "ALL" | "LIVE" | "FILLING" | "ENDED";
type SortKey = "NEWEST" | "HIGHEST" | "ENDING" | "BUDGET";

/**
 * The two products, on their own tabs.
 *
 * They are funded in opposite directions — one from a publisher's wallet, one from a coin's trading
 * fees — and they are read for different reasons, so a single mixed list made both harder: a reader
 * looking for somewhere to post had to skip past coins, and a reader looking at coins had to skip
 * past budgets.
 */
type ExploreTab = "bags" | "flywheel";

const DEFAULT_FILTERS = {
  query: "",
  type: "ALL" as TypeFilter,
  status: "ALL" as StatusFilter,
  sort: "HIGHEST" as SortKey,
};

function matchesType(campaign: Campaign, type: TypeFilter) {
  const perView = campaign.rateType === "DYNAMIC";
  switch (type) {
    case "PER_VIEW":
      return perView && !campaign.holderGate;
    case "FIXED":
      return !perView;
    case "HYBRID":
      // per-view rate plus a holder-gated tier — both models at once
      return perView && campaign.holderGate;
    default:
      return true;
  }
}

function sortBags(a: Campaign, b: Campaign, sort: SortKey) {
  switch (sort) {
    case "NEWEST":
      return new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime();
    case "ENDING":
      return new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime();
    case "BUDGET":
      return b.remaining - a.remaining;
    default:
      return b.maxPayout - a.maxPayout;
  }
}

export function ExploreBags() {
  const { data, isLoading, isError, error, refetch } = useCampaigns("ALL");
  const [filters, setFilters] = usePersistentState(
    "bagwork.console.exploreFilters",
    DEFAULT_FILTERS,
  );
  /*
   * Which kind of campaign is on screen.
   *
   * Kept in the same persisted store the filters use rather than in the URL: this is a client
   * component, and reading `useSearchParams` here would pull the whole route behind a Suspense
   * boundary for a value nobody shares or bookmarks. The choice still survives a reload and a
   * round trip away and back, which is what "remembers selection" is actually for.
   */
  const [tab, setTab] = usePersistentState<ExploreTab>("bagwork.console.exploreTab", "bags");

  const campaigns = data?.campaigns ?? [];

  /*
   * The split, computed once so every count and every list below agrees with each other.
   *
   * `kind` is the persisted discriminator. `feeRedirectEnabled` is the older signal a row may
   * still carry from before that column existed, so a campaign matching either is a flywheel — a
   * manually-created Fee Redirect bag belongs on that tab just as much as a launched one, because
   * the difference a reader cares about is where the money comes from.
   */
  const flywheels = useMemo(
    () => campaigns.filter((c) => c.kind === "FLYWHEEL" || c.feeRedirectEnabled),
    [campaigns],
  );
  const fixedBags = useMemo(
    () => campaigns.filter((c) => c.kind !== "FLYWHEEL" && !c.feeRedirectEnabled),
    [campaigns],
  );
  const active = tab === "flywheel" ? flywheels : fixedBags;

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return active
      .filter((campaign) => {
        if (!matchesType(campaign, filters.type)) return false;
        if (
          filters.status !== "ALL" &&
          campaign.status !== (filters.status as Campaign["status"])
        )
          return false;
        if (!query) return true;
        return (
          campaign.title.toLowerCase().includes(query) ||
          campaign.description.toLowerCase().includes(query) ||
          campaign.token.symbol.toLowerCase().includes(query) ||
          campaign.token.name.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => sortBags(a, b, filters.sort));
  }, [active, filters]);

  const filtersDirty =
    filters.query !== DEFAULT_FILTERS.query ||
    filters.type !== DEFAULT_FILTERS.type ||
    filters.status !== DEFAULT_FILTERS.status ||
    filters.sort !== DEFAULT_FILTERS.sort;

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Explore"
        title="Explore Bags"
        description="Every bag is a funded campaign. Claim a slot, post on your platform, and get paid in USDC as soon as review passes."
        bannerSrc={EXPLORE_BANNER}
        actions={
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/dashboard/create">
              <Plus aria-hidden="true" className="size-4" />
              Create Bag
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {/*
          The primary switch, first in the content column so it is on the first paint.
          
          Full width and two equal halves on mobile, inline and compact from `sm` up. Each side
          carries its own count, because "Flywheel 3" answers the question a reader has before they
          click — is the other tab worth opening — without costing a query: every campaign is
          already in hand, so these are array lengths.
        */}
        <div
          role="tablist"
          aria-label="Campaign type"
          className="grid w-full grid-cols-2 gap-1 rounded-xl border border-border bg-card/40 p-1 sm:inline-grid sm:w-auto"
        >
          {(
            [
              {
                key: "bags",
                label: "Bags",
                count: fixedBags.length,
                hint: "Fixed budgets, funded up front by a publisher",
              },
              {
                key: "flywheel",
                label: "Flywheel",
                count: flywheels.length,
                hint: "Coins whose trading fees fund the bag",
              },
            ] as const
          ).map((option) => {
            const selected = tab === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={selected}
                title={option.hint}
                onClick={() => setTab(option.key)}
                className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 motion-reduce:transition-none ${
                  selected
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.key === "flywheel" ? (
                  <Fuel aria-hidden="true" className="size-3.5" />
                ) : (
                  <Coins aria-hidden="true" className="size-3.5" />
                )}
                {option.label}
                <span
                  className={`rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums ${
                    selected
                      ? "bg-brand-foreground/15 text-brand-foreground"
                      : "bg-muted/60 text-muted-foreground"
                  }`}
                >
                  {isLoading ? "—" : option.count}
                </span>
              </button>
            );
          })}
        </div>

        <section
          aria-label="Filter and sort bags"
          className="rounded-xl border border-border bg-card/40 p-3 sm:p-4"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={filters.query}
                onChange={(event) =>
                  setFilters({ ...filters, query: event.target.value })
                }
                placeholder="Search bags by title, project or token"
                aria-label="Search bags"
                className="h-9 pl-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:w-auto">
              <Select
                value={filters.type}
                onValueChange={(value) =>
                  setFilters({ ...filters, type: value as TypeFilter })
                }
              >
                <SelectTrigger className="h-9 w-full lg:w-[10rem]" aria-label="Payment model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All models</SelectItem>
                  <SelectItem value="PER_VIEW">Per view</SelectItem>
                  <SelectItem value="FIXED">Fixed</SelectItem>
                  <SelectItem value="HYBRID">Hybrid</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.status}
                onValueChange={(value) =>
                  setFilters({ ...filters, status: value as StatusFilter })
                }
              >
                <SelectTrigger className="h-9 w-full lg:w-[9.5rem]" aria-label="Bag status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="LIVE">Live</SelectItem>
                  <SelectItem value="FILLING">Filling fast</SelectItem>
                  <SelectItem value="ENDED">Ended</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.sort}
                onValueChange={(value) =>
                  setFilters({ ...filters, sort: value as SortKey })
                }
              >
                <SelectTrigger
                  className="col-span-2 h-9 w-full sm:col-span-1 lg:w-[11rem]"
                  aria-label="Sort bags"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGHEST">Highest paying</SelectItem>
                  <SelectItem value="NEWEST">Newest</SelectItem>
                  <SelectItem value="ENDING">Ending soon</SelectItem>
                  <SelectItem value="BUDGET">Most budget left</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
              {/*
                No count is claimed until there is data to count. The line used to read
                "Showing 0 of 0 bags" whenever the request failed, because `data` was undefined and
                the fallback is an empty list — so a broken feed looked like an empty marketplace.
                "Unknown" is the honest thing to say while we do not know.
              */}
              {isLoading || isError ? (
                "Bag count unavailable"
              ) : (
                <>
                  Showing{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {filtered.length}
                  </span>{" "}
                  of {active.length} {tab === "flywheel" ? "flywheel bags" : "bags"}
                </>
              )}
            </p>

            {filters.query ? (
              <Badge
                variant="outline"
                className="gap-1 border-border bg-muted/40 font-normal text-muted-foreground"
              >
                “{filters.query}”
              </Badge>
            ) : null}
            {filters.type !== "ALL" ? (
              <Badge
                variant="outline"
                className="gap-1 border-border bg-muted/40 font-normal text-muted-foreground"
              >
                {TYPE_LABEL[filters.type]}
              </Badge>
            ) : null}
            {filters.status !== "ALL" ? (
              <Badge
                variant="outline"
                className="gap-1 border-border bg-muted/40 font-normal text-muted-foreground"
              >
                {STATUS_LABEL[filters.status]}
              </Badge>
            ) : null}
            {filters.sort !== DEFAULT_FILTERS.sort ? (
              <Badge
                variant="outline"
                className="gap-1 border-border bg-muted/40 font-normal text-muted-foreground"
              >
                Sorted: {SORT_LABEL[filters.sort]}
              </Badge>
            ) : null}

            {filtersDirty ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setFilters(DEFAULT_FILTERS)}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        </section>

        {isLoading ? (
          /* Eight: two full rows at the `2xl` grid's four columns, so the page does not grow a row
             taller the moment the data lands. */
          <CardGridSkeleton count={8} />
        ) : isError ? (
          <ErrorState
            description={
              error?.message ??
              "The bag feed could not be loaded. This is a server-side problem, not your request."
            }
            onRetry={() => refetch()}
          />
        ) : filtered.length === 0 ? (
          /*
            Empty states are per tab, and they say different things.
            "No fixed-budget bags" and "no coin has a bag yet" are different situations with
            different next actions, and a single generic line would have told the reader neither.
          */
          <EmptyState
            icon={Compass}
            title={
              tab === "flywheel"
                ? "No flywheel bags match those filters"
                : "No bags match those filters"
            }
            description={
              active.length === 0
                ? tab === "flywheel"
                  ? "No coin has a bag here yet. Launch one and its trading fees become the budget."
                  : "There are no fixed-budget bags yet. Fund one and creators will show up."
                : "Nothing matches yet — widen the payment model, or clear the search to see everything on this tab."
            }
            action={<Button onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</Button>}
            secondary={
              <Button asChild variant="outline">
                <Link href="/dashboard/create">
                  {tab === "flywheel" ? "Launch a coin" : "Create a bag"}
                </Link>
              </Button>
            }
          />
        ) : (
          /*
            Four across from `2xl` (1536px), three from `xl`, one below `sm`.

            The console's content column is capped at 1600px, so on a 1920px monitor a
            three-column grid gave every card ~393px — wide enough that a bag's numbers sat in the
            middle of a lot of empty surface, and only three bags were visible per row on a screen
            that could hold eight. Four columns brings a card to ~295px: about 25% narrower, and
            ~20% shorter as well once the padding and the banner come down with it.

            `xl` deliberately keeps three. At 1280px the sidebar leaves ~960px of content, where
            four columns would be 231px cards — the cramped side of dense, which is the failure
            mode this is trying to avoid rather than a version of the goal. And below `sm` nothing
            changes: one card per row, at full width, because a 280px card on a phone is a
            two-column grid pretending to be a phone UI.
          */
          <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((campaign) => (
              <li key={campaign.id}>
                {tab === "flywheel" ? (
                  <FlywheelCard campaign={campaign} />
                ) : (
                  <BagCard campaign={campaign} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const TYPE_LABEL: Record<TypeFilter, string> = {
  ALL: "All models",
  PER_VIEW: "Per view",
  FIXED: "Fixed",
  HYBRID: "Hybrid",
};

const STATUS_LABEL: Record<StatusFilter, string> = {
  ALL: "All statuses",
  LIVE: "Live",
  FILLING: "Filling fast",
  ENDED: "Ended",
};

const SORT_LABEL: Record<SortKey, string> = {
  NEWEST: "Newest",
  HIGHEST: "Highest paying",
  ENDING: "Ending soon",
  BUDGET: "Most budget left",
};

