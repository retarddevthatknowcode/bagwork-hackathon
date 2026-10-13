import { treasuryAddressFor } from "@/lib/solana/treasury";

/**
 * Launch-on-Bagwork configuration.
 *
 * The launch flow moves real SOL and permanently assigns a coin's creator fees, so it is the one
 * feature here that must not be able to run by accident. Everything in this module is therefore
 * written to *fail closed*: the flow is off unless an operator has explicitly armed it, and a launch
 * cannot be built unless the FEE treasury this deployment would receive fees into is resolvable.
 *
 * A half-configured launch — a flag with no treasury, or a treasury with no flag — is reported as
 * "not set up" rather than turned into a transaction that routes creator fees to an address nobody
 * controls. That asymmetry is the whole point: a disabled feature is an inconvenience, a misrouted
 * fee lock is permanent.
 */

/** Basis points in 100%. Every fee split must add up to exactly this. */
export const TOTAL_SHARE_BPS = 10_000;

/**
 * The hard cap on the dev buy: 10% of the token's total supply.
 *
 * Enforced in `readLaunchDraft` before any transaction is built *and* again when the launch is
 * recorded, so a client that skips the form cannot exceed it. A dev buy is the launcher's own money
 * and is entirely optional; the cap exists because a larger one is the classic rug shape, and this
 * product's promise is that a bag is funded by trading rather than by extraction.
 */
export const MAX_DEV_BUY_BPS = 1_000;

/**
 * Every pump.fun coin's supply, in base units: 1,000,000,000 tokens at 6 decimals.
 *
 * The launchpad mints every coin with exactly this supply, which is what makes a dev buy's size —
 * and so the 10% cap — computable before anything is signed. Nothing about fee routing depends on
 * it, so if pump ever changes the supply the worst case is a wrong dev-buy estimate, not a wrong
 * fee destination.
 */
export const PUMP_TOTAL_SUPPLY_BASE_UNITS = BigInt("1000000000000000");

/*
 * There is deliberately no `LAUNCH_RENT_LAMPORTS` any more.
 *
 * It existed as `BigInt(0)` with a comment claiming it was "the lamport cost of a mint account,
 * plus the metadata/curve rent a create pays" — a reserve that reserved nothing, exported and read
 * by nobody. A number like that is worse than no number: it looks like a considered budget, so the
 * next person to touch the launch fee math would trust it and under-reserve.
 *
 * The real headroom is computed where it is actually needed (`launch/instructions.ts`, from
 * `BASE_FEE_LAMPORTS`), and the rent is real on-chain rent paid by the launcher's own connected
 * wallet — see the money rule in `.env.example`. Nothing about a launch is sized against the FEE
 * treasury's balance; it only ever receives.
 */

/** The env var that arms the launch flow. */
const ENABLE_FLAG = "PUMP_LAUNCH_ENABLED";

/**
 * Values accepted as "on".
 *
 * Deliberately a small allow-list rather than a truthiness test, because the failure this replaced
 * was invisible: a dashboard entry of `"true"` (quotes included) or `TRUE` read as "switched off"
 * with no way to tell a typo from a missing variable. Everything here is compared after trimming
 * and case-folding, and surrounding quotes are stripped, so the three shapes people actually type
 * all mean yes.
 */
const TRUTHY_VALUES = new Set(["true", "1", "yes", "on"]);

/** What the parse did, so a failure can say *which* failure it was. */
export interface LaunchFlagState {
  /** The variable's name, so a message can name exactly what to set. */
  name: string;
  /** False when the variable is absent or blank — "not set", as opposed to "set wrong". */
  present: boolean;
  /** True only when the value was recognised as a yes. */
  armed: boolean;
  /** True when something was set that this parser does not accept. */
  unrecognised: boolean;
}

/**
 * Reads `PUMP_LAUNCH_ENABLED` tolerantly.
 *
 * `true`, `TRUE`, ` True `, `"true"`, `'true'`, `1`, `yes` and `on` all arm the flow; anything else
 * — including absent — leaves it off, and says which case it was. Every rejected shape is a real
 * thing an operator has typed into a dashboard, and none of them deserves to look like a code bug.
 */
