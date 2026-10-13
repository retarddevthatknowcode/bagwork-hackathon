"use client";

import { ArrowUpRight, Copy, Fuel, Info, Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dateMedium, relative, usd } from "@/lib/console/format";
import { FLYWHEEL_OPT_IN_MIN_USD } from "@/lib/campaigns/flywheel-window";
import { useTreasuryAddress } from "@/lib/console/hooks";
import { explorerUrl } from "@/lib/solana/connection";
import type { Campaign, FeeDeposit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { InfoRow, SectionCard } from "./ui";

/**
 * The Fee Redirect badge.
 *
 * Shown wherever a bag appears so a creator can tell at a glance that this budget grows with the
 * token's volume — the difference between a fixed pot that runs down and one that refills. The
 * tooltip carries the one thing the badge itself cannot: a growing budget is not the same as an
 * open door, because the window needs $20 in it (`lib/campaigns/flywheel-window.ts`).
 */
export function FeeRedirectBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 border-brand/40 bg-brand/10 font-normal text-brand", className)}
      title={`This bag's budget grows from the token's trading fees. Creators can opt in while it holds at least ${usd(
        FLYWHEEL_OPT_IN_MIN_USD,
      )}.`}
    >
      <TrendingUp aria-hidden="true" className="size-3" />
      Fee Redirect
    </Badge>
  );
}

/** How each deposit status reads to a publisher. */
const DEPOSIT_STATUS: Record<string, { label: string; className: string; help: string }> = {
  swapped: {
    label: "Added to budget",
    className: "border-success/30 bg-success/10 text-success",
    help: "Converted to USDC and credited to this bag.",
  },
  received: {
    label: "Converting",
    className: "border-info/30 bg-info/10 text-info",
    help: "Detected — waiting to be swapped.",
  },
  matched: {
    label: "Converting",
    className: "border-info/30 bg-info/10 text-info",
    help: "Matched to this bag — waiting to be swapped.",
  },
  swapping: {
    label: "Converting",
    className: "border-info/30 bg-info/10 text-info",
    help: "The swap is in flight.",
  },
  no_route: {
    label: "No market yet",
    className: "border-warning/30 bg-warning/10 text-warning",
    help: "No swap route to USDC yet. It converts automatically once liquidity exists.",
  },
  below_minimum: {
    label: "Below swap minimum",
    className: "border-warning/30 bg-warning/10 text-warning",
    help: "Too small to swap economically — kept and retried.",
  },
  failed: {
    label: "Swap failed",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
    help: "The swap did not go through. The tokens are still held and it will be retried.",
  },
  unmatched: {
    label: "Awaiting a bag",
    className: "border-border bg-muted/50 text-muted-foreground",
    help: "These fees arrived for a token no live bag is set up for yet.",
  },
};

/** Mints are long; the ends are what identify them. */
function shortMint(mint: string | null): string {
  if (!mint) return "—";
  return mint.length > 12 ? `${mint.slice(0, 5)}…${mint.slice(-4)}` : mint;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "brand" }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "brand" ? "text-brand" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Fee Redirect on the campaign page: the live numbers, and the history behind them.
 *
 * "Live budget" is the headline because it is the promise the feature makes — a creator looking at
 * this bag needs to see that the pot is still growing, not just what it started with.
 */
