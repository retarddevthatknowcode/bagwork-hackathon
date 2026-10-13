import { isValidSolanaAddress } from "@/lib/solana/connection";
import { normalizePlatforms } from "@/lib/types";

import { MIN_BUDGET, MIN_FIXED_BUDGET_USDC } from "./limits";

/**
 * Campaign authoring rules — the one place the server validates and normalises a bag.
 *
 * Extracted verbatim from `POST /api/campaigns` so that the publisher flow and the admin
 * portal (`POST /api/admin/campaigns`) enforce the same rules: a bag an operator creates has
 * to be a bag the slot maths, the payout path and the review engine can all handle.
 * Everything that differs between the two — who owns it, whether money had to be transferred,
 * whether it may open already LIVE — stays in the route that owns that decision.
 *
 * Pure on purpose: no Prisma, no request objects, so both routes can use it directly.
 */

export const CONTENT_TYPES = ["PROMO", "CLIPPING", "UGC", "ORIGINAL"];

/**
 * Tokens a bag can be budgeted in, and the smallest budget worth creating in each.
 *
 * Re-exported from `lib/campaigns/limits.ts`, which owns the numbers. It lives there rather than
 * here because this module pulls in the Solana address validator, and the forms that have to state
 * the same minimum are Client Components — importing the minimum from here would have dragged the
 * Solana SDK into the admin portal's bundle to read one integer.
 */
export { MIN_BUDGET } from "./limits";

/** The payment models the form offers. */
export const PAYMENT_MODELS = ["FIXED", "RPM", "HYBRID"] as const;

/** The mints the picker offers by name, so the server agrees with the UI. */
export const KNOWN_TOKENS: Record<
  string,
  { mint: string; symbol: string; name: string; decimals: number }
