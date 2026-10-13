"use client";

import { ArrowUpRight, Copy, Info, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usd } from "@/lib/console/format";
import { truncateAddress } from "@/lib/privy/config";
import { explorerUrl } from "@/lib/solana/connection";
import type { Campaign } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FeeRedirectBadge } from "./fee-redirect-panel";
import { PlatformIconRow } from "./platform-icons";
import { BagStatusBadge } from "./status-badge";
import { InfoRow, SectionCard } from "./ui";

/**
 * The top of a flywheel bag's page: the coin, not the campaign.
 *
 * A fixed-budget bag opens with a banner because it is a *project* — there is artwork, a brand, a brief
 * someone designed. A flywheel bag is a coin whose trading fees are being spent, so its identity is
 * the token's face, its ticker and its contract address, and the wide banner strip was dead space
 * holding a placeholder where a coin logo belongs. This is the same decision the Explore card made,
 * applied to the page: token first, PFP at coin size, and the address where it can be checked or
 * copied rather than tucked into a sentence.
 *
 * The bag's own title is still here — it is the *brief's* headline ("what to post about") — but it is
 * the second line, because it is the second question a visitor has.
 */
export function FlywheelBagHero({
  campaign,
  isOwner,
}: {
  campaign: Campaign;
  isOwner: boolean;
}) {
  const image = campaign.tokenImageUrl ?? campaign.token.logoUrl;
  const ticker = campaign.token.symbol || "—";
  /** The launched mint: what fee deposits are matched on, and the coin's real address. */
  const ca = campaign.feeMint ?? campaign.token.mint;
  const initials = (campaign.token.symbol || campaign.title).slice(0, 2).toUpperCase();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span
            className={cn(
              // Coin-logo size, round — the shape a token appears in everywhere else in the app.
              "flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border sm:size-20",
              image ? "bg-muted/30" : "bg-brand/10",
            )}
          >
            {image ? (
              <img
                src={image}
                alt={`${campaign.token.name} token`}
                className="size-full object-cover"
              />
            ) : (
              <span className="text-base font-semibold tracking-tight text-brand">{initials}</span>
            )}
          </span>

          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {/*
                `h2`, not `h1`: the page header above already owns the document's single h1. A second
                one would give assistive tech two document titles and make the outline ambiguous.
              */}
              <h2 className="title-display text-xl text-foreground sm:text-2xl">
                {campaign.token.name}
              </h2>
              <BagStatusBadge status={campaign.status} />
              {campaign.feeRedirectEnabled ? <FeeRedirectBadge /> : null}
              {isOwner ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-brand/40 bg-brand/10 px-1.5 py-0 text-[10px] font-medium text-brand"
                  title="You funded this bag — manage it from My Bags"
                >
                  Your bag
                </Badge>
              ) : null}
            </div>

            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span className="font-medium tracking-wide text-foreground">${ticker}</span>
              <span aria-hidden="true">·</span>
              <span className="min-w-0 truncate">{campaign.title}</span>
            </p>

            {/* The contract address: the coin's identity, copyable, with both places to check it. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                CA
              </span>
              <code className="truncate font-mono text-xs text-foreground" title={ca}>
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
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Copy aria-hidden="true" className="size-3" />
              </button>
              <a
                href={explorerUrl("address", ca)}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="View this coin on Solscan"
                title="View on Solscan"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowUpRight aria-hidden="true" className="size-3" />
              </a>
              <a
                href={`https://pump.fun/coin/${ca}`}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="View this coin on pump.fun"
                title="View on pump.fun"
                className="inline-flex items-center gap-1 rounded-md p-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <TrendingUp aria-hidden="true" className="size-3" />
                pump.fun
              </a>
            </div>
          </div>
        </div>

        <PlatformIconRow platforms={campaign.platforms} tileClassName="size-7" />
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">{campaign.description}</p>
    </div>
  );
}

/**
 * The flywheel half of a bag page: which coin this is, and what it has paid out.

/**
 * The flywheel half of a bag page: which coin this is, and what it has paid out.
 *
 * Deliberately *not* a second fee panel. The page already carries `FeeRedirectPanel` — live budget,
 * totals, treasury address, and the whole deposit history with an explorer link per conversion —
 * and `Who's in this bag` already lists participants with their avatars. Repeating either here
 * would give the same number two homes and two chances to disagree.
 *
 * So this adds the two things a flywheel bag has that a fixed-budget bag does not, and that nothing
 * on the page was showing:
 *
 *   1. **Token identity** — the coin's face, ticker and mint, as somewhere to check and to copy.
 *      A fixed-budget bag's identity is its banner; a flywheel bag's is a mint address.
 *   2. **Payouts** — what has actually left the bag for creators. Aggregate only, for the reason
 *      given at the bottom of the panel.
 */
export function FlywheelPanel({
  campaign,
  className,
}: {
  campaign: Campaign;
  className?: string;
}) {
  const image = campaign.tokenImageUrl ?? campaign.token.logoUrl;
  const ticker = campaign.token.symbol || "—";
  const mint = campaign.feeMint ?? campaign.token.mint;
  const initials = (campaign.token.symbol || campaign.title).slice(0, 2).toUpperCase();

  return (
    <SectionCard
      title="Coin & payouts"
      description="This bag is funded by the coin's trading fees rather than by a publisher's deposit"
      className={className}
      contentClassName="space-y-4"
    >
      {/* ---- Token identity -------------------------------------------------------------- */}
      <div className="flex items-center gap-3.5">
        <span
          className={`flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border ${
            image ? "bg-muted/30" : "bg-brand/10"
          }`}
        >
          {image ? (
            <img
              src={image}
              alt={`${campaign.token.name} token`}
              className="size-full object-cover"
            />
          ) : (
            <span className="text-sm font-semibold tracking-tight text-brand">{initials}</span>
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">{campaign.token.name}</p>
          <p className="truncate text-sm text-muted-foreground">${ticker}</p>
        </div>
      </div>

      {/* The mint, copyable and linked: for a coin, the address *is* the identity. */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Mint
        </span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" title={mint}>
          {truncateAddress(mint, 8, 8)}
        </code>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="size-7 shrink-0 p-0"
          aria-label="Copy the mint address"
          onClick={() => {
            void navigator.clipboard?.writeText(mint);
            toast.success("Mint address copied");
          }}
        >
          <Copy aria-hidden="true" className="size-3.5" />
        </Button>
        <Button asChild size="sm" variant="ghost" className="size-7 shrink-0 p-0">
          <a
            href={explorerUrl("address", mint)}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="View the mint on Solscan"
            title="View on Solscan"
          >
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </a>
        </Button>
        {/*
          The launchpad page for the same mint, when there is one. A launched coin is a pump.fun
          token and that is where its price and curve live, so the bag page should be able to hand
          someone over to it rather than making them search by address.
        */}
        <Button asChild size="sm" variant="ghost" className="size-7 shrink-0 p-0">
          <a
            href={`https://pump.fun/coin/${mint}`}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="View this coin on pump.fun"
            title="View on pump.fun"
          >
            <TrendingUp aria-hidden="true" className="size-3.5" />
          </a>
        </Button>
      </div>

      {/* ---- What the bag has paid out ---------------------------------------------------- */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Paid to creators" value={usd(campaign.spent, { cents: true })} tone="brand" />
        <Stat label="Submissions" value={String(campaign.submissionsCount)} />
        <Stat label="Remaining" value={usd(campaign.remaining, { cents: true })} />
      </dl>

      <dl className="space-y-2 rounded-xl border border-border p-3.5">
        <InfoRow
          label="Share redirected"
          value={campaign.feeRedirectPct !== null ? `${campaign.feeRedirectPct}%` : "—"}
        />
        <InfoRow label="Raised from fees" value={usd(campaign.feeRaisedUsdc, { cents: true })} />
        <InfoRow label="Payout wallet" value={truncateAddress(campaign.treasury, 6, 6)} />
      </dl>

      {/*
        Said out loud rather than silently omitted. A reader looking for "who got paid" would
        otherwise assume the panel was broken, and the reason it is not here is deliberate: a bag
        page is readable by anyone, so it carries identity only — no post links, no verdicts, no
        per-creator amounts. Those stay with the creator (My Submissions) and the publisher
        (My Bags).
      */}
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
        Totals only. Which creator was paid what stays between them and the publisher — this page is
        readable by anyone, so it does not carry per-creator payout detail.
      </p>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <Wallet aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
        Fee history and the treasury address are in the live-budget panel above; who has joined is
        listed just below.
      </p>
    </SectionCard>
  );
}

/** One headline figure. Same shape as the fee panel's, so the two read as one page. */
function Stat({ label, value, tone }: { label: string; value: string; tone?: "brand" }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd
        className={`text-sm font-semibold tabular-nums ${
          tone === "brand" ? "text-brand" : "text-foreground"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
