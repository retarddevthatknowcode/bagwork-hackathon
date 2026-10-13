"use client";

import { TrendingUp } from "lucide-react";

import { relative, usd } from "@/lib/console/format";
import { flywheelWindow, flywheelWindowMessage } from "@/lib/campaigns/flywheel-window";
import type { Campaign, FeeSummary, FeeSyncState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SectionCard } from "./ui";

/**
 * Where a flywheel bag's money is, right now.
 *
 * The panel a visitor reads to answer one question: the coin's fees are supposedly funding this bag,
 * so *are they?* Every number is a record — a row in `fee_deposits`, a column on the campaign, or the
 * last sweep's own report — and nothing here is projected, smoothed or rounded up to look busier than
 * it is. Where a figure genuinely does not exist yet the panel says so ("—", "No fees yet") rather
 * than showing a zero that reads as "this is broken".
 *
 * The three money facts it separates, because they fail differently and are fixed differently:
 *
 *   1. **Collected** — deposits that arrived. If this is 0, nothing is being routed to us yet.
 *   2. **Waiting** — deposits in the wallet that have not been converted. A number here is normal and
 *      usually means the swap floor has not been reached; the panel says how much more is needed.
 *   3. **Credited** — USDC that actually settled and became this bag's budget, which is what the
 *      payout figures are drawn from.
 *
 * The floor is stated out loud. A visitor watching a small coin expects growth and sees a static
 * budget; "fees accumulate until $20 before each swap" is the honest explanation of that, not a
 * footnote about batch processing.
 */
export function FeeTransparencyPanel({
  campaign,
  summary,
  sync,
  className,
}: {
  campaign: Campaign;
  summary: FeeSummary | null;
  sync: FeeSyncState | null;
  className?: string;
}) {
  const waitingUsd = summary?.waitingUsdc ?? null;
  const hasFees = (summary?.deposits ?? 0) > 0;

  /**
   * Whether the money above can be spent by a creator yet.
   *
   * Named `optIn` rather than `window`, which would shadow the global one in a Client Component and
   * turn an accidental reference into a bug that only fails at runtime.
   */
  const optIn = flywheelWindow(campaign);

  /*
   * One activity line, assembled from what is actually known and omitted when it is not.
   *
   * This replaced three labelled rows that each printed "—" on a bag that had never received a fee.
   * A single sentence with real timestamps in it is information; three labelled dashes in a bordered
   * box is the shape of information with none of the content.
   */
  const lastActivity = summary?.lastDepositAt
    ? `Last fee ${relative(summary.lastDepositAt)}${
        summary.lastSwapAt ? ` · last swap ${relative(summary.lastSwapAt)}` : ""
      }`
    : summary?.lastSwapAt
      ? `Last swap ${relative(summary.lastSwapAt)}`
      : null;

  /** What the most recent sweep did, as two numbers. */
  const sweepLine = sync
    ? `${sync.scanned} transfer${sync.scanned === 1 ? "" : "s"} examined · ${sync.swapped} converted`
    : null;

  return (
    <SectionCard
      title="Where the fees are"
      className={className}
      contentClassName="space-y-3"
    >
      {/* ---- The three money facts, in the order they happen ---------------------------- */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Fees collected"
          value={hasFees ? String(summary?.deposits ?? 0) : "None yet"}
          hint={
            summary?.lastDepositAt ? `last ${relative(summary.lastDepositAt)}` : "no deposits detected"
          }
        />
        <Stat
          label="Swapped to USDC"
          value={summary && summary.swappedCount > 0 ? usd(summary.swappedUsdc, { cents: true }) : "—"}
          hint={
            summary && summary.swappedCount > 0
              ? `${summary.swappedCount} conversion${summary.swappedCount === 1 ? "" : "s"}`
              : "nothing converted yet"
          }
          tone={summary && summary.swappedCount > 0 ? "brand" : undefined}
        />
        <Stat
          label="Waiting to swap"
          // "—" is a real answer here: unpriced means no quote has ever been obtained.
          value={waitingUsd === null ? "—" : usd(waitingUsd, { cents: true })}
          hint={
            summary && summary.waitingCount > 0
              ? `${summary.waitingCount} deposit${summary.waitingCount === 1 ? "" : "s"} held in the fee wallet`
              : "nothing waiting"
          }
        />
      </dl>

      {/* ---- What the credited fees have become ----------------------------------------- */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Budget now" value={usd(campaign.budget, { cents: true })} hint="credited to this bag" />
        <Stat label="Paid to creators" value={usd(campaign.spent, { cents: true })} hint="settled payouts" />
        <Stat label="Remaining" value={usd(campaign.remaining, { cents: true })} hint="available to spend" />
      </dl>

      {/*
        The floor is a rule, not a paragraph. It used to be explained in three sentences spanning a
        bordered callout with a fuel icon, all to say one number — and on a bag that had never seen a
        fee it said nothing at all, in a box. What a visitor needs is how much is waiting and how much
        more would clear it, which is what the figures above already report.
      */}

      {/*
        The rule that decides whether any of the figures above can be spent by a creator, next to the
        figures themselves: someone watching a budget grow is asking exactly this, and "at least $20"
        is the answer. It replaced three prose sentences that never said the number.
      */}
      <p
        className={cn(
          "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[11px] leading-relaxed",
          optIn.open
            ? "border-brand/30 bg-brand/5 text-foreground"
            : "border-warning/30 bg-warning/5 text-warning",
        )}
      >
        <TrendingUp aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        {flywheelWindowMessage(optIn)}
      </p>

      {/* The failure count is reported once, below, in a single line — see the note there. */}

      {lastActivity || sweepLine ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {[lastActivity, sweepLine].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {summary && summary.failedCount > 0 ? (
        <p className="text-[11px] leading-relaxed text-warning">
          {summary.failedCount} deposit{summary.failedCount === 1 ? "" : "s"} failed to convert — retried
          on a later sweep.
        </p>
      ) : null}
    </SectionCard>
  );
}

/** One figure. Same shape as the other panels', so the page reads as one. */
function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "brand";
}) {
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
      {hint ? <p className="text-[10px] leading-relaxed text-muted-foreground/70">{hint}</p> : null}
    </div>
  );
}
