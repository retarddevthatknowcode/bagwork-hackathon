import { normalizePlatforms } from "@/lib/types";

import { MAX_DEV_BUY_BPS, PUMP_TOTAL_SUPPLY_BASE_UNITS, TOTAL_SHARE_BPS } from "./config";

/**
 * The Launch Wizard's draft and the rules it is held to.
 *
 * Pure on purpose — no Prisma, no connection, no SDK — so the same validation runs in the wizard
 * (to disable a button) and on the server (to reject a request). A cap that only exists in the UI is
 * not a cap, and duplicating the rules in two places is how the two drift.
 */

/** How many characters a pump ticker can carry before the launchpad rejects it. */
export const MAX_SYMBOL_LENGTH = 10;
export const MAX_NAME_LENGTH = 32;
/** Shortest description we will accept: pump metadata wants something real, not a placeholder. */
export const MIN_DESCRIPTION_LENGTH = 20;

export interface LaunchSocials {
  x?: string;
  telegram?: string;
  /*
   * There is deliberately no `website` here.
   *
   * A launched coin's website is always Bagwork, so it is not the launcher's to supply — and a field
   * that existed but was ignored would be worse than no field, because the metadata builder would be
   * the only thing standing between a client and a wrong value written permanently on-chain. Leaving
   * it out of the type means there is no channel for it at all; `buildTokenMetadata` sets it.
   */
}

/** Everything the wizard collects, across all four steps. */
export interface LaunchDraft {
  // ---- Step 1: the token ----
  name: string;
  symbol: string;
  description: string;
  /** Token artwork. Uploaded to Supabase Storage, or an external http(s) URL. */
  imageUrl: string | null;
  socials: LaunchSocials;

  // ---- Step 2: the bag's content rules ----
  /** The bag's public title. Defaults to the token name when left blank. */
  title: string;
  /** The content brief workers are held to. Defaults to the token description. */
  brief: string;
  platforms: string[];
  ratePer1k: number;
  maxPayout: number;
  durationDays: number;
  maxSubmissions: number | null;
  maxPerCreator: number | null;

  // ---- Step 3: launch settings ----
  /** SOL the launcher buys with in the same transaction. 0 skips the dev buy entirely. */
  devBuySol: number;
}

export type ReadLaunchDraftResult = { ok: true; draft: LaunchDraft } | { ok: false; error: string };

function readOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
}

/**
 * Reads the token artwork.
 *
 * **Deliberately not `readUrl`.** That one exists to keep `javascript:` and other non-link schemes
 * out of the metadata's social fields, so it rejects anything without an `http(s)://` scheme — and
 * this field is *usually* a same-origin path. `POST /api/uploads/banner` stores the file itself and
 * returns `/api/uploads/banner/<id>` precisely so the artwork never depends on an external host
 * continuing to serve it, and the metadata builder absolutises that path when it writes the document.
 *
 * Running it through `readUrl` turned every successful upload into `null`, which is why the wizard
 * could show a picture, clear its own blocker, and still be refused for having no image.
 *
 * Accepts the two shapes that are real — our own upload path, or an absolute http(s) URL — and
 * refuses `blob:`, which exists only in the tab that made it and would be embedded in an on-chain
 * document that outlives it.
 */
function readImageUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\/api\/uploads\/banner\/[A-Za-z0-9_-]+$/.test(raw)) return raw;
  return /^https?:\/\//i.test(raw) ? raw : null;
}

function readUrl(value: unknown): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  // Only http(s) is carried into the metadata JSON: pump renders these as links, so anything else
  // (a `javascript:` URL, say) would be a hole rather than a social.
  return /^https?:\/\//i.test(raw) ? raw : undefined;
}

/**
 * Validates and normalises a launch draft.
 *
 * The dev buy is checked here only for sanity (finite, non-negative); its *size* is checked against
 * the 10%-of-supply cap by the build route, because that number is a property of the bonding curve
 * and can only be computed with the launchpad's own maths. Both checks exist — they simply measure
 * different things, and neither can be derived from the other.
 */