> = {
  USDC: {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
  SOL: {
    // The wrapped-SOL mint: a plain SOL transfer is not an SPL transfer, so campaign money
    // is denominated in wSOL for the payout path to be the same as every other token.
    mint: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
  },
};

export type TokenSpec =
  | {
      ok: true;
      kind: "USDC" | "SOL" | "CUSTOM";
      mint: string;
      symbol: string;
      name: string;
      decimals: number;
      logoUrl: string | null;
    }
  | { ok: false; error: string };

export function num(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function budgetIsSane(budget: number, kind: string): boolean {
  if (!num(budget) || budget <= 0) return false;
  const min = MIN_BUDGET[kind] ?? 0;
  return min === 0 ? budget > 0 : budget >= min;
}

/** Reads `null`/`""` as "no limit" rather than as zero, which would mean "no slots". */
export function readOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
}

/**
 * The per-post ceiling for a payment model.
 *
 * FIXED pays `fixedFee` per post, so the fee *is* the ceiling. RPM and HYBRID scale with
 * views, so they need an explicit cap; without one a single viral post would take the whole
 * budget, so HYBRID/RPM without a cap fall back to "the whole budget", which the caller
 * then rejects as too small a slot count to be meaningful.
 */
export function resolveCeiling(
  paymentModel: string,
  fixedFee: number | null,
  maxPayout: number | null,
  ratePer1k: number,
): number {
  if (paymentModel === "FIXED" || paymentModel === "HYBRID") {
    return num(fixedFee) && fixedFee > 0 ? fixedFee : num(maxPayout) ? maxPayout : 0;
  }
  if (num(maxPayout) && maxPayout > 0) return maxPayout;
  // A sensible default cap: 25,000 views' worth.
  return ratePer1k * 25;
}

/** Validates the token the bag is budgeted in and normalises its metadata. */
export function readToken(raw: unknown): TokenSpec {
  const input = (raw ?? {}) as Record<string, unknown>;
  const kind = String(input.kind ?? "").toUpperCase();

  if (kind === "USDC" || kind === "SOL") {
    const token = KNOWN_TOKENS[kind];
    return { ok: true, kind, ...token, logoUrl: null };
  }

  if (kind === "CUSTOM") {
    const mint = String(input.mint ?? "").trim();
    if (!isValidSolanaAddress(mint)) {
      return { ok: false, error: "Paste a valid token contract address" };
    }
    // The client resolves the symbol/decimals from the chain before posting. If it could
    // not, we cannot guess: paying a token with the wrong decimals is off by orders of
    // magnitude, so it is an error rather than a default.
    const symbol = String(input.symbol ?? "").trim().toUpperCase().slice(0, 12);
    const decimals = Number(input.decimals);
    if (!symbol) {
      return { ok: false, error: "Could not read that token's symbol — check the address" };
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
      return { ok: false, error: "Could not read that token's decimals — check the address" };
    }
    return {
      ok: true,
      kind: "CUSTOM",
      mint,
      symbol,
      name: String(input.name ?? "").trim() || symbol,
      decimals,
      logoUrl:
        typeof input.logoUrl === "string" && input.logoUrl.startsWith("http")
          ? input.logoUrl
          : null,
    };
  }

  return { ok: false, error: "Choose a token to budget in" };
}

/**
 * Banner artwork: either an absolute http(s) URL or a path to artwork we stored ourselves.
 *
 * The value goes straight into an `<img src>`, so a `data:` or `javascript:` scheme would be
 * an injection vector on every card in the marketplace. Anything that is not one of those two
 * shapes becomes null, which falls back to the token-colour wash rather than breaking the card.
 */
export function normaliseBannerUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;

  // Our own uploads, referenced by id. The prefix is checked exactly, so a path can never
  // point somewhere else on the origin.
  if (value.startsWith("/api/uploads/banner/")) {
    return value.length > "/api/uploads/banner/".length ? value : null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** How far ahead a bag may be scheduled, however it is scheduled. */
export const MAX_DURATION_DAYS = 730;

/**
 * Resolves a bag's end date from an explicit `endsAt` (ISO date) or a `durationDays` count.
 *
 * The console's form sends a date — an operator scheduling a campaign thinks in terms of "it
 * ends on the 14th", not "it runs for 23 days" — but the day count stays supported so the admin
 * API speaks the same language as the publisher flow.
 */
export function resolveEndsAt(
  body: Record<string, unknown>,
  errors: string[],
): Date | null {
  const raw = body.endsAt;
  if (typeof raw === "string" && raw.trim()) {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      errors.push("End date is not a valid date");
      return null;
    }
    const days = (date.getTime() - Date.now()) / 86_400_000;
    if (days < 1) errors.push("End date must be in the future");
    else if (days > MAX_DURATION_DAYS)
      errors.push(`End date must be within ${MAX_DURATION_DAYS} days`);
    return date;
  }

  const days = Number(body.durationDays ?? 0);
  if (!Number.isFinite(days) || days < 3 || days > MAX_DURATION_DAYS) {
    errors.push(`Duration must be between 3 and ${MAX_DURATION_DAYS} days`);
    return null;
  }
  return new Date(Date.now() + days * 86_400_000);
}

/** `null`/`""` means "not set"; anything else must at least be a finite number. */
export function readOptionalNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** How many creators a budget can carry — the formula both authoring routes share. */
export function slotsFor(budget: number, perPostCeiling: number): number {
  return Math.max(1, Math.min(2000, Math.floor(budget / perPostCeiling)));
}

/**
 * Validates and normalises a whole bag from a request body: everything an operator types in
 * the console's create/edit form.
 *
 * Deliberately all-or-nothing. The console submits the complete form on every save, so treating
 * a partial body as "keep the rest" would let one field's typo silently blank every field the
 * caller omitted. Routes that only need to change *some* fields (pause, end, budget tweaks)
 * build their own patch instead.
 *
 * Returns the normalised values plus the derived per-post ceiling, or the joined error string
 * every caller turns into a 400.
 */
export function readAuthoring(body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const projectName = String(body.projectName ?? "").trim();
  const platforms = normalizePlatforms(body.platforms);
  const bannerUrl = normaliseBannerUrl(body.bannerUrl);
  const contentType = String(body.contentType ?? "PROMO").toUpperCase();
  const chain = String(body.chain ?? "solana").toLowerCase();
  const paymentModel = String(body.paymentModel ?? "").toUpperCase();
  const budget = Number(body.budget);
  const fixedFee = readOptionalNum(body.fixedFee);
  const maxPayout = readOptionalNum(body.maxPayout);
  const ratePer1k = Number(body.ratePer1k ?? 0);
  const maxSubmissions = readOptionalInt(body.maxSubmissions);
  const maxPerCreator = readOptionalInt(body.maxPerCreator);

  const errors: string[] = [];
  const endsAt = resolveEndsAt(body, errors);
  const token = readToken(body.token);
  if (!token.ok) return { ok: false as const, error: token.error };

  if (title.length < 4) errors.push("Bag title must be at least 4 characters");
  if (description.length < 20) errors.push("Campaign brief must be at least 20 characters");
  if (platforms.length === 0) errors.push("Select at least one platform");
  if (!CONTENT_TYPES.includes(contentType)) errors.push("contentType is invalid");
  if (chain !== "solana")
    errors.push(`Chain "${chain}" is not supported yet — only Solana is live`);
  if (!budgetIsSane(budget, token.kind)) {
    errors.push(
      token.kind === "CUSTOM"
        ? "Budget must be greater than zero"
        : `Budget must be at least ${MIN_BUDGET[token.kind]} ${token.symbol}`,
    );
  }
  if (!(PAYMENT_MODELS as readonly string[]).includes(paymentModel)) {
    errors.push("Payment model must be FIXED, RPM or HYBRID");
  }

  // The per-post ceiling is what stops one viral post eating a whole bag, and it is what the
  // slot count is derived from. Same rule the publisher flow applies, so a bag created here
  // cannot be one the payout path is unable to price.
  const perPostCeiling = resolveCeiling(paymentModel, fixedFee, maxPayout, ratePer1k);
  if (!Number.isFinite(perPostCeiling) || perPostCeiling <= 0)
    errors.push("Set a payout amount (or a per-post cap) greater than zero");
  else if (perPostCeiling > budget)
    errors.push("Payout per post cannot exceed the total budget");
  if ((paymentModel === "RPM" || paymentModel === "HYBRID") && !(ratePer1k > 0))
    errors.push("Set a reward per 1,000 views greater than zero");
  if (paymentModel === "HYBRID" && !(fixedFee && fixedFee > 0))
    errors.push("Hybrid needs a flat fee per post as well as the per-1K rate");
  if (maxSubmissions !== null && maxSubmissions < 1)
    errors.push("Max submissions must be at least 1");
  if (maxPerCreator !== null && maxPerCreator < 1)
    errors.push("Max per creator must be at least 1");
  if (maxSubmissions !== null && maxPerCreator !== null && maxPerCreator > maxSubmissions)
    errors.push("Max per creator cannot exceed max submissions");

  if (errors.length) return { ok: false as const, error: errors.join("; ") };

  return {
    ok: true as const,
    title,
    description,
    projectName,
    platforms,
    bannerUrl,
    contentType,
    chain,
    paymentModel,
    budget,
    fixedFee,
    ratePer1k,
    maxSubmissions,
    maxPerCreator,
    perPostCeiling,
    token,
    endsAt: endsAt as Date,
  };
}
