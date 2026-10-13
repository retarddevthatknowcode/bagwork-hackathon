"use client";

import { useState } from "react";
import { useCampaigns } from "@/lib/queries";
import { BagCard } from "@/components/console/bag-card";
import { NeonButton } from "@/components/site/neon-button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApp } from "@/lib/store";
import { useAuth } from "@/components/auth/auth-provider";
import { BAG_TYPE_SHORT, bagTypeOf, type BagType } from "@/lib/types";

/**
 * DISCOVER LIVE BAGWORK — the marketing proof section.
 *
 * The cards are the Creator Console's own `BagCard`, not a site-side lookalike. A bag described one
 * way here and another way once you signed in was two designs drifting apart in public: the
 * homepage kept its own card with its own budget bar while the console had the one the product
 * actually runs on. There is now one card, and this section previews it.
 *
 * Two things make that work:
 *
 *   - **The console's token scope.** `BagCard` reads `--brand`, `--success`, `--warning`, `--info`
 *     and the console's border and muted tones, none of which are declared on the marketing
 *     `:root`. `.console-scope` (see `globals.css`) carries that palette for an embedded subtree
 *     without the `:root:has(.console)` rule, which would have repainted this whole page.
 *
 *   - **A cap.** This is a preview, so it shows at most `PREVIEW_MAX` bags however many are live.
 *     The full, filterable list is the console's Explore Bags page, and the section links there
 *     rather than trying to reproduce it — that is what the "Explore more" CTA is for. It renders
 *     whatever the filters did, so the way through to the console cannot be filtered away.
 */

/** Preview cap. Eight is two full rows on the four-column desktop grid. */
const PREVIEW_MAX = 8;

/**
 * The grid the loaded and the loading state share, so the rows line up either way.
 *
 * Four columns from `xl`, matching the console's Explore grid (which steps to four one breakpoint
 * later, at `2xl`, because the console gives up ~256px to its sidebar and this section does not).
 * The cards are the console's own, so a preview that laid them out differently would make the
 * console look like a different product the moment someone followed the link.
 */
const GRID = "grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

/*
 * Filtered by funding type, not by content category.
 *
 * These chips read PROMO / CLIPPING / UGC / ORIGINAL and filtered on a field no launcher ever fills
 * in — every bag in the product carries PROMO, so three of the five chips matched nothing at all and
 * the list under the others was the same list twice. The two funding models are real and mutually
 * exclusive: a bag either spends a budget someone transferred, or it spends a coin's trading fees.
 */
const FILTERS: { label: string; value: "ALL" | BagType }[] = [
  { label: "ALL", value: "ALL" },
  { label: BAG_TYPE_SHORT.FEE_FLYWHEEL, value: "FEE_FLYWHEEL" },
  { label: BAG_TYPE_SHORT.FIXED_BUDGET, value: "FIXED_BUDGET" },
];

export function LiveCampaigns() {
  const { data, isLoading } = useCampaigns("LIVE");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("ALL");
  const goToConsole = useApp((s) => s.goToConsole);
  const { authenticated, login } = useAuth();

  const all = data?.campaigns ?? [];
  const filtered =
    filter === "ALL" ? all : all.filter((c) => bagTypeOf(c) === filter);

  /** What is on screen. Fewer than the cap is fine — then it shows everything that is live. */
  const visible = filtered.slice(0, PREVIEW_MAX);
  /** How many the console holds that this preview deliberately does not. */
  const withheld = filtered.length - visible.length;

  return (
    <section id="live" className="relative border-b border-white/10 bg-[#13110c]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#bdfe00]/30 bg-[#bdfe00]/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#bdfe00]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#bdfe00] pulse-dot" />
              LIVE NOW
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
              DISCOVER LIVE <span className="text-[#bdfe00]">BAGWORK</span>
            </h2>
            <p className="mt-3 max-w-md text-sm text-white/50">
              Funded campaigns ready for your content. Slots fill fast — claim
              yours before they&apos;re gone.
            </p>
          </div>

          {/* filters */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={
                  "rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all " +
                  (filter === f.value
                    ? "border-[#bdfe00] bg-[#bdfe00] text-black"
                    : "border-white/10 bg-white/5 text-white/60 hover:border-[#bdfe00]/40 hover:text-[#bdfe00]")
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* The console's cards, in the console's palette. */}
        <div className="console-scope mt-10">
          {isLoading ? (
            <ul className={GRID}>
              {Array.from({ length: PREVIEW_MAX }).map((_, index) => (
                <li key={index}>
                  <Card className="h-full gap-0 overflow-hidden py-0">
                    <div className="h-24 shrink-0 border-b border-border/60 bg-muted" />
                    <div className="flex flex-1 flex-col gap-3 p-3.5">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-4/5" />
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
              <p className="text-sm text-white/50">
                No live campaigns in this category right now. Check back soon.
              </p>
            </div>
          ) : (
            <ul className={GRID}>
              {visible.map((campaign) => (
                <li key={campaign.id}>
                  <BagCard campaign={campaign} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/*
         * The way through to the console — outside the cap, and outside the loading and empty
         * branches, so a filter that finds nothing cannot take it away. An outline surface rather
         * than a solid one: the section already ends on a solid `START EARNING NOW`.
         */}
        <div className="mt-10 flex flex-col items-center gap-3">
          <a
            href="/dashboard"
            className="btn-3d btn-surface-outline group/explore inline-flex h-12 items-center justify-center rounded-xl px-7 text-[13px] font-bold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdfe00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#13110c]"
          >
            <span className="relative z-10 flex items-center gap-2">
              EXPLORE MORE BAGS
              <span
                aria-hidden="true"
                className="text-[1.1em] leading-none transition-transform duration-200 group-hover/explore:translate-x-1"
              >
                →
              </span>
            </span>
          </a>
          {!isLoading && visible.length > 0 ? (
            <p className="text-center text-[11px] text-white/40">
              {withheld > 0
                ? `Showing ${visible.length} of ${filtered.length} live bags — the rest are in the Creator Console.`
                : `${visible.length} live ${visible.length === 1 ? "bag" : "bags"}, open now.`}
            </p>
          ) : null}
        </div>

        {/* CTA */}
        <div className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-[#bdfe00]/20 bg-[#bdfe00]/5 p-8 text-center">
          <h3 className="text-xl font-bold text-white sm:text-2xl">
            READY TO GET PAID FOR YOUR CONTENT?
          </h3>
          <p className="max-w-md text-sm text-white/50">
            Sign in, claim a campaign slot, and submit your first post in under 2
            minutes.
          </p>
          <NeonButton
            size="lg"
            arrow
            onClick={() => {
              // Real authentication, not a local flag: this opens the Privy modal.
              if (authenticated) goToConsole();
              else login();
            }}
          >
            START EARNING NOW
          </NeonButton>
        </div>
      </div>
    </section>
  );
}
