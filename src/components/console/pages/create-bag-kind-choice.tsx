"use client";

import { ArrowRight, Coins, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The first thing Create Bag asks: which kind of campaign is this?
 *
 * Two products live behind this screen and they are funded in opposite ways — one from the
 * publisher's wallet, one from a token's trading fees. They were previously one form with a
 * "Fee Redirect" switch buried inside the funding step, which meant a publisher had to understand
 * both models before choosing, and the form asked questions that only applied to one of them.
 *
 * Choosing here is what makes the separation real: every field after this belongs to exactly one
 * flow, and neither flow can ask for the other's inputs.
 *
 * Presentational on purpose — it takes a callback and renders two buttons. That keeps the decision
 * testable and keeps the wizards free to own their own state.
 */

export type BagKind = "fixed" | "flywheel";

interface Option {
  kind: BagKind;
  icon: typeof Coins;
  eyebrow: string;
  title: string;
  /** The difference in one sentence. */
  promise: string;
  points: string[];
  /** The commitment, stated plainly, so nobody starts a flow they cannot finish. */
  commitment: string;
  cta: string;
}

const OPTIONS: Option[] = [
  {
    kind: "fixed",
    icon: Coins,
    eyebrow: "Funded by you",
    title: "Create a Bag campaign",
    promise: "You fund one fixed budget. It pays creators until it runs out.",
    points: [
      "Write the brief, pick platforms and set the rate",
      "Send the budget to Bagwork in SOL, USDC or your own token",
      "The bag goes LIVE the moment the transfer is confirmed",
    ],
    commitment: "Needs an upfront budget",
    cta: "Create a fixed-budget Bag",
  },
  {
    kind: "flywheel",
    icon: TrendingUp,
    eyebrow: "Funded by your token",
    title: "Launch a flywheel coin",
    promise:
      "Launch a coin from Bagwork. Its trading fees become the bag's budget — nothing to pay upfront.",
    points: [
      "Launch on pump from Bagwork in a couple of wallet prompts",
      "100% of creator fees auto-lock to Bagwork — permanently",
      "A bag opens with the coin and grows as your token trades",
    ],
    commitment: "You pay the launch costs; creator fees fund the bag",
    cta: "Launch a flywheel coin",
  },
];

export function CreateBagKindChoice({
  onSelect,
  className,
}: {
  onSelect: (kind: BagKind) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-5", className)}>
      <div className="space-y-1.5">
        <h2 className="title-display text-lg text-foreground">How is this campaign funded?</h2>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          These are two different products, with different setup and different payout maths. Pick
          one — everything after this is specific to it.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const flywheel = option.kind === "flywheel";
          return (
            <div
              key={option.kind}
              className={cn(
                "flex flex-col gap-4 rounded-2xl border bg-card/40 p-5",
                "transition-colors duration-200 hover:bg-card/60 motion-reduce:transition-none",
                // The cards are the only choice on this screen, so the emphasis is the CTA; the
                // flywheel is tinted because it is the unusual one of the two.
                flywheel
                  ? "border-brand/30 hover:border-brand/50"
                  : "border-border hover:border-brand/40",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl border",
                    flywheel
                      ? "border-brand/40 bg-brand/10 text-brand"
                      : "border-border bg-muted/40 text-muted-foreground",
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {option.eyebrow}
                  </p>
                  <h3 className="title-display truncate text-base text-foreground">
                    {option.title}
                  </h3>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-foreground">{option.promise}</p>

              <ul className="space-y-1.5">
                {option.points.map((point) => (
                  <li
                    key={point}
                    className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1 shrink-0 rounded-full bg-brand/60"
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>

              {/* `mt-auto` so both cards' buttons line up however long the copy turns out. */}
              <div className="mt-auto space-y-3 pt-1">
                <p
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-[11px] font-medium",
                    flywheel
                      ? "border-brand/30 bg-brand/5 text-brand"
                      : "border-border bg-muted/30 text-muted-foreground",
                  )}
                >
                  {option.commitment}
                </p>
                <Button
                  type="button"
                  variant={flywheel ? "default" : "outline"}
                  className="w-full justify-between gap-2"
                  onClick={() => onSelect(option.kind)}
                >
                  {option.cta}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}