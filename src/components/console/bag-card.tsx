"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, Coins, Gem, Rocket, TrendingUp, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { countdownLabel, usd } from "@/lib/console/format";
import type { Campaign } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BudgetBar } from "./budget-bar";
import { PlatformIconRow } from "./platform-icons";
import { BagStatusBadge } from "./status-badge";

export function rateLabel(campaign: Campaign) {
  return campaign.rateType === "DYNAMIC"
    ? `${usd(campaign.ratePer1k)} / 1K views`
    : `${usd(campaign.maxPayout)} per post`;
}

/**
 * USDC still available to creators: `budget - spent`.
 *
 * `spent` / `remaining` are the figures the UI shows; `fundedAmount` is the escrow commitment
 * and is deliberately not used for a budget bar (see the note on the type).
 */
export function remainingOf(campaign: Campaign) {
  return campaign.remaining;
}

/**
 * Banner artwork for a bag card.
 *
 * Shows the publisher's uploaded image when there is one. When there is not, the placeholder is
 * deliberately **neutral**: muted surface, a hairline grid, and the app's own brand tint at low
 * opacity. It used to be tinted with the token's colour, which sounds harmless and was not — a bag
 * that borrowed a project row was also borrowing that project's colour, so an unbranded bag rendered
 * in a stranger's palette. A placeholder should say "no artwork"; it should not imply an identity
 * nobody chose.
 *
 * A launched coin is the one case where a token image is real artwork: `tokenImageUrl` is the coin's
 * own face, uploaded by the launcher during the launch. So it is used when the bag has no banner of
 * its own, and nothing else is.
 *
 * The only thing overlaid on the artwork is the status chip: no token mark, no project name, no
 * caption. The body of the card directly below already names the bag and its token, so repeating it
 * on the banner just competed with the image.
 */
export function BagBanner({
  campaign,
  className,
}: {
  campaign: Campaign;
  className?: string;
}) {
  /**
   * The card's artwork: the bag's own banner, or the launched coin's image when the bag came from
   * a launch. A launched bag sets both to the same upload, so this only matters for a bag whose
   * banner was later cleared — without the fallback it would drop to the placeholder even though
   * the coin still has a face.
   */
  const artwork = campaign.bannerUrl ?? campaign.tokenImageUrl;
  return (
    <div
      className={cn(
        "relative h-24 shrink-0 overflow-hidden border-b border-border/60 bg-muted",
        // The placeholder wash is the app's own brand at low opacity — not the token's colour, which
        // may belong to a project this bag should not be wearing.
        !artwork && "bg-gradient-to-br from-brand/[0.07] via-muted to-muted",
        className,
      )}
    >
      {artwork ? (
         
        <img
          src={artwork}
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(255, 231, 14, 0.07) 1px, transparent 1px), linear-gradient(180deg, rgba(255, 231, 14, 0.07) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />
      )}

      {/* Keeps the status chip legible over any uploaded artwork. */}
      {artwork ? (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-background/70 to-transparent"
        />
      ) : null}

      <div className="absolute left-4 top-3">
        <BagStatusBadge status={campaign.status} />
      </div>
    </div>
  );
}

export function BagCard({ campaign }: { campaign: Campaign }) {
  const remaining = remainingOf(campaign);

  return (
    <Card className="group h-full w-full gap-0 overflow-hidden py-0 transition-colors duration-200 hover:border-foreground/20">
      <BagBanner campaign={campaign} />

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <div className="space-y-1">
          <h3 className="line-clamp-1 text-sm font-semibold text-foreground">
            {campaign.title}
          </h3>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {campaign.token.name}
            <span aria-hidden="true">·</span>
            <span className="font-medium tracking-wide">{campaign.token.symbol}</span>
            {campaign.holderGate ? (
              <Badge
                variant="outline"
                title={`Holder gate: hold at least ${campaign.holderMin.toLocaleString()} ${campaign.token.symbol}`}
                className="gap-1 border-border bg-muted/40 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
              >
                <Gem aria-hidden="true" className="size-2.5" />
                Holders only
              </Badge>
            ) : null}
            {/* A self-funding bag is a materially different offer to a fixed pot, and a bag that was
                launched here is a further step: the coin itself was created for it. */}
            {campaign.feeRedirectEnabled ? (
              <Badge
                variant="outline"
                title={
                  campaign.kind === "FLYWHEEL"
                    ? "Launched on Bagwork: this coin's creator fees fund the bag"
                    : "This bag's budget grows from the token's trading fees"
                }
                className="gap-1 border-brand/40 bg-brand/10 px-1.5 py-0 text-[10px] font-medium text-brand"
              >
                {campaign.kind === "FLYWHEEL" ? (
                  <Rocket aria-hidden="true" className="size-2.5" />
                ) : (
                  <TrendingUp aria-hidden="true" className="size-2.5" />
                )}
                {campaign.kind === "FLYWHEEL" ? "Flywheel" : "Fee Redirect"}
              </Badge>
            ) : null}
          </p>
        </div>

        <p className="line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">
          {campaign.description}
        </p>

        <dl className="grid grid-cols-2 gap-3">
          <div className="space-y-0.5">
            <dt className="text-[11px] text-muted-foreground">Left in budget</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">
              {usd(remaining)}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                USDC
              </span>
            </dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[11px] text-muted-foreground">Creator gets</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">
              {rateLabel(campaign)}
            </dd>
          </div>
        </dl>

        <BudgetBar spent={campaign.spent} total={campaign.budget} />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users aria-hidden="true" className="size-3" />
            {campaign.slotsRemaining} slots left
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarClock aria-hidden="true" className="size-3" />
            {countdownLabel(campaign.endsAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Coins aria-hidden="true" className="size-3" />
            {usd(campaign.maxPayout)} max per post
          </span>
          <span className="inline-flex items-center gap-1">
            <Users aria-hidden="true" className="size-3" />
            {campaign.submissionsCount} submission
            {campaign.submissionsCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <PlatformIconRow platforms={campaign.platforms} />
          <Button asChild size="sm" className="shrink-0">
            <Link
              href={`/dashboard/bags/${campaign.id}`}
              aria-label={`View bag: ${campaign.title}`}
            >
              View Bag
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