export function readLaunchDraft(body: Record<string, unknown>): ReadLaunchDraftResult {
  const name = String(body.name ?? "").trim();
  const symbol = String(body.symbol ?? "").trim();
  const description = String(body.description ?? "").trim();
  const title = String(body.title ?? "").trim() || name;
  const brief = String(body.brief ?? "").trim() || description;
  const platforms = normalizePlatforms(body.platforms);
  const imageUrl = readImageUrl(body.imageUrl);

  const socialsRaw = (body.socials ?? {}) as Record<string, unknown>;
  const socials: LaunchSocials = {
    x: readUrl(socialsRaw.x),
    telegram: readUrl(socialsRaw.telegram),
    // `website` is not read from the body at all. It is Bagwork's, and the metadata builder sets it.
  };

  const ratePer1k = Number(body.ratePer1k ?? 0);
  const maxPayout = Number(body.maxPayout ?? 0);
  const durationDays = Number(body.durationDays ?? 14);
  const maxSubmissions = readOptionalInt(body.maxSubmissions);
  const maxPerCreator = readOptionalInt(body.maxPerCreator);
  const devBuySol = Number(body.devBuySol ?? 0);

  const errors: string[] = [];

  if (name.length < 1 || name.length > MAX_NAME_LENGTH)
    errors.push(`Token name must be between 1 and ${MAX_NAME_LENGTH} characters`);
  if (!symbol || symbol.length > MAX_SYMBOL_LENGTH)
    errors.push(`Ticker must be between 1 and ${MAX_SYMBOL_LENGTH} characters`);
  // A ticker with whitespace or punctuation is mangled by the launchpad's own metadata and renders
  // badly everywhere we show it, so it is refused before the user pays to find out.
  if (symbol && !/^[A-Za-z0-9]+$/.test(symbol))
    errors.push("Ticker can only contain letters and numbers");
  if (description.length < MIN_DESCRIPTION_LENGTH)
    errors.push(`Token description must be at least ${MIN_DESCRIPTION_LENGTH} characters`);

  if (title.length < 4) errors.push("Bag title must be at least 4 characters");
  if (brief.length < MIN_DESCRIPTION_LENGTH)
    errors.push(`Content brief must be at least ${MIN_DESCRIPTION_LENGTH} characters`);
  if (platforms.length === 0) errors.push("Select at least one platform");
  if (!(ratePer1k > 0)) errors.push("Set a reward per 1,000 views greater than zero");
  if (!(maxPayout > 0)) errors.push("Set a per-post cap greater than zero");
  if (!Number.isFinite(durationDays) || durationDays < 3 || durationDays > 90)
    errors.push("Duration must be between 3 and 90 days");
  if (maxSubmissions !== null && maxSubmissions < 1)
    errors.push("Max submissions must be at least 1");
  if (maxPerCreator !== null && maxPerCreator < 1)
    errors.push("Max per creator must be at least 1");
  if (maxSubmissions !== null && maxPerCreator !== null && maxPerCreator > maxSubmissions)
    errors.push("Max per creator cannot exceed max submissions");
  if (!Number.isFinite(devBuySol) || devBuySol < 0)
    errors.push("Dev buy must be zero or greater");

  if (errors.length) return { ok: false, error: errors.join("; ") };

  return {
    ok: true,
    draft: {
      name,
      symbol: symbol.toUpperCase(),
      description,
      imageUrl,
      socials,
      title,
      brief,
      platforms,
      ratePer1k,
      maxPayout,
      durationDays,
      maxSubmissions,
      maxPerCreator,
      devBuySol,
    },
  };
}

/**
 * A dev buy's size as basis points of the token's total supply.
 *
 * The unit the 10% cap is defined in, so the cap check reads as what it means: a comparison between
 * two numbers that are both fractions of the same supply.
 */
export function devBuyBps(tokenAmountBaseUnits: bigint): number {
  if (tokenAmountBaseUnits <= BigInt(0)) return 0;
  return Number((tokenAmountBaseUnits * BigInt(TOTAL_SHARE_BPS)) / PUMP_TOTAL_SUPPLY_BASE_UNITS);
}

/** True when a dev buy is within the hard cap. The one predicate the route, the quote and the UI use. */
export function devBuyWithinCap(tokenAmountBaseUnits: bigint): boolean {
  return devBuyBps(tokenAmountBaseUnits) <= MAX_DEV_BUY_BPS;
}

/** A dev buy over the cap is refused with the same sentence everywhere it is checked. */
export const DEV_BUY_CAP_MESSAGE =
  `A dev buy cannot exceed ${MAX_DEV_BUY_BPS / 100}% of the token's supply. Reduce the amount and try again.`;

