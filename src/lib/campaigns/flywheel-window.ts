/**
 * When a flywheel bag's opt-in window is open.
 *
 * A flywheel bag is funded by its coin's trading fees instead of a deposit, so it starts at $0 and
 * its budget arrives in chunks: fees land in the FEE wallet, are swapped to USDC once the swap floor
 * is reached, and are then credited to the bag. "Open to creators" therefore cannot mean "always" —
 * a bag with no money would hand out slots it can never pay for.
 *
 * The rule lives here, once, because the API gate and every screen that describes it have to say the
 * same thing:
 *
 *   - **Open** while the bag holds at least $20 of fee money.
 *   - **Short** below $20 — the window has not opened yet, or has closed again.
 *   - **Spent** at $0 — the budget ran out.
 *
 * It is a *threshold*, not a latch: fees that carry the bag back over $20 open it again, and paying
 * creators out below it closes it again. Nothing here is one-shot, and nothing latches.
 *
 * `available` is `budget − spent`, not `budget`. The budget column is the lifetime total raised from
 * fees, so paying a creator does not lower it; the money a creator can still be paid from is what is
 * left of it. A bag that raised $500 and paid out $495 is empty, not rich — and the rule is about
 * whether there is money to pay with. `spent` is the settled total (`payoutAmount` across submissions
 * with status `paid`), which is exactly what `Campaign.spent` already carries, so the browser passes
 * `campaign` straight in and the API routes sum that same column before calling this.
 *
 * The $20 deliberately matches the *default* fee-swap floor (`DEFAULT_FEE_SWAP_MIN_USD`): fees below
 * it are never converted, so a bag under the swap floor has no budget and therefore no window. They
 * are still separate numbers — the swap floor is a cost decision and this is a product decision — so
 * raising `FEE_SWAP_MIN_USD` in a deployment does not move this one.
 */
import { usd } from "@/lib/console/format";

/** What a flywheel bag has to hold before creators may opt in. */
export const FLYWHEEL_OPT_IN_MIN_USD = 20;

export type FlywheelWindowState = "open" | "short" | "spent";

export interface FlywheelWindow {
  open: boolean;
  state: FlywheelWindowState;
  /** Fee money still in the bag, in USDC. */
  availableUsd: number;
  /** The threshold this window is measured against. */
  minimumUsd: number;
  /** How much more has to arrive before it opens. `0` while it is open. */
  shortfallUsd: number;
}

/**
 * The window for a campaign, from two columns and nothing else.
 *
 * Takes the pair rather than a `Campaign` so the API routes, the bag page and the fee panels can all
 * ask the same question without having to hold the same type.
 */
export function flywheelWindow(campaign: { budget: number; spent: number }): FlywheelWindow {
  const availableUsd = Math.max(0, (campaign.budget ?? 0) - (campaign.spent ?? 0));
  const open = availableUsd >= FLYWHEEL_OPT_IN_MIN_USD;

  return {
    open,
    state: open ? "open" : availableUsd <= 0 ? "spent" : "short",
    availableUsd,
    minimumUsd: FLYWHEEL_OPT_IN_MIN_USD,
    shortfallUsd: open ? 0 : Math.max(0, FLYWHEEL_OPT_IN_MIN_USD - availableUsd),
  };
}

/**
 * The rule in one sentence, for the moment it matters: a refusal in the API, the line under an
 * opt-in button, the note on a bag with nothing in it yet.
 */
export function flywheelWindowMessage(window: FlywheelWindow): string {
  if (window.open) {
    return `This bag's opt-in window is open — ${usd(window.availableUsd, {
      cents: true,
    })} of fee budget is available. It closes if the budget is spent.`;
  }

  if (window.state === "spent") {
    return `This bag's fee budget is spent, so the opt-in window is closed. It reopens on its own as soon as new fees push the bag back over ${usd(
      window.minimumUsd,
    )}.`;
  }

  return `This bag's opt-in window opens once trading fees have built the budget to ${usd(
    window.minimumUsd,
  )}. It holds ${usd(window.availableUsd, { cents: true })} — ${usd(window.shortfallUsd, {
    cents: true,
  })} more opens it.`;
}

/** Two or three words for a badge or a tooltip, where the sentence above will not fit. */
export function flywheelWindowLabel(window: FlywheelWindow): string {
  if (window.open) return "Opt-in open";
  return window.state === "spent" ? "Opt-in closed — spent" : "Opt-in closed — under $20";
}
