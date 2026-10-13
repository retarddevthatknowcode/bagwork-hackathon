import { usd } from "@/lib/console/format";
import { cn } from "@/lib/utils";

/**
 * Paid vs remaining, in one bar.
 *
 * The width is the whole budget; the bar splits into what has actually settled to creators and
 * what is still available. This was three different bars — `BagCard`, the bag page and the
 * publisher's My Bags row each drew their own — which is why the same bag could describe its
 * money three slightly different ways. One component, one set of numbers.
 *
 * The figures come straight from the campaign payload: `spent` is the sum of paid payouts and
 * `budget` is the current budget. Nothing is estimated, and a fee-redirect bag needs no special
 * case here — its budget grows in the database, so a live `budget`/`spent` pair is already
 * "current budget vs paid".
 *
 * Clamping happens once, in here. A payload that claims more spent than budget (a mid-write
 * read, or a budget reduced by an operator after payouts) can never produce a negative
 * "remaining" or a segment wider than the track.
 */

/**
 * The two numbers, plus how the row should read. Plain numbers rather than a `Campaign`, so the
 * same bar serves the buyer's card, the bag page and the publisher's row without any of them
 * having to reshape their data first.
 */
export interface BudgetBarProps {
  /** USDC already settled to creators. */
  spent: number;
  /** The campaign's current total budget. */
  total: number;
  /** Row heading, above the bar. */
  label?: string;
  /** Optional line under the bar. */
  hint?: string;
  /** Bar height: `sm` in cards, `md` on the bag page. */
  size?: "sm" | "md";
  /**
   * Show "$X of $Y" beside the percentage. Off where a stat list directly above already spells
   * the same three figures out, so the row does not say everything twice.
   */
  amounts?: boolean;
  className?: string;
}

export function BudgetBar({
  spent,
  total,
  label = "Budget paid out",
  hint,
  size = "sm",
  amounts = true,
  className,
}: BudgetBarProps) {
  const hasBudget = Number.isFinite(total) && total > 0;
  const safeTotal = hasBudget ? total : 0;
  const paid = Number.isFinite(spent) ? Math.max(0, spent) : 0;
  const paidClamped = Math.min(paid, safeTotal);
  const remaining = Math.max(0, safeTotal - paid);
  const percent = hasBudget ? (paidClamped / safeTotal) * 100 : 0;

  const trackHeight = size === "md" ? "h-2" : "h-1.5";

  /*
    No budget to describe.

    A bar that reads 0% of $0 is a claim about money that is not there, so the track is drawn
    empty and dashed, and the row says so instead of showing a percentage.
  */
  if (!hasBudget) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-muted-foreground">{label}</span>
          <span className="text-muted-foreground/70">No budget set</span>
        </div>
        <div
          aria-hidden="true"
          className={cn(
            "w-full rounded-full border border-dashed border-border bg-foreground/[0.03]",
            trackHeight,
          )}
        />
        {hint ? <p className="text-[11px] text-muted-foreground/80">{hint}</p> : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <span className="font-medium text-foreground">{Math.round(percent)}%</span>
          {amounts ? (
            <>
              {" · "}
              {usd(paid)} of {usd(safeTotal)}
            </>
          ) : null}
        </span>
      </div>

      {/*
        The bar is decorative. Every number it encodes — paid, total, remaining — is already
        written out as text above it or in the stat list beside it, so it is hidden from
        assistive tech rather than announced twice. The tooltip is the mouse-user's shortcut to
        the same three figures.

        The negative margin cancels the padding: it gives the tooltip a full-height hover target
        instead of a 6px sliver to hit, while occupying exactly the space of the bar itself.
      */}
      <div className="group/bar relative -my-1.5 py-1.5" aria-hidden="true">
        <div
          className={cn(
            "flex w-full overflow-hidden rounded-full bg-foreground/[0.08]",
            trackHeight,
          )}
        >
          {/* Paid. A soft left-to-right ramp on the brand colour — a flat fill reads as a
              loading bar, which this is not. */}
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/75 to-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
          {/* Remaining — the part of the budget still available to creators. */}
          <div className="h-full min-w-0 flex-1 bg-foreground/[0.14]" />
        </div>

        {/* Compact on purpose: three short lines, no title, no chart junk. */}
        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] leading-relaxed text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover/bar:opacity-100 motion-reduce:transition-none">
          <span className="block">
            <span className="text-muted-foreground">Paid: </span>
            <span className="font-medium tabular-nums">{usd(paid)}</span>
          </span>
          <span className="block">
            <span className="text-muted-foreground">Left: </span>
            <span className="font-medium tabular-nums">{usd(remaining)}</span>
          </span>
          <span className="block">
            <span className="text-muted-foreground">Total: </span>
            <span className="font-medium tabular-nums">{usd(safeTotal)}</span>
          </span>
        </div>
      </div>

      {hint ? <p className="text-[11px] text-muted-foreground/80">{hint}</p> : null}
    </div>
  );
}