export function FeeRedirectPanel({
  campaign,
  deposits,
  className,
}: {
  campaign: Campaign;
  deposits: FeeDeposit[];
  className?: string;
}) {
  // The fee-redirect wallet, resolved by kind — never the fixed-budget treasury, whose address
  // would silently strand every fee a publisher pointed at it. Called before the early return
  // below, as hooks must be.
  const { data: feeTreasury } = useTreasuryAddress("FEE");
  if (!campaign.feeRedirectEnabled) return null;

  const converted = deposits.filter((entry) => entry.status === "swapped");
  const pending = deposits.filter(
    (entry) => entry.status !== "swapped" && entry.status !== "unmatched",
  );
  const fromFees = campaign.feeRaisedUsdc;
  const feeShare = campaign.budget > 0 ? Math.min(100, (fromFees / campaign.budget) * 100) : 0;

  return (
    <SectionCard
      title="Live fee-funded budget"
      description="Trading fees for this token are converted to USDC and added to this bag"
      action={<FeeRedirectBadge />}
      className={className}
      contentClassName="space-y-4"
    >
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Fees collected" value={usd(fromFees, { cents: true })} tone="brand" />
        <Stat label="Live budget" value={usd(campaign.budget, { cents: true })} />
        <Stat label="Paid out" value={usd(campaign.spent, { cents: true })} />
        <Stat label="Remaining" value={usd(campaign.remaining, { cents: true })} />
      </dl>

      {/*
        The address this token's fees must be routed to. It is on the campaign page because this
        is where a publisher comes back to when a deposit has not appeared — and the first thing
        to check is whether the fee recipient still points at the FEE wallet.
      */}
      {feeTreasury?.address ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Fee wallet
          </span>
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
            {feeTreasury.address}
          </code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 gap-1"
            onClick={() => {
              void navigator.clipboard?.writeText(feeTreasury.address ?? "");
              toast.success("Fee wallet address copied");
            }}
          >
            <Copy aria-hidden="true" className="size-3.5" />
            Copy
          </Button>
        </div>
      ) : null}

      {/*
        The growth bar. Framed as "funded by trading", because a publisher reading 100% here should
        understand the bag is paying for itself rather than that it is nearly spent.
      */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Funded by trading fees</span>
          <span className="tabular-nums text-muted-foreground">{Math.round(feeShare)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-accent">
          <div
            className="h-full rounded-full bg-brand transition-all duration-500"
            style={{ width: `${Math.max(2, feeShare)}%` }}
          />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {fromFees > 0
            ? `${usd(fromFees, { cents: true })} of this budget came from the token's own volume. Every conversion grows it further, so the bag keeps refilling.`
            : "No fees have been converted yet. Once the token trades and fees are routed to Bagwork, this budget grows automatically."}
        </p>
      </div>

      {pending.length > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <Loader2
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 animate-spin text-warning"
          />
          <p className="text-xs leading-relaxed text-warning">
            {pending.length} deposit{pending.length === 1 ? "" : "s"} in conversion — the budget
            grows as each swap settles.
          </p>
        </div>
      ) : null}

      <dl className="space-y-2 rounded-xl border border-border p-3.5">
        <InfoRow label="Token mint" value={shortMint(campaign.feeMint)} />
        <InfoRow
          label="Share redirected"
          value={campaign.feeRedirectPct !== null ? `${campaign.feeRedirectPct}%` : "—"}
        />
        <InfoRow label="Deposits converted" value={String(converted.length)} />
      </dl>


      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-foreground">Fee history</p>
          <Badge
            variant="outline"
            className="border-border bg-muted/40 font-normal text-muted-foreground"
          >
            {deposits.length} deposit{deposits.length === 1 ? "" : "s"}
          </Badge>
        </div>

        {deposits.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs leading-relaxed text-muted-foreground">
            Nothing yet. Point your token&apos;s fee recipient at the Bagwork address — every fee
            that lands is recorded here with the exact amount converted.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-xl border border-border">
            {deposits.map((deposit) => {
              const meta = DEPOSIT_STATUS[deposit.status] ?? DEPOSIT_STATUS.unmatched;
              return (
                <li
                  key={deposit.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Fuel aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      +{deposit.tokenAmount.toLocaleString("en-US", { maximumFractionDigits: 4 })}{" "}
                      {deposit.symbol || "tokens"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {deposit.usdcAmount !== null ? (
                      <span className="text-xs font-medium tabular-nums text-success">
                        → {usd(deposit.usdcAmount, { cents: true })}
                      </span>
                    ) : null}
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {dateMedium(deposit.receivedAt)}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn("font-normal", meta.className)}
                      title={meta.help}
                    >
                      {meta.label}
                    </Badge>
                    <Button asChild size="sm" variant="ghost" className="size-7 p-0">
                      <a
                        href={explorerUrl("tx", deposit.signature)}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label="View the deposit on Solscan"
                        title={`${meta.help} (${relative(deposit.receivedAt)})`}
                      >
                        <ArrowUpRight aria-hidden="true" className="size-3.5" />
                      </a>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
          Fees are swapped to USDC through Jupiter and credited to this bag. Converted fees can only
          ever go to creators — there is no path back to the publisher.
        </p>
      </div>
    </SectionCard>
  );
}