export function launchFlagState(): LaunchFlagState {
  const raw = process.env[ENABLE_FLAG];

  // Quotes are stripped repeatedly: an env entry copy-pasted from JSON arrives as `""true""`.
  let cleaned = (raw ?? "").trim();
  while (cleaned.length > 1 && /^["'].*["']$/.test(cleaned)) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  cleaned = cleaned.toLowerCase();

  const present = (raw ?? "").trim() !== "";
  const armed = TRUTHY_VALUES.has(cleaned);

  return {
    name: ENABLE_FLAG,
    present,
    armed,
    unrecognised: present && !armed,
  };
}

export interface LaunchAvailability {
  /** True only when the flow is both switched on and fully configured. */
  enabled: boolean;
  /** The FEE treasury a launch locks creator fees to. Null when it cannot be resolved. */
  treasury: string | null;
  /** Why it is unavailable, phrased for an operator. Null when it is available. */
  reason: string | null;
  /** How the enable flag parsed — the diagnosis for "it is set, so why is this still off?". */
  flag: LaunchFlagState;
}

/**
 * Whether a launch can be built right now, and if not, why.
 *
 * Deliberately returns the treasury alongside the flag so a caller cannot accidentally use one
 * without the other. Read on every call rather than cached at module load, so flipping the env var
 * takes effect on the next request instead of needing a redeploy to be believed — though note that
 * Vercel does not retro-apply an env change to a *running* deployment: the value is fixed for the
 * life of the deployment that read it, and a new deployment is what picks a change up.
 *
 * The two ways this reports "off" are stated separately, because they have different fixes:
 * the flag (an operator sets a variable) and the treasury (a key must exist). It never fails closed
 * because of wording — a recognised flag plus a resolvable treasury is `enabled: true`, full stop.
 */
export function launchAvailability(): LaunchAvailability {
  const flag = launchFlagState();
  const treasury = treasuryAddressFor("FEE");

  if (!flag.armed) {
    /*
     * Noisy on purpose. "Launching is switched off" on screen, with the variable visibly set in
     * the dashboard, is the single most confusing state this feature has, and it is always one of
     * three things: not set here, set to a shape we do not accept, or set on a deployment that
     * predates the change. The log line names which.
     */
    console.warn(
      flag.unrecognised
        ? `[launch] ${ENABLE_FLAG} is set to an unrecognised value, so launching stays off. Use "true".`
        : `[launch] ${ENABLE_FLAG} is not set for this deployment, so launching is off. Set it to "true" and redeploy.`,
    );

    return {
      enabled: false,
      treasury,
      reason:
        flag.unrecognised
          ? `Launching is switched off because ${ENABLE_FLAG} is set to a value this deployment ` +
            `does not recognise. An operator should set it to "true" (accepted: true, 1, yes, on) ` +
            `and redeploy — environment changes only apply to a new deployment.`
          : `Launching is switched off on this deployment. An operator must set ` +
            `${ENABLE_FLAG}=true and redeploy. Pump.fun's create and fee-share instructions are ` +
            `mainnet-only, so the gate is a deliberate switch rather than a devnet rehearsal — ` +
            `there is no testnet run to wait for.`,
      flag,
    };
  }

  if (!treasury) {
    return {
      enabled: false,
      treasury: null,
      reason:
        `Launching is armed but the fee treasury is not configured, so there is nowhere to lock ` +
        `creator fees. Set TREASURY_FEE_PRIVATE_KEY (or TREASURY_FEE_ADDRESS) and redeploy.`,
      flag,
    };
  }

  return { enabled: true, treasury, reason: null, flag };
}


/** The treasury a launch must lock 100% of creator fees to, or null when unconfigured. */
export function launchTreasury(): string | null {
  return treasuryAddressFor("FEE");
}
