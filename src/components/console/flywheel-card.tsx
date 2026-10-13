"use client";

import Link from "next/link";
import { ArrowRight, Copy, ExternalLink, Fuel, Users, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { countdownLabel, usd } from "@/lib/console/format";
import { truncateAddress } from "@/lib/privy/config";
import { explorerUrl } from "@/lib/solana/connection";
import type { Campaign } from "@/lib/types";
import { cn } from "@/lib/utils";
import { rateLabel } from "./bag-card";
import { BudgetBar } from "./budget-bar";
import { PlatformIconRow } from "./platform-icons";
import { BagStatusBadge } from "./status-badge";

/**
 * A flywheel bag's card — deliberately not the fixed-budget card.
 *
 * `BagCard` leads with a banner because a publisher-funded bag is a *project*: there is artwork, a
 * brand, a campaign someone designed. A flywheel bag has no such thing. It is a coin whose trading
 * fees are being spent, so the fact worth reading first is the coin itself.
 *
 * So this drops the banner entirely — a stretched banner would be dead space holding a placeholder
 * — and spends that room on the coin. The face is a **square at 56px**: the coin's own artwork
 * wants the room, and a square is the shape a token mark takes on every marketplace and wallet this
 * audience already uses. It used to be round and 44px, which made the one identity-bearing element
 * on the card the smallest thing on it.
 *
 * The identity reads ticker first, name second. `$EMBER` is how someone scans a grid of coins: the
 * ticker is the name they know it by, and the full name underneath is the disambiguation. The
 * fixed-budget card keeps the opposite order on purpose — there the *project* is the identity and
 * the ticker is a detail.
 *
 * The edge carries the rest of it: a gold-to-violet-to-cyan hairline, brightest at two opposite
 * corners, over a very light brand glow. That is `.flywheel-card` in `globals.css`, which is also
 * where the reason it is a border rather than an overlay lives. It is deliberately *not* on
 * `BagCard`: a flywheel bag is a coin and can wear a lit edge; a publisher's bag is a document and
 * should not.
 *
 * The footprint is otherwise the same as a normal card: same grid, same `h-full` behaviour, same
 * footer pinned with `mt-auto`. A marketplace whose two tabs lay out at different heights looks
 * like two different products, which is the opposite of the point.
 *
 * Readable in three seconds, in this order: which coin, how much budget it is sitting on, how much
 * it has already paid out, and what it pays per view.
 */
export function FlywheelCard({ campaign }: { campaign: Campaign }) {
  const image = campaign.tokenImageUrl ?? campaign.token.logoUrl;
  /**
   * The coin's ticker.
   *
   * `campaign.token.symbol` is already the right value for a launched coin: the bag factory creates
   * the `Project` from the launch's own symbol, so there is no second field to fall back to.
   */
  const ticker = campaign.token.symbol || "—";
  /** Two letters of the ticker when there is no artwork, so the square still says *something*. */
  const initials = (campaign.token.symbol || campaign.title).slice(0, 2).toUpperCase();

  // The budget is what the bag has to spend; the fee-funded part is how much of it arrived from
  // trading rather than from anyone's wallet, which is the whole claim of the product.
  const budgetNow = campaign.budget;
  const fromFees = campaign.feeRaisedUsdc;
  const paidOut = campaign.spent;

  /**
   * The coin's contract address.
   *
   * A flywheel bag *is* its coin, so the mint is the bag's real identity — the thing someone wants
   * to check, copy or paste into a wallet. `feeMint` is the launched mint (it is what fee deposits
   * are matched on); `token.mint` is the fallback for a fee-redirect bag that was pointed at an
   * existing token rather than launched here, which is the same precedence the bag page uses.
   */
  const ca = campaign.feeMint ?? campaign.token.mint;

  return (
    <Card className="flywheel-card group h-full w-full gap-0 overflow-hidden py-0">
      <div className="flex h-full flex-col gap-3 p-3.5">
        {/*
          The coin, face first.
          The face is a sibling of the text rather than a background on it, so the two cannot
          affect each other: the artwork keeps its own aspect ratio and full brightness, and the
          ticker and name truncate independently of it. The status chip stays opposite the identity
          because "is this live" is the second question a reader asks — but it is `shrink-0` so it
          never squeezes the ticker, which is what identifies the card.
        */}
        <div className="flex items-start gap-3">
          <TokenPfp image={image} initials={initials} label={campaign.token.name} />
          <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight text-foreground">
                ${ticker}
              </p>
              <p className="truncate text-xs text-muted-foreground">{campaign.token.name}</p>
            </div>
            <BagStatusBadge status={campaign.status} className="shrink-0" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            title="This bag's budget is funded by the coin's trading fees"
            className="gap-1 border-brand/40 bg-brand/10 px-1.5 py-0 text-[10px] font-medium text-brand"
          >
            <Fuel aria-hidden="true" className="size-2.5" />
            Flywheel
          </Badge>
          {campaign.feeRedirectPct !== null ? (
            <Badge
              variant="outline"
              className="border-border bg-muted/40 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
            >
              {campaign.feeRedirectPct}% of fees
            </Badge>
          ) : null}
        </div>

        <p className="line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">
          {campaign.description}
        </p>

        {/* The contract address: copyable, and linked so it can be checked without leaving. */}
        {ca ? (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              CA
            </span>
            <code
              className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground"
              title={ca}
            >
              {truncateAddress(ca, 8, 8)}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(ca);
                toast.success("Contract address copied");
              }}
              aria-label="Copy the contract address"
              title="Copy contract address"
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Copy aria-hidden="true" className="size-3" />
            </button>
            <a
              href={explorerUrl("address", ca)}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="View this coin on Solscan"
              title="View on Solscan"
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          </div>
        ) : null}

        {/* The headline pair: what it can spend, and what it has spent. */}
        <dl className="grid grid-cols-2 gap-3">
          <div className="space-y-0.5">
            <dt className="text-[11px] text-muted-foreground">Budget from fees</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">
              {usd(budgetNow, { cents: true })}
            </dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[11px] text-muted-foreground">Paid to creators</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">
              {usd(paidOut, { cents: true })}
            </dd>
          </div>
        </dl>

        {/* Two-tone: the paid portion against what is left. The same bar a normal card uses. */}
        <BudgetBar spent={paidOut} total={budgetNow} />

        {/*
          Four small facts on one wrapped row.

          These were two rows — fees/submissions, then rate/countdown — which cost a full line of
          height each to hold two short items on a card that is already the densest thing in the
          console. Nothing is dropped and nothing is reordered by importance: the rate still leads,
          and the wrap puts the rest underneath only when the card is narrow enough to need it.
        */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{rateLabel(campaign)}</span>
          <span>{countdownLabel(campaign.endsAt)}</span>
          <span className="inline-flex items-center gap-1">
            <Wallet aria-hidden="true" className="size-3" />
            {usd(fromFees, { cents: true })} raised from fees
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
              aria-label={`View flywheel bag: ${campaign.title}`}
            >
              View
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * The coin's face: a square, at the largest size the card can carry.
 *
 * Square, not round. This is the coin's actual artwork — the same upload the launcher made and the
 * same image a wallet shows — and a square gives it about a quarter more area than the circle it
 * used to sit in, at the same footprint. The radius stays small (`rounded-lg`, the console's
 * `--radius - 2px`) so it reads as a rounded square rather than a circle with its corners cut off.
 *
 * Nothing is layered over it: no scrim, no gradient, no status chip. The face is the reason the
 * card exists, and a card that crushed its own artwork under a tint to keep a badge legible had the
 * priority backwards — the badge sits beside the identity instead (see the caller), and the edge
 * treatment in `.flywheel-card` is drawn in the border ring precisely so it cannot land on this.
 *
 * Falls back to the ticker's first two letters rather than a generic icon: every flywheel bag is a
 * different coin, and a row of identical placeholder glyphs would make them indistinguishable at a
 * glance — the one thing a marketplace grid has to avoid.
 */
function TokenPfp({
  image,
  initials,
  label,
}: {
  image: string | null;
  initials: string;
  label: string;
}) {
  return (
    <span
      className={cn(
        "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/70",
        image ? "bg-muted/30" : "bg-brand/10",
      )}
    >
      {image ? (
        <img
          src={image}
          alt={`${label} token`}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="text-base font-semibold tracking-tight text-brand">{initials}</span>
      )}
    </span>
  );
}
